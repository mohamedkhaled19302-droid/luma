import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  ContactShadows,
  Float,
  Html,
  MeshDistortMaterial,
  OrbitControls,
  RoundedBox,
  Sparkles,
  Text,
  Trail,
} from '@react-three/drei'
import { Color, MathUtils } from 'three'
import type { Group, Mesh } from 'three'
import type { ScheduleBlock } from '@/types/models'
import { blockVisual } from '@/lib/block-visuals'

function blockMinutes(block: ScheduleBlock): number {
  const start = new Date(block.start_at).getTime()
  const end = new Date(block.end_at).getTime()
  return Math.max(15, Math.round((end - start) / 60000))
}

/* A schedule block as a glowing satellite with a light trail */
function OrbitBlock({
  block,
  index,
  total,
  frozen,
}: {
  block: ScheduleBlock
  index: number
  total: number
  frozen: boolean
}) {
  const orbit = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const minutes = blockMinutes(block)
  const size = 0.26 + Math.min(minutes / 240, 1) * 0.5
  const radius = 2.3 + (index % 3) * 0.85
  const baseAngle = (index / Math.max(total, 1)) * Math.PI * 2
  const speed = (block.completed ? 0.04 : 0.14) * (index % 2 === 0 ? 1 : -1)
  const color = blockVisual(block.block_type).hex
  const tilt = 0.15 + (index % 4) * 0.12

  useFrame((state) => {
    if (!orbit.current) return
    const t = frozen ? 0 : state.clock.elapsedTime * speed
    const angle = baseAngle + t
    orbit.current.position.set(
      Math.cos(angle) * radius,
      Math.sin(baseAngle * 2) * 0.6 + Math.sin(tilt) * 0.4,
      Math.sin(angle) * radius,
    )
    if (mesh.current) {
      const target = hovered ? size * 1.5 : size
      mesh.current.scale.setScalar(MathUtils.lerp(mesh.current.scale.x, target, 0.12))
    }
  })

  return (
    <group ref={orbit}>
      <Trail width={1.6} length={4} color={color} attenuation={(w) => w * w}>
        <mesh
          ref={mesh}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHovered(false)
            document.body.style.cursor = ''
          }}
        >
          <RoundedBox args={[1, 1, 1]} radius={0.2} smoothness={4}>
            <meshStandardMaterial
              color={color}
              roughness={0.2}
              metalness={0.4}
              emissive={color}
              emissiveIntensity={block.completed ? 0.08 : hovered ? 0.8 : 0.35}
              transparent
              opacity={block.skipped ? 0.4 : 1}
            />
          </RoundedBox>
        </mesh>
      </Trail>
      {hovered && (
        <Html distanceFactor={8} position={[0, size + 0.55, 0]} center>
          <div className="glass-strong pointer-events-none w-48 rounded-xl border p-3 text-left shadow-2xl">
            <p className="truncate text-xs font-bold text-popover-foreground">{block.title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {new Date(block.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {new Date(block.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' · '}
              {minutes} min
            </p>
            <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
              style={{ backgroundColor: color + '25', color }}>
              {block.completed ? '✓ done' : block.skipped ? 'skipped' : block.block_type}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

/* The center planet — distortion material makes it feel alive */
function CorePlanet({ frozen }: { frozen: boolean }) {
  const mesh = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (mesh.current && !frozen) mesh.current.rotation.y += delta * 0.15
  })
  return (
    <group>
      <mesh ref={mesh}>
        <sphereGeometry args={[1.1, 64, 64]} />
        <MeshDistortMaterial
          color={new Color('#5b21b6')}
          emissive={new Color('#4c1d95')}
          emissiveIntensity={0.35}
          distort={0.28}
          speed={1.8}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>
      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[1.25, 32, 32]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.08} side={2} />
      </mesh>
      {/* Wireframe orbit guide */}
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.3, 0.008, 8, 100]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.25} />
      </mesh>
      <mesh rotation={[Math.PI / 2.8, 0, 0.3]}>
        <torusGeometry args={[3.15, 0.008, 8, 100]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.18} />
      </mesh>
      <Suspense fallback={null}>
        <Text position={[0, 0, 1.16]} fontSize={0.2} color="#e9d5ff" anchorX="center" anchorY="middle" fontWeight={700}>
          TODAY
        </Text>
      </Suspense>
    </group>
  )
}

export interface DayOrbit3DProps {
  blocks: ScheduleBlock[]
  frozen?: boolean
  className?: string
}

export function DayOrbit3D({ blocks, frozen = false, className }: DayOrbit3DProps) {
  const visible = useMemo(() => blocks.slice(0, 14), [blocks])
  return (
    <div
      className={className}
      role="img"
      aria-label={`3D overview of ${visible.length} schedule blocks today`}
      style={{
        background:
          'radial-gradient(ellipse at 50% 60%, hsl(262 60% 12% / 0.06) 0%, transparent 70%)',
      }}
    >
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 3, 7], fov: 44 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 6]} intensity={1.6} color="#ede9fe" />
        <pointLight position={[-6, -3, 4]} intensity={0.8} color="#34d399" />
        <pointLight position={[6, 5, -4]} intensity={0.7} color="#f0abfc" />
        <Float speed={frozen ? 0 : 1.2} rotationIntensity={frozen ? 0 : 0.3} floatIntensity={frozen ? 0 : 0.7}>
          <CorePlanet frozen={frozen} />
        </Float>
        {visible.map((block, i) => (
          <OrbitBlock key={block.id} block={block} index={i} total={visible.length} frozen={frozen} />
        ))}
        <Sparkles count={80} scale={[10, 6, 10]} size={1.8} speed={frozen ? 0 : 0.25} color="#c4b5fd" />
        <ContactShadows position={[0, -3.2, 0]} opacity={0.45} blur={3} scale={14} color="#1e1b4b" />
        <OrbitControls
          enablePan={false}
          minDistance={3.5}
          maxDistance={12}
          enableDamping
          dampingFactor={0.06}
          autoRotate={!frozen}
          autoRotateSpeed={0.4}
        />
      </Canvas>
    </div>
  )
}