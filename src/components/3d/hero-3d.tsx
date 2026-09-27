import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Float, MeshDistortMaterial, Sparkles, Trail } from '@react-three/drei'
import { Color, MathUtils } from 'three'
import type { Group, Mesh, Points } from 'three'
import { usePointerReactive } from '@/lib/use-pointer-reactive'

type PointerRef = { current: { x: number; y: number; active: boolean } }

/* ——— Camera drift: the whole viewpoint leans toward the pointer ——— */
function CameraRig({ pointer, reactive }: { pointer: PointerRef; reactive: boolean }) {
  const { camera } = useThree()
  useFrame(() => {
    if (!reactive) return
    const { x, y, active } = pointer.current
    const tx = active ? x * 0.9 : 0
    const ty = active ? -y * 0.55 : 0
    camera.position.x = MathUtils.lerp(camera.position.x, tx, 0.035)
    camera.position.y = MathUtils.lerp(camera.position.y, ty, 0.035)
    camera.lookAt(0, 0, 0)
  })
  return null
}

/* ——— The planet: distortion material = liquid, living surface ——— */
function Planet({ pointer, reactive, frozen, opacity = 1 }: { pointer: PointerRef; reactive: boolean; frozen: boolean; opacity?: number }) {
  const mesh = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)
  useFrame((_, delta) => {
    if (frozen || !mesh.current) return
    mesh.current.rotation.y += delta * 0.18
    mesh.current.rotation.z += delta * 0.05
    const target = hovered ? 1.14 : reactive && pointer.current.active ? 1.04 : 1
    mesh.current.scale.setScalar(MathUtils.lerp(mesh.current.scale.x, target, 0.07))
  })
  return (
    <mesh
      ref={mesh}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[1.5, 64, 64]} />
      <MeshDistortMaterial
        color={new Color('#6d28d9')}
        emissive={new Color('#4c1d95')}
        emissiveIntensity={0.4}
        distort={hovered ? 0.5 : 0.32}
        speed={2.2}
        roughness={0.25}
        metalness={0.55}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

