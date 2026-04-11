import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

// Trade routes from Mexico to the world
const ROUTES = [
  { from: [19.4, -99.1], to: [40.7, -74.0], color: '#3B82F6' },    // MX → NYC
  { from: [19.4, -99.1], to: [51.5, -0.1], color: '#06B6D4' },     // MX → London
  { from: [19.4, -99.1], to: [31.2, 121.5], color: '#06B6D4' },    // MX → Shanghai
  { from: [19.4, -99.1], to: [35.7, 139.7], color: '#10B981' },    // MX → Tokyo
  { from: [19.4, -99.1], to: [50.1, 8.7], color: '#F59E0B' },      // MX → Frankfurt
  { from: [19.4, -99.1], to: [-23.5, -46.6], color: '#818CF8' },   // MX → São Paulo
  { from: [19.4, -99.1], to: [37.6, 127.0], color: '#22D3EE' },    // MX → Seoul
  { from: [19.4, -99.1], to: [25.3, 55.3], color: '#F59E0B' },     // MX → Dubai
];

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createArcCurve(from: number[], to: number[], radius: number): THREE.CatmullRomCurve3 {
  const start = latLonToVec3(from[0], from[1], radius);
  const end = latLonToVec3(to[0], to[1], radius);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mid.normalize().multiplyScalar(radius * 1.4);
  return new THREE.CatmullRomCurve3([start, mid, end]);
}

// Animated trade route
function TradeRoute({ from, to, color, delay }: { from: number[]; to: number[]; color: string; delay: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => createArcCurve(from, to, 1.01), [from, to]);
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 64, 0.003, 8, false), [curve]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    const t = ((clock.getElapsedTime() - delay) % 4) / 4;
    mat.opacity = t < 0 ? 0 : Math.sin(t * Math.PI) * 0.7;
  });

  return (
    <mesh ref={ref} geometry={tubeGeo}>
      <meshBasicMaterial color={color} transparent opacity={0} />
    </mesh>
  );
}

// Glowing dot at a location
function TradeNode({ lat, lon, color, size = 0.015 }: { lat: number; lon: number; color: string; size?: number }) {
  const pos = useMemo(() => latLonToVec3(lat, lon, 1.015), [lat, lon]);
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const scale = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.3;
    ref.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={ref} position={pos}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

// Globe wireframe grid
function GlobeGrid() {
  const gridLines = useMemo(() => {
    const lines: THREE.BufferGeometry[] = [];

    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = 0; lon <= 360; lon += 5) {
        pts.push(latLonToVec3(lat, lon - 180, 1.002));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      lines.push(geo);
    }

    // Longitude lines
    for (let lon = 0; lon < 360; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        pts.push(latLonToVec3(lat, lon - 180, 1.002));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      lines.push(geo);
    }

    return lines;
  }, []);

  return (
    <group>
      {gridLines.map((geo, i) => (
        <primitive key={i} object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#3B82F6', transparent: true, opacity: 0.06 }))} />
      ))}
    </group>
  );
}

// Atmosphere glow
function Atmosphere() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.0003;
    }
  });

  return (
    <mesh ref={ref} scale={1.15}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshBasicMaterial color="#3B82F6" transparent opacity={0.03} side={THREE.BackSide} />
    </mesh>
  );
}

// Main globe
function GlobeScene() {
  const globeRef = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const { size } = useThree();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / size.width - 0.5) * 0.3;
      mouse.current.y = (e.clientY / size.height - 0.5) * 0.3;
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [size]);

  useFrame(() => {
    if (!globeRef.current) return;
    // Slow auto-rotation
    globeRef.current.rotation.y += 0.001;
    // Mouse follow
    globeRef.current.rotation.x += (mouse.current.y * 0.5 - globeRef.current.rotation.x) * 0.02;
    globeRef.current.rotation.y += (mouse.current.x * 0.8 - (globeRef.current.rotation.y % (Math.PI * 2))) * 0.01;
  });

  return (
    <>
      {/* Stars background */}
      <Stars radius={100} depth={50} count={1500} factor={3} saturation={0} fade speed={0.5} />

      {/* Ambient light */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#E2E8F0" />
      <directionalLight position={[-3, -2, -3]} intensity={0.2} color="#3B82F6" />

      <Float speed={0.5} rotationIntensity={0.1} floatIntensity={0.3}>
        <group ref={globeRef}>
          {/* Solid dark sphere */}
          <mesh>
            <sphereGeometry args={[0.99, 64, 64]} />
            <meshStandardMaterial color="#0B1120" roughness={0.9} metalness={0.1} />
          </mesh>

          {/* Grid overlay */}
          <GlobeGrid />

          {/* Atmosphere glow */}
          <Atmosphere />

          {/* Outer atmosphere ring */}
          <mesh scale={1.25}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshBasicMaterial color="#3B82F6" transparent opacity={0.015} side={THREE.BackSide} />
          </mesh>

          {/* Trade routes */}
          {ROUTES.map((route, i) => (
            <TradeRoute key={i} from={route.from} to={route.to} color={route.color} delay={i * 0.5} />
          ))}

          {/* Trade nodes */}
          <TradeNode lat={19.4} lon={-99.1} color="#3B82F6" size={0.025} /> {/* Mexico City */}
          <TradeNode lat={40.7} lon={-74.0} color="#60A5FA" />
          <TradeNode lat={51.5} lon={-0.1} color="#06B6D4" />
          <TradeNode lat={31.2} lon={121.5} color="#06B6D4" />
          <TradeNode lat={35.7} lon={139.7} color="#10B981" />
          <TradeNode lat={50.1} lon={8.7} color="#F59E0B" />
          <TradeNode lat={-23.5} lon={-46.6} color="#818CF8" />
          <TradeNode lat={37.6} lon={127.0} color="#22D3EE" />
          <TradeNode lat={25.3} lon={55.3} color="#F59E0B" />
        </group>
      </Float>

      {/* Post-processing */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={0.8} radius={0.8} />
        <Vignette eskil={false} offset={0.1} darkness={0.8} />
      </EffectComposer>
    </>
  );
}

export function Globe3D() {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 2.8], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <GlobeScene />
      </Canvas>
    </div>
  );
}
