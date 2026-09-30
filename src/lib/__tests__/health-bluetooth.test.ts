import { describe, expect, it } from 'vitest'
import { parseCyclingPowerMeasurement, parseHeartRateMeasurement } from '../health-bluetooth'

/**
 * BLE payload decoding.
 *
 * The Heart Rate Measurement characteristic has optional trailing fields, and
 * getting the skip wrong produces numbers that look real but are garbage. These
 * tests pin the exact byte layouts, including the ones most straps actually
 * send (uint8 bpm, then RR intervals).
 */

function bytes(...values: number[]): DataView {
  return new DataView(new Uint8Array(values).buffer)
}

describe('parseHeartRateMeasurement', () => {
  it('reads a uint8 bpm with no optional fields', () => {
    const reading = parseHeartRateMeasurement(bytes(0x00, 0x50))
    expect(reading?.bpm).toBe(80)
    expect(reading?.rrIntervals).toEqual([])
    expect(reading?.sensorLocation).toBeNull()
  })

  it('rejects a uint16 rate above the plausibility ceiling', () => {
    // 0x0138 little-endian is 312 bpm, past the 240 bpm bound.
    expect(parseHeartRateMeasurement(bytes(0x01, 0x38, 0x01))).toBeNull()
  })

  it('reads a plausible uint16 bpm', () => {
    expect(parseHeartRateMeasurement(bytes(0x01, 0x4b, 0x00))?.bpm).toBe(75)
  })

  it('decodes the sensor location bits', () => {
    // bits 1-2 set to 01 (chest) => (flags & 0x06) >> 1 === 1
    expect(parseHeartRateMeasurement(bytes(0x02, 0x46))?.sensorLocation).toBe(1)
  })

  it('skips energy expended and then reads RR intervals in 1/1024 s', () => {
    // flags 0x18 = energy expended present + RR present. 0x0400 is 1024/1024 =
    // 1.0 s, 0x0800 is 2048/1024 = 2.0 s.
    const view = bytes(0x18, 0x46, 0xe8, 0x03, 0x00, 0x04, 0x00, 0x08)
    const reading = parseHeartRateMeasurement(view)
    expect(reading?.bpm).toBe(70)
    expect(reading?.rrIntervals[0]).toBeCloseTo(1.0, 3)
    expect(reading?.rrIntervals[1]).toBeCloseTo(2.0, 3)
  })

  it('reads RR intervals when energy expended is absent', () => {
    // flags 0x10 = RR present only
    const reading = parseHeartRateMeasurement(bytes(0x10, 0x46, 0x00, 0x04))
    expect(reading?.bpm).toBe(70)
    expect(reading?.rrIntervals).toEqual([1.0])
  })

  it('ignores a trailing odd byte rather than reading past the buffer', () => {
    const reading = parseHeartRateMeasurement(bytes(0x10, 0x46, 0x00))
    expect(reading?.rrIntervals).toEqual([])
  })

  it('rejects an empty or one-byte payload', () => {
    expect(parseHeartRateMeasurement(bytes())).toBeNull()
    expect(parseHeartRateMeasurement(bytes(0x00))).toBeNull()
  })

  it('accepts a high but plausible rate and rejects one above the ceiling', () => {
    // 226 bpm is inside the 25-240 bound, so it is kept.
    expect(parseHeartRateMeasurement(bytes(0x00, 0xe2))?.bpm).toBe(226)
    // 255 bpm is not, so it is discarded rather than stored.
    expect(parseHeartRateMeasurement(bytes(0x00, 0xff))).toBeNull()
    expect(parseHeartRateMeasurement(bytes(0x01, 0xe2, 0x03))).toBeNull() // 994 bpm
  })
})

describe('parseCyclingPowerMeasurement', () => {
  it('reads instantaneous power as a signed little-endian int16', () => {
    const view = new DataView(new Uint8Array([0x00, 0x00, 0xc8, 0x00]).buffer)
    expect(parseCyclingPowerMeasurement(view)?.watts).toBe(200)
  })

  it('accepts zero watts', () => {
    const view = new DataView(new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer)
    expect(parseCyclingPowerMeasurement(view)?.watts).toBe(0)
  })

  it('rejects negative and absurd values', () => {
    const negative = new DataView(new Int16Array([0, -100]).buffer)
    expect(parseCyclingPowerMeasurement(negative)).toBeNull()
    const absurd = new DataView(new Uint8Array([0x00, 0x00, 0x10, 0x27]).buffer)
    expect(parseCyclingPowerMeasurement(absurd)).toBeNull()
  })

  it('rejects a payload too short to hold a power field', () => {
    expect(parseCyclingPowerMeasurement(new DataView(new Uint8Array(3).buffer))).toBeNull()
  })
})