/* ——— Parallax tilted rings at different depths ——— */
function Ring({ radius, speed, tilt, color, frozen, thickness = 0.02 }: { radius: number; speed: number; tilt: number; color: string; frozen: boolean; thickness?: number }) {
  const group = useRef<Group>(null)
  useFrame((_, delta) => {
    if (frozen || !group.current) return
    group.current.rotation.z += delta * speed
  })
  return (
    <group ref={group} rotation={[tilt, 0.4, 0]}>
      <mesh>
        <torusGeometry args={[radius, thickness, 16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

/* ——— Satellites with light trails orbiting the planet ——— */
function Satellite({ radius, speed, tilt, color, frozen, size = 0.09 }: { radius: number; speed: number; tilt: number; color: string; frozen: boolean; size?: number }) {
  const group = useRef<Group>(null)
  useFrame((state) => {
    if (frozen || !group.current) return
    group.current.rotation.z = state.clock.elapsedTime * speed
  })
  return (
    <group rotation={[tilt, 0.35, 0]}>
      <group ref={group}>
        <Trail width={2.2} length={5} color={color} attenuation={(w) => w * w}>
          <mesh position={[radius, 0, 0]}>
            <sphereGeometry args={[size, 20, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} roughness={0.2} />
          </mesh>
        </Trail>
      </group>
    </group>
  )
}

/* ——— Foreground glass shards floating between camera and planet (depth!) ——— */
function GlassShard({ position, rotation, scale, color, frozen }: { position: [number, number, number]; rotation: [number, number, number]; scale: number; color: string; frozen: boolean }) {
  const mesh = useRef<Mesh>(null)
  useFrame((state) => {
    if (frozen || !mesh.current) return
    const t = state.clock.elapsedTime
    mesh.current.rotation.x = rotation[0] + t * 0.15
    mesh.current.rotation.y = rotation[1] + t * 0.2
    mesh.current.position.y = position[1] + Math.sin(t * 0.6 + position[0] * 2) * 0.3
  })
  return (
    <mesh ref={mesh} position={position} scale={scale}>
      <octahedronGeometry args={[1, 0]} />
      <meshPhysicalMaterial
        color={color}
        transmission={0.75}
        thickness={0.6}
        roughness={0.1}
        metalness={0.1}
        transparent
        opacity={0.85}
      />
    </mesh>
  )
}

/* ——— Deep-field particles (far) + near-field sparkles (close) = parallax ——— */
function DeepField({ frozen }: { frozen: boolean }) {
  const points = useRef<Points>(null)
  const positions = useMemo(() => {
    const arr = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 40
      arr[i * 3 + 1] = (Math.random() - 0.5) * 22
      arr[i * 3 + 2] = -8 - Math.random() * 18
    }
    return arr
  }, [])
  useFrame((_, delta) => {
    if (frozen || !points.current) return
    points.current.rotation.y += delta * 0.02
  })
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a78bfa" size={0.035} transparent opacity={0.55} sizeAttenuation />
    </points>
  )
}

function Scene({ pointer, reactive, frozen, compact = false }: { pointer: PointerRef; reactive: boolean; frozen: boolean; compact?: boolean }) {
  const s = compact ? 0.85 : 1
  const Orbit = frozen ? 'group' : Float
  return (
    <group scale={s}>
      <CameraRig pointer={pointer} reactive={reactive} />
      <Orbit>
        <Planet pointer={pointer} reactive={reactive} frozen={frozen} />
        <Ring radius={2.6} speed={0.3} tilt={0.5} color="#c4b5fd" frozen={frozen} />
        <Ring radius={3.2} speed={-0.22} tilt={1.1} color="#818cf8" thickness={0.014} frozen={frozen} />
        <Ring radius={3.9} speed={0.15} tilt={0.2} color="#f0abfc" thickness={0.01} frozen={frozen} />
        <Satellite radius={2.6} speed={0.55} tilt={0.5} color="#34d399" frozen={frozen} />
        <Satellite radius={3.2} speed={-0.38} tilt={1.1} color="#fbbf24" size={0.07} frozen={frozen} />
        <Satellite radius={3.9} speed={0.28} tilt={0.2} color="#f0abfc" size={0.06} frozen={frozen} />
      </Orbit>
      {/* Foreground shards for genuine depth */}
      {!compact && (
        <>
          <GlassShard position={[-4.6, 1.8, 2.5]} rotation={[0.3, 0.5, 0]} scale={0.32} color="#a78bfa" frozen={frozen} />
          <GlassShard position={[4.9, -1.6, 1.8]} rotation={[0.8, 0.2, 0.4]} scale={0.24} color="#67e8f9" frozen={frozen} />
          <GlassShard position={[-5.2, -2.2, 1]} rotation={[0.1, 0.9, 0.2]} scale={0.18} color="#f0abfc" frozen={frozen} />
          <GlassShard position={[5.4, 2.2, -0.5]} rotation={[0.5, 0.1, 0.7]} scale={0.14} color="#34d399" frozen={frozen} />
        </>
      )}
      <Sparkles count={compact ? 60 : 120} scale={[13, 8, 8]} size={2.4} speed={frozen ? 0 : 0.3} color="#ddd6fe" />
      <DeepField frozen={frozen} />
      <ContactShadows position={[0, -3.4, 0]} opacity={0.4} blur={2.8} scale={14} color="#2e1065" />
    </group>
  )
}

/** Full-viewport interactive 3D backdrop (desktop). */
export function Hero3D() {
  const { pointer, reducedMotion } = usePointerReactive()
  const reactive = !reducedMotion
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 8.5], fov: 42 }}
        className="!absolute !inset-0"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 6]} intensity={1.5} color="#ede9fe" />
        <pointLight position={[-7, -5, 3]} intensity={0.9} color="#34d399" />
        <pointLight position={[7, 4, -4]} intensity={0.8} color="#f0abfc" />
        <Scene pointer={pointer} reactive={reactive} frozen={reducedMotion} />
      </Canvas>
    </div>
  )
}

/** Compact variant for small screens — same universe, tighter frame. */
export function Hero3DCompact({ className }: { className?: string }) {
  const { pointer, reducedMotion } = usePointerReactive()
  const reactive = !reducedMotion
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 7.5], fov: 46 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 8, 6]} intensity={1.3} color="#ede9fe" />
        <pointLight position={[-6, -4, 3]} intensity={0.7} color="#34d399" />
        <Scene pointer={pointer} reactive={reactive} compact frozen={reducedMotion} />
      </Canvas>
    </div>
  )
}