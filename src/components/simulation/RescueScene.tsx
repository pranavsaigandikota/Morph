import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Text, Line } from '@react-three/drei'
import { useMemo } from 'react'
import type { AgentPose, BuildingMap, HazardType } from '../../types/simulation'

const HAZARD_COLOR: Record<HazardType, string> = {
  fire: '#ef4444',
  smoke: '#94a3b8',
  chemical: '#a3e635',
  collapse: '#f5a623',
}

interface Props {
  map: BuildingMap
  agent: AgentPose
  showLabels?: boolean
  /** Player trail */
  path?: Array<{ x: number; y: number }>
  /** Comparison trail (e.g. A*) */
  comparePath?: Array<{ x: number; y: number }>
  pathColor?: string
  compareColor?: string
  /** Lock orbit for playable missions */
  interactiveCamera?: boolean
}

function Walls({ map }: { map: BuildingMap }) {
  const walls = useMemo(
    () => map.cells.filter((c) => c.type === 'wall'),
    [map],
  )
  return (
    <group>
      {walls.map((c) => (
        <mesh key={`w-${c.x}-${c.y}`} position={[c.x + 0.5, 0.6, c.y + 0.5]} castShadow>
          <boxGeometry args={[0.95, 1.2, 0.95]} />
          <meshStandardMaterial color="#2a3544" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function Hazards({ map }: { map: BuildingMap }) {
  return (
    <group>
      {map.hazards.map((h, i) => (
        <mesh key={`h-${i}`} position={[h.x + 0.5, 0.35, h.y + 0.5]}>
          <cylinderGeometry args={[0.35, 0.35, 0.7, 12]} />
          <meshStandardMaterial
            color={HAZARD_COLOR[h.type]}
            emissive={HAZARD_COLOR[h.type]}
            emissiveIntensity={0.35 + h.intensity * 0.4}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  )
}

function Exits({ map }: { map: BuildingMap }) {
  return (
    <group>
      {map.exits.map((e) => (
        <group key={`e-${e.x}-${e.y}`} position={[e.x + 0.5, 0, e.y + 0.5]}>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={0.4} />
          </mesh>
          <Text
            position={[0, 1.4, 0]}
            fontSize={0.35}
            color="#34d399"
            anchorX="center"
            anchorY="middle"
          >
            {e.label}
          </Text>
        </group>
      ))}
    </group>
  )
}

function AgentMarker({ agent }: { agent: AgentPose }) {
  return (
    <group position={[agent.x + 0.5, 0, agent.y + 0.5]} rotation={[0, -agent.heading, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.35, 4, 8]} />
        <meshStandardMaterial color="#2ee6d6" emissive="#2ee6d6" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.55, 0.28]}>
        <boxGeometry args={[0.12, 0.12, 0.25]} />
        <meshStandardMaterial color="#e8eef5" />
      </mesh>
    </group>
  )
}

function Floor({ map }: { map: BuildingMap }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[map.width / 2, 0, map.height / 2]}
      receiveShadow
    >
      <planeGeometry args={[map.width, map.height]} />
      <meshStandardMaterial color="#141a22" />
    </mesh>
  )
}

function PathTrail({
  points,
  color,
  y = 0.12,
}: {
  points: Array<{ x: number; y: number }>
  color: string
  y?: number
}) {
  const pts = useMemo(
    () => points.map((p) => [p.x + 0.5, y, p.y + 0.5] as [number, number, number]),
    [points, y],
  )
  if (pts.length < 2) return null
  return <Line points={pts} color={color} lineWidth={2.5} transparent opacity={0.9} />
}

export function RescueScene({
  map,
  agent,
  path,
  comparePath,
  pathColor = '#2ee6d6',
  compareColor = '#f5a623',
  interactiveCamera = true,
}: Props) {
  const camX = map.width / 2
  const camZ = map.height / 2 + 8

  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-line bg-ink">
      <Canvas
        shadows
        camera={{ position: [camX, 14, camZ], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0a0e14']} />
        <ambientLight intensity={0.45} />
        <directionalLight
          castShadow
          position={[map.width, 18, map.height / 2]}
          intensity={1.1}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Floor map={map} />
        <Walls map={map} />
        <Hazards map={map} />
        <Exits map={map} />
        {comparePath && <PathTrail points={comparePath} color={compareColor} y={0.1} />}
        {path && <PathTrail points={path} color={pathColor} y={0.16} />}
        <AgentMarker agent={agent} />
        <Grid
          position={[map.width / 2, 0.01, map.height / 2]}
          args={[map.width, map.height]}
          cellSize={1}
          cellThickness={0.6}
          sectionSize={4}
          sectionThickness={1.1}
          cellColor="#243040"
          sectionColor="#2ee6d6"
          fadeDistance={40}
          infiniteGrid={false}
        />
        {interactiveCamera && (
          <OrbitControls
            target={[map.width / 2, 0, map.height / 2]}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={6}
            maxDistance={40}
          />
        )}
      </Canvas>
    </div>
  )
}
