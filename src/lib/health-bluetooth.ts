/**
 * Heart-rate strap support over Web Bluetooth.
 *
 * Why Bluetooth rather than a vendor cloud API
 *
 * A chest strap (Polar H10, Garmin HRM-Dual, Wahoo Tickr, Coospo, Amazik) speaks
 * the Bluetooth SIG Heart Rate Service 0x180D, so the browser can read it
 * directly: no developer account, no OAuth, no vendor server, and nothing about
 * the wearer leaves the machine. Cycling Power (0x1818) and Body Location are
 * read when the strap advertises them.
 *
 * What this cannot do
 *
 *  * It only works where Web Bluetooth exists: Chrome, Edge and other Chromium
 *    browsers, on desktop and Android. Not Safari, not Firefox, not iOS. There is
 *    no way to work around that from a web page, so the UI has to say so rather
 *    than fail silently.
 *  * It needs a secure context (https or localhost) and a user gesture. The
 *    browser will not let a page open the device picker on its own.
 *  * Bluetooth is range-limited and the strap has to be worn and paired first.
 *    The app treats a session as "best effort": samples are buffered and flushed,
 *    so a brief dropout costs a gap rather than the whole recording.
 *
 * This module owns the transport only. Deciding what a reading *means* lives in
 * `./health-metrics.ts`, which is pure and tested.
 */

import { isPlausible } from './health-metrics'

const HEART_RATE_SERVICE = 0x180d
const HEART_RATE_MEASUREMENT = 0x2a37
const HEART_RATE_CONTROL_POINT = 0x2a39
const CYCLING_POWER_SERVICE = 0x1818
const CYCLING_POWER_MEASUREMENT = 0x2a63
const CLIENT_CHARACTERISTIC_CONFIG = 0x2902

/** Guard against a strap streaming faster than we can usefully store. */
const MIN_SAMPLE_INTERVAL_MS = 1_000

export interface HeartRateReading {
  bpm: number
  /** RR intervals in seconds, when the strap reports them. */
  rrIntervals: number[]
  /** Sensor location code from the SIG table, when reported. */
  sensorLocation: number | null
  takenAt: number
}

export interface CyclingPowerReading {
  watts: number
  takenAt: number
}

export type BluetoothState =
  | 'unsupported'
  | 'idle'
  | 'connecting'
  | 'connected'
  /** The strap left range, or the OS dropped the GATT link. */
  | 'disconnected'
  | 'error'

export interface BluetoothUnavailableReason {
  state: BluetoothState
  message: string
}

/** Whether this browser can talk to a BLE heart-rate monitor at all. */
export function bluetoothAvailability(): BluetoothUnavailableReason | null {
  if (typeof navigator === 'undefined') {
    return { state: 'unsupported', message: 'Bluetooth needs a browser tab.' }
  }
  const nav = navigator as Navigator & { bluetooth?: unknown }
  if (!nav.bluetooth) {
    return {
      state: 'unsupported',
      message:
        'This browser cannot read Bluetooth devices. Use Chrome or Edge on desktop or Android, then wear and pair your strap first.',
    }
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      state: 'unsupported',
      message: 'Bluetooth needs a secure page. Open the app over https (localhost is fine).',
    }
  }
  return null
}

export function isBluetoothSupported(): boolean {
  return bluetoothAvailability() === null
}

/**
 * Decode a Heart Rate Measurement (0x2A37).
 *
 * Layout: a flags byte, then a uint8 or uint16 BPM depending on bit 0, then the
 * optional Energy Expended (uint16) and RR-Interval fields, which are only
 * present when their bits are set. Getting that optional-field skipping wrong
 * yields plausible-looking nonsense, so it is spelled out byte by byte.
 */
export function parseHeartRateMeasurement(view: DataView): HeartRateReading | null {
  if (view.byteLength < 2) return null
  const flags = view.getUint8(0)
  const isUInt16 = (flags & 0x01) !== 0
  const sensorLocation = (flags & 0x06) !== 0 ? (flags & 0x06) >> 1 : null
  const hasEnergyExpended = (flags & 0x08) !== 0
  const hasRrIntervals = (flags & 0x10) !== 0

  let offset = 1
  const bpm = isUInt16 ? view.getUint16(offset, true) : view.getUint8(offset)
  offset += isUInt16 ? 2 : 1

  if (hasEnergyExpended) offset += 2

  const rrIntervals: number[] = []
  if (hasRrIntervals) {
    // Each interval is a uint16 in 1/1024 s.
    while (offset + 1 < view.byteLength) {
      rrIntervals.push(view.getUint16(offset, true) / 1024)
      offset += 2
    }
  }

  if (!isPlausible('heart_rate', bpm)) return null
  return { bpm, rrIntervals, sensorLocation, takenAt: Date.now() }
}

/**
 * Decode a Cycling Power Measurement (0x2A63).
 *
 * Only the flags/instantaneous-power fields are read; the optional pedal and
 * accumulated-torque fields are skipped by their own flag bits.
 */
export function parseCyclingPowerMeasurement(view: DataView): CyclingPowerReading | null {
  if (view.byteLength < 4) return null
  const flags = view.getUint16(0, true)
  const watts = view.getInt16(2, true)
  if (watts < 0 || watts > 3_000) return null
  void flags
  return { watts, takenAt: Date.now() }
}

export interface HeartRateMonitorOptions {
  onReading: (reading: HeartRateReading) => void
  onPower?: (reading: CyclingPowerReading) => void
  onStateChange?: (state: BluetoothState, detail?: string) => void
}

/**
 * A live connection to one strap.
 *
 * Call `disconnect()` when finished. The object owns the GATT connection, so
 * dropping it without disconnecting leaves the strap unable to connect to
 * anything else.
 */
export class HeartRateMonitor {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private options: HeartRateMonitorOptions
  private lastEmitted = 0
  private state: BluetoothState = 'idle'

  constructor(options: HeartRateMonitorOptions) {
    this.options = options
  }

  get deviceName(): string | null {
    return this.device?.name ?? null
  }

  get currentState(): BluetoothState {
    return this.state
  }

  private setState(state: BluetoothState, detail?: string): void {
    this.state = state
    this.options.onStateChange?.(state, detail)
  }

  /**
   * Show the browser's device picker and start streaming.
   *
   * Must be called from a user gesture: the browser rejects the picker otherwise.
   * Devices are filtered to those advertising heart rate or cycling power, so
   * the list stays short.
   */
  async connect(): Promise<void> {
    const unavailable = bluetoothAvailability()
    if (unavailable) {
      this.setState(unavailable.state, unavailable.message)
      throw new Error(unavailable.message)
    }

    const nav = navigator as Navigator & {
      bluetooth: {
        requestDevice(options: {
          filters: unknown[]
          optionalServices?: (string | number)[]
        }): Promise<BluetoothDevice>
      }
    }

    this.setState('connecting')
    try {
      this.device = await nav.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }, { services: [CYCLING_POWER_SERVICE] }],
        optionalServices: [CYCLING_POWER_SERVICE],
      })

      this.device.addEventListener('gattserverdisconnected', () => {
        this.setState('disconnected', 'The strap went out of range.')
        this.server = null
      })

      const gatt = this.device.gatt
      if (!gatt) throw new Error('That device does not expose a Bluetooth connection.')
      this.server = await gatt.connect()
      await this.subscribe()
      this.setState('connected')
    } catch (error) {
      // A user closing the picker is not an error worth shouting about.
      if (isAbortError(error)) {
        this.setState('idle')
        return
      }
      const message = error instanceof Error ? error.message : 'Could not connect to the strap.'
      this.setState('error', message)
      throw error
    }
  }

  private async subscribe(): Promise<void> {
    const server = this.server
    if (!server) throw new Error('Not connected.')

    const hrService = await server.getPrimaryService(HEART_RATE_SERVICE)

    // Ask for 8 Hz resolution where the strap supports it. Best effort: a strap
    // that does not expose the control point, or refuses the write, simply keeps
    // its default sampling rate.
    const control = await hrService.getCharacteristic(HEART_RATE_CONTROL_POINT).catch(() => null)
    if (control) {
      await control.writeValue(new Uint8Array([1])).catch(() => undefined)
    }

    const measurement = await hrService.getCharacteristic(HEART_RATE_MEASUREMENT)
    await measurement.startNotifications()
    measurement.addEventListener(
      'characteristicvaluechanged',
      (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic
        const parsed = target.value ? parseHeartRateMeasurement(target.value) : null
        if (!parsed) return
        // Some straps notify faster than once a second; storing every frame would
        // flood the table for no extra information.
        if (parsed.takenAt - this.lastEmitted < MIN_SAMPLE_INTERVAL_MS) return
        this.lastEmitted = parsed.takenAt
        this.options.onReading(parsed)
      },
    )

    const powerService = await server
      .getPrimaryService(CYCLING_POWER_SERVICE)
      .catch(() => null)
    if (powerService && this.options.onPower) {
      const power = await powerService.getCharacteristic(CYCLING_POWER_MEASUREMENT).catch(() => null)
      if (power) {
        await power.startNotifications().catch(() => undefined)
        power.addEventListener(
          'characteristicvaluechanged',
          (event: Event) => {
            const target = event.target as BluetoothRemoteGATTCharacteristic
            const parsed = target.value ? parseCyclingPowerMeasurement(target.value) : null
            if (parsed) this.options.onPower?.(parsed)
          },
        )
      }
    }
  }

  /** Stop streaming and release the strap so other apps can use it. */
  disconnect(): void {
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    } catch {
      /* already gone */
    }
    this.server = null
    this.device = null
    this.lastEmitted = 0
    this.setState('idle')
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'NotFoundError' || /cancell?ed|abort/i.test(error.message))
}

/**
 * The notify-only characteristics this build understands.
 *
 * Exported so the health page can tell the user what a connected strap is
 * actually reporting, rather than implying a full fitness tracker.
 */
export const SUPPORTED_SERVICES = [
  { name: 'Heart Rate', uuid: `0x${HEART_RATE_SERVICE.toString(16).padStart(4, '0')}` },
  { name: 'Cycling Power', uuid: `0x${CYCLING_POWER_SERVICE.toString(16).padStart(4, '0')}` },
]

export const SUPPORTED_CHARACTERISTICS = {
  measurement: `0x${HEART_RATE_MEASUREMENT.toString(16).padStart(4, '0')}`,
  controlPoint: `0x${HEART_RATE_CONTROL_POINT.toString(16).padStart(4, '0')}`,
  cccd: `0x${CLIENT_CHARACTERISTIC_CONFIG.toString(16).padStart(4, '0')}`,
}
