"use client";

import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useMemo, useCallback } from "react";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface AgentData {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  eoa: string;
  status: string;
  collections_count: number;
}

interface Scene3DProps {
  agents: AgentData[];
  selectedAgent: AgentData | null;
  onSelectAgent: (agent: AgentData | null) => void;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ZONES = [
  { label: "/MINT", x: -7, z: -5, color: "#06b6d4" },
  { label: "/TRADE", x: 0, z: -5, color: "#10b981" },
  { label: "/DEPLOY", x: 7, z: -5, color: "#8b5cf6" },
  { label: "/VERIFY", x: -7, z: 5, color: "#eab308" },
  { label: "/COLLECT", x: 0, z: 5, color: "#ec4899" },
  { label: "/STAKE", x: 7, z: 5, color: "#f97316" },
];

const ZW = 5, ZD = 4.5, WH = 1.1, WT = 0.08;

const NPC_NAMES = [
  "TraderBot", "MintMaster", "DeployAI", "VerifyNode",
  "StakeAgent", "SwapBot_77", "YieldFarm", "NFT_Scout",
  "BlockRun", "ChainWalk", "DataMiner", "Nomad_X",
  "TokenSmith", "BridgeBot", "GasHelper", "AirdropAI",
  "OracleBot", "FlashLoan", "MEV_Agent", "ArbitBot",
  "LiqBot", "WhaleWatch", "AlphaFind", "SnipeBot",
];

const _v3 = new THREE.Vector3();

// Shared agent position registry for interaction beams
const agentPosRegistry = new Map<number, THREE.Vector3>();

// ═══════════════════════════════════════════════════════════════
// TEXTURE HELPERS
// ═══════════════════════════════════════════════════════════════

function makeLabelTex(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 56;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgba(0,0,0,0.88)";
  x.fillRect(0, 0, 256, 56);
  x.strokeStyle = color;
  x.lineWidth = 2;
  x.strokeRect(2, 2, 252, 52);
  x.font = "bold 22px monospace";
  x.fillStyle = color;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 128, 28);
  return new THREE.CanvasTexture(c);
}

function makeNameTex(name: string, verified: boolean) {
  const c = document.createElement("canvas");
  c.width = 200; c.height = 36;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgba(0,0,0,0.7)";
  x.fillRect(0, 0, 200, 36);
  x.font = "bold 13px monospace";
  x.fillStyle = verified ? "#10b981" : "#9ca3af";
  x.textAlign = "center";
  x.textBaseline = "middle";
  const d = name.length > 12 ? name.slice(0, 11) + ".." : name;
  x.fillText(d, 100, 18);
  return new THREE.CanvasTexture(c);
}

// ═══════════════════════════════════════════════════════════════
// GROUND
// ═══════════════════════════════════════════════════════════════

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[34, 24]} />
        <meshStandardMaterial color="#070b15" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[34, 24, 34, 24]} />
        <meshStandardMaterial color="#06b6d4" wireframe transparent opacity={0.035} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <planeGeometry args={[28, 0.04]} />
        <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.5} transparent opacity={0.3} />
      </mesh>
      {[-3.5, 3.5].map((xp) => (
        <mesh key={xp} rotation-x={-Math.PI / 2} position={[xp, 0.005, 0]}>
          <planeGeometry args={[0.04, 18]} />
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.5} transparent opacity={0.2} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// ZONE PLATFORM
// ═══════════════════════════════════════════════════════════════

function ZonePlatform({ label, x, z, color }: (typeof ZONES)[0]) {
  const tex = useMemo(() => makeLabelTex(label, color), [label, color]);
  const glowRef = useRef<THREE.Mesh>(null!);
  const hw = ZW / 2, hd = ZD / 2;

  useFrame(({ clock }) => {
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshStandardMaterial).opacity =
        0.1 + Math.sin(clock.elapsedTime * 1.5 + x * 0.5) * 0.04;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <planeGeometry args={[ZW, ZD]} />
        <meshStandardMaterial color="#0c1222" />
      </mesh>
      <mesh ref={glowRef} rotation-x={-Math.PI / 2} position-y={0.01}>
        <planeGeometry args={[ZW, ZD]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} transparent opacity={0.1} />
      </mesh>

      <mesh position={[0, WH / 2, -hd]}>
        <boxGeometry args={[ZW, WH, WT]} />
        <meshStandardMaterial color="#121a2e" transparent opacity={0.7} />
      </mesh>
      <mesh position={[-hw, WH / 2, 0]}>
        <boxGeometry args={[WT, WH, ZD]} />
        <meshStandardMaterial color="#121a2e" transparent opacity={0.7} />
      </mesh>
      <mesh position={[hw, WH / 2, 0]}>
        <boxGeometry args={[WT, WH, ZD]} />
        <meshStandardMaterial color="#121a2e" transparent opacity={0.7} />
      </mesh>
      <mesh position={[-(hw * 0.55), WH / 2, hd]}>
        <boxGeometry args={[hw * 0.5, WH, WT]} />
        <meshStandardMaterial color="#121a2e" transparent opacity={0.7} />
      </mesh>
      <mesh position={[(hw * 0.55), WH / 2, hd]}>
        <boxGeometry args={[hw * 0.5, WH, WT]} />
        <meshStandardMaterial color="#121a2e" transparent opacity={0.7} />
      </mesh>

      <mesh position={[0, WH + 0.01, -hd]}>
        <boxGeometry args={[ZW, 0.03, 0.03]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} />
      </mesh>
      <mesh position={[-hw, WH + 0.01, 0]}>
        <boxGeometry args={[0.03, 0.03, ZD]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} />
      </mesh>
      <mesh position={[hw, WH + 0.01, 0]}>
        <boxGeometry args={[0.03, 0.03, ZD]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} />
      </mesh>

      <sprite position={[0, WH + 0.45, 0]} scale={[2.2, 0.5, 1]}>
        <spriteMaterial map={tex} transparent depthTest={false} />
      </sprite>
      <pointLight position={[0, 1.5, 0]} color={color} intensity={0.5} distance={5} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOLOGRAPHIC DISPLAY (rotating wireframe per zone)
// ═══════════════════════════════════════════════════════════════

function HoloDisplay({ x, z, color, type }: { x: number; z: number; color: string; type: number }) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.6 + type;
      ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.4 + type) * 0.3;
      ref.current.position.y = 2.0 + Math.sin(clock.elapsedTime * 1.2 + type * 2) * 0.15;
      const s = 0.28 + Math.sin(clock.elapsedTime * 0.8 + type) * 0.04;
      ref.current.scale.setScalar(s);
    }
  });

  const geoProps: [number, number] = (() => {
    switch (type % 6) {
      case 0: return [1, 0]; // octahedron
      case 1: return [1, 1]; // icosahedron
      case 2: return [1, 0]; // dodecahedron
      case 3: return [1, 2]; // icosahedron detail 2
      case 4: return [1, 0]; // octahedron
      default: return [1, 1];
    }
  })();

  return (
    <mesh ref={ref} position={[x, 2.0, z]}>
      {type % 3 === 0 ? (
        <octahedronGeometry args={geoProps} />
      ) : type % 3 === 1 ? (
        <icosahedronGeometry args={geoProps} />
      ) : (
        <dodecahedronGeometry args={[1, 0]} />
      )}
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={1.5}
        wireframe
        transparent
        opacity={0.35}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// PULSE RINGS (expanding from zone centers)
// ═══════════════════════════════════════════════════════════════

function PulseRing({ x, z, color, delay }: { x: number; z: number; color: string; delay: number }) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (ref.current) {
      const t = (clock.elapsedTime * 0.3 + delay) % 1;
      const s = 0.5 + t * 3;
      ref.current.scale.set(s, s, 1);
      (ref.current.material as THREE.MeshStandardMaterial).opacity = (1 - t) * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={[x, 0.02, z]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.9, 1.0, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} transparent opacity={0.15} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCANNER DRONES
// ═══════════════════════════════════════════════════════════════

function ScannerDrone({ index }: { index: number }) {
  const gRef = useRef<THREE.Group>(null!);
  const lightRef = useRef<THREE.Mesh>(null!);
  const radius = 8 + index * 3;
  const height = 3.5 + index * 0.8;
  const speed = 0.15 + index * 0.05;

  useFrame(({ clock }) => {
    if (gRef.current) {
      const t = clock.elapsedTime * speed + index * Math.PI * 0.67;
      gRef.current.position.x = Math.cos(t) * radius;
      gRef.current.position.z = Math.sin(t) * radius;
      gRef.current.position.y = height + Math.sin(t * 2.5) * 0.4;
      gRef.current.rotation.y = t + Math.PI;
    }
    if (lightRef.current) {
      (lightRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(clock.elapsedTime * 6 + index) * 1;
    }
  });

  return (
    <group ref={gRef}>
      <mesh>
        <boxGeometry args={[0.2, 0.08, 0.12]} />
        <meshStandardMaterial color="#1a2540" emissive="#06b6d4" emissiveIntensity={0.3} />
      </mesh>
      <mesh ref={lightRef} position-y={-0.06}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={2} />
      </mesh>
      <pointLight position-y={-0.1} color="#06b6d4" intensity={0.4} distance={4} />
      {/* Scan beam */}
      <mesh position-y={-1.2}>
        <cylinderGeometry args={[0.01, 0.3, 2.2, 8]} />
        <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.5} transparent opacity={0.04} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// INTERACTION BEAMS (lines between nearby agents)
// ═══════════════════════════════════════════════════════════════

function InteractionBeams() {
  const groupRef = useRef<THREE.Group>(null!);
  const maxBeams = 6;

  const lines = useMemo(() => {
    const arr: THREE.Line[] = [];
    for (let i = 0; i < maxBeams; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: "#06b6d4", transparent: true, opacity: 0.3 });
      const l = new THREE.Line(g, mat);
      l.visible = false;
      l.frustumCulled = false;
      arr.push(l);
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    const entries = Array.from(agentPosRegistry.entries());
    let beamIdx = 0;

    for (let i = 0; i < entries.length && beamIdx < maxBeams; i++) {
      for (let j = i + 1; j < entries.length && beamIdx < maxBeams; j++) {
        const [, posA] = entries[i];
        const [, posB] = entries[j];
        const dist = posA.distanceTo(posB);
        if (dist < 2.0 && dist > 0.3) {
          const l = lines[beamIdx];
          const arr = l.geometry.attributes.position.array as Float32Array;
          arr[0] = posA.x; arr[1] = posA.y + 0.6; arr[2] = posA.z;
          arr[3] = posB.x; arr[4] = posB.y + 0.6; arr[5] = posB.z;
          l.geometry.attributes.position.needsUpdate = true;
          l.visible = true;
          (l.material as THREE.LineBasicMaterial).opacity =
            0.3 + Math.sin(clock.elapsedTime * 4 + beamIdx) * 0.15;
          beamIdx++;
        }
      }
    }

    for (let i = beamIdx; i < maxBeams; i++) {
      lines[i].visible = false;
    }
  });

  return (
    <group ref={groupRef}>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// WALKING AGENT FIGURE
// ═══════════════════════════════════════════════════════════════

interface WalkState {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
  zi: number;
  mode: "walk" | "idle";
  timer: number;
  spd: number;
}

function WalkingAgent({
  name, verified, index, isSelected, onClick,
}: {
  name: string;
  verified: boolean;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const gRef = useRef<THREE.Group>(null!);
  const lRef = useRef<THREE.Mesh>(null!);
  const rRef = useRef<THREE.Mesh>(null!);
  const aLRef = useRef<THREE.Mesh>(null!);
  const aRRef = useRef<THREE.Mesh>(null!);
  const hovered = useRef(false);
  const nTex = useMemo(() => makeNameTex(name, verified), [name, verified]);

  const ws = useRef<WalkState>(undefined as unknown as WalkState);
  if (!ws.current) {
    const zi = index % ZONES.length;
    const zn = ZONES[zi];
    const p = new THREE.Vector3(
      zn.x + (Math.random() - 0.5) * 3,
      0,
      zn.z + (Math.random() - 0.5) * 3
    );
    ws.current = {
      pos: p, tgt: p.clone(), zi,
      mode: "idle", timer: 1 + Math.random() * 4,
      spd: 1.2 + Math.random() * 0.6,
    };
    agentPosRegistry.set(index, p);
  }

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
    document.body.style.cursor = "pointer";
  }, []);

  const onPointerOut = useCallback(() => {
    hovered.current = false;
    document.body.style.cursor = "auto";
  }, []);

  useFrame(({ clock }, dt) => {
    const s = ws.current;
    const g = gRef.current;
    if (!g) return;

    if (s.mode === "idle") {
      s.timer -= dt;
      if (s.timer <= 0) {
        let nz: number;
        do { nz = Math.floor(Math.random() * ZONES.length); } while (nz === s.zi);
        s.zi = nz;
        const z = ZONES[nz];
        s.tgt.set(z.x + (Math.random() - 0.5) * 3.5, 0, z.z + (Math.random() - 0.5) * 3);
        s.mode = "walk";
      }
    }

    if (s.mode === "walk") {
      _v3.subVectors(s.tgt, s.pos);
      const d = _v3.length();
      if (d < 0.25) {
        s.pos.copy(s.tgt);
        s.mode = "idle";
        s.timer = 2 + Math.random() * 5;
      } else {
        _v3.normalize();
        s.pos.addScaledVector(_v3, Math.min(s.spd * dt, d));
        g.rotation.y = Math.atan2(_v3.x, _v3.z);
      }
      const wc = clock.elapsedTime * 7 + index * 1.3;
      g.position.y = Math.abs(Math.sin(wc)) * 0.04;
      if (lRef.current) lRef.current.rotation.x = Math.sin(wc) * 0.5;
      if (rRef.current) rRef.current.rotation.x = Math.sin(wc + Math.PI) * 0.5;
      if (aLRef.current) aLRef.current.rotation.x = Math.sin(wc + Math.PI) * 0.35;
      if (aRRef.current) aRRef.current.rotation.x = Math.sin(wc) * 0.35;
    } else {
      g.position.y *= 0.92;
      if (lRef.current) lRef.current.rotation.x *= 0.92;
      if (rRef.current) rRef.current.rotation.x *= 0.92;
      if (aLRef.current) aLRef.current.rotation.x *= 0.92;
      if (aRRef.current) aRRef.current.rotation.x *= 0.92;
    }

    g.position.x = s.pos.x;
    g.position.z = s.pos.z;
    agentPosRegistry.set(index, s.pos);
  });

  const isHighlight = isSelected || hovered.current;
  const bodyCol = verified ? "#06b6d4" : "#4b5563";
  const headCol = verified ? "#22d3ee" : "#6b7280";
  const legCol = "#0f172a";
  const ei = isHighlight ? 0.8 : verified ? 0.35 : 0.05;

  return (
    <group
      ref={gRef}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <mesh position-y={0.72}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={headCol} emissive={headCol} emissiveIntensity={ei} />
      </mesh>
      <mesh position-y={0.5}>
        <boxGeometry args={[0.22, 0.24, 0.1]} />
        <meshStandardMaterial color={bodyCol} emissive={bodyCol} emissiveIntensity={ei} />
      </mesh>
      <mesh position-y={0.32}>
        <boxGeometry args={[0.18, 0.14, 0.09]} />
        <meshStandardMaterial color={bodyCol} emissive={bodyCol} emissiveIntensity={ei * 0.5} />
      </mesh>
      <mesh ref={aLRef} position={[-0.15, 0.5, 0]}>
        <boxGeometry args={[0.04, 0.22, 0.04]} />
        <meshStandardMaterial color={bodyCol} />
      </mesh>
      <mesh ref={aRRef} position={[0.15, 0.5, 0]}>
        <boxGeometry args={[0.04, 0.22, 0.04]} />
        <meshStandardMaterial color={bodyCol} />
      </mesh>
      <mesh ref={lRef} position={[-0.05, 0.14, 0]}>
        <boxGeometry args={[0.05, 0.26, 0.05]} />
        <meshStandardMaterial color={legCol} />
      </mesh>
      <mesh ref={rRef} position={[0.05, 0.14, 0]}>
        <boxGeometry args={[0.05, 0.26, 0.05]} />
        <meshStandardMaterial color={legCol} />
      </mesh>
      <sprite position-y={0.98} scale={[1, 0.2, 1]}>
        <spriteMaterial map={nTex} transparent depthTest={false} />
      </sprite>
      {verified && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
          <ringGeometry args={[0.16, 0.2, 16]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1.5} transparent opacity={0.4} />
        </mesh>
      )}
      {isHighlight && <pointLight position-y={0.6} color="#06b6d4" intensity={2.5} distance={3.5} />}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA PACKETS (trade traffic between zones)
// ═══════════════════════════════════════════════════════════════

interface PacketState {
  fx: number; fz: number;
  tx: number; tz: number;
  prog: number;
  spd: number;
}

function DataPacket({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  const trailRef = useRef<THREE.Mesh>(null!);
  const ps = useRef<PacketState>(undefined as unknown as PacketState);
  if (!ps.current) {
    const fz = ZONES[index % ZONES.length];
    const tz = ZONES[(index + 1 + Math.floor(Math.random() * (ZONES.length - 1))) % ZONES.length];
    ps.current = {
      fx: fz.x, fz: fz.z, tx: tz.x, tz: tz.z,
      prog: Math.random(), spd: 0.12 + Math.random() * 0.2,
    };
  }

  useFrame((_, dt) => {
    const s = ps.current;
    s.prog += dt * s.spd;
    if (s.prog >= 1) {
      s.fx = s.tx; s.fz = s.tz;
      const nz = ZONES[Math.floor(Math.random() * ZONES.length)];
      s.tx = nz.x + (Math.random() - 0.5) * 2;
      s.tz = nz.z + (Math.random() - 0.5) * 2;
      s.prog = 0;
      s.spd = 0.12 + Math.random() * 0.22;
    }
    if (ref.current) {
      const p = s.prog;
      ref.current.position.x = s.fx + (s.tx - s.fx) * p;
      ref.current.position.z = s.fz + (s.tz - s.fz) * p;
      ref.current.position.y = 0.3 + Math.sin(p * Math.PI) * 3;
      ref.current.scale.setScalar(0.7 + Math.sin(p * Math.PI) * 0.5);
    }
    if (trailRef.current) {
      const p = Math.max(0, s.prog - 0.08);
      trailRef.current.position.x = s.fx + (s.tx - s.fx) * p;
      trailRef.current.position.z = s.fz + (s.tz - s.fz) * p;
      trailRef.current.position.y = 0.3 + Math.sin(p * Math.PI) * 3;
      trailRef.current.scale.setScalar(0.4 + Math.sin(p * Math.PI) * 0.3);
    }
  });

  const c = ZONES[index % ZONES.length].color;
  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={4} transparent opacity={0.85} />
      </mesh>
      <mesh ref={trailRef}>
        <sphereGeometry args={[0.035, 4, 4]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={2} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION BEAMS
// ═══════════════════════════════════════════════════════════════

function ConnectionBeams() {
  const pairs = useMemo(() => {
    const p: { from: (typeof ZONES)[0]; to: (typeof ZONES)[0] }[] = [];
    for (let i = 0; i < ZONES.length; i++) {
      for (let j = i + 1; j < ZONES.length; j++) {
        const dx = ZONES[i].x - ZONES[j].x;
        const dz = ZONES[i].z - ZONES[j].z;
        if (Math.sqrt(dx * dx + dz * dz) < 10) {
          p.push({ from: ZONES[i], to: ZONES[j] });
        }
      }
    }
    return p;
  }, []);

  return (
    <group>
      {pairs.map((pair, i) => {
        const mx = (pair.from.x + pair.to.x) / 2;
        const mz = (pair.from.z + pair.to.z) / 2;
        const dx = pair.to.x - pair.from.x;
        const dz = pair.to.z - pair.from.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);
        return (
          <mesh key={i} position={[mx, 0.003, mz]} rotation={[-Math.PI / 2, 0, -angle]}>
            <planeGeometry args={[0.03, len]} />
            <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.8} transparent opacity={0.12} />
          </mesh>
        );
      })}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// AMBIENT PARTICLES
// ═══════════════════════════════════════════════════════════════

function AmbientParticles() {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const n = 150;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 36;
      p[i * 3 + 1] = 0.5 + Math.random() * 8;
      p[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);

  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.004;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.05} color="#06b6d4" transparent opacity={0.25} sizeAttenuation />
    </points>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA PILLARS
// ═══════════════════════════════════════════════════════════════

function DataPillar({ x, z, color }: { x: number; z: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).opacity =
        0.08 + Math.sin(clock.elapsedTime * 2 + x + z) * 0.03;
    }
  });

  return (
    <mesh ref={ref} position={[x, 2.5, z]}>
      <cylinderGeometry args={[0.02, 0.15, 5, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} transparent opacity={0.08} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// EDGE TOWERS (corner beacons)
// ═══════════════════════════════════════════════════════════════

function EdgeTower({ x, z }: { x: number; z: number }) {
  const lightRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (lightRef.current) {
      (lightRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.5 + Math.sin(clock.elapsedTime * 3 + x + z) * 0.8;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position-y={1.5}>
        <boxGeometry args={[0.15, 3, 0.15]} />
        <meshStandardMaterial color="#0e1530" />
      </mesh>
      <mesh ref={lightRef} position-y={3.1}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={1.5} />
      </mesh>
      <pointLight position-y={3.1} color="#06b6d4" intensity={0.3} distance={6} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCENE CONTENT
// ═══════════════════════════════════════════════════════════════

function SceneContent({ agents, selectedAgent, onSelectAgent }: Scene3DProps) {
  const walkers = useMemo(() => {
    const real = agents.map((a) => ({
      id: a.id, name: a.name, verified: a.status === "VERIFIED", isReal: true,
    }));
    const need = Math.max(0, 24 - real.length);
    const npcs = NPC_NAMES.slice(0, need).map((n, i) => ({
      id: `npc-${i}`, name: n, verified: Math.random() > 0.35, isReal: false,
    }));
    return [...real, ...npcs];
  }, [agents]);

  return (
    <>
      <color attach="background" args={["#050910"]} />
      <fog attach="fog" args={["#050910", 22, 55]} />

      <ambientLight intensity={0.12} />
      <directionalLight position={[10, 15, 8]} intensity={0.25} color="#b4d4ff" />
      <directionalLight position={[-5, 8, -5]} intensity={0.1} color="#c4b5fd" />

      <Ground />
      <AmbientParticles />
      <ConnectionBeams />
      <InteractionBeams />

      {ZONES.map((z) => (
        <ZonePlatform key={z.label} {...z} />
      ))}

      {ZONES.map((z, i) => (
        <HoloDisplay key={`holo-${z.label}`} x={z.x} z={z.z} color={z.color} type={i} />
      ))}

      {ZONES.map((z) => (
        <DataPillar key={`dp-${z.label}`} x={z.x} z={z.z} color={z.color} />
      ))}

      {ZONES.map((z, i) => (
        <PulseRing key={`pr-${z.label}`} x={z.x} z={z.z} color={z.color} delay={i * 0.16} />
      ))}

      {/* Corner beacon towers */}
      <EdgeTower x={-13} z={-9} />
      <EdgeTower x={13} z={-9} />
      <EdgeTower x={-13} z={9} />
      <EdgeTower x={13} z={9} />

      {/* Scanner drones */}
      <ScannerDrone index={0} />
      <ScannerDrone index={1} />
      <ScannerDrone index={2} />

      {walkers.map((w, i) => (
        <WalkingAgent
          key={w.id}
          name={w.name}
          verified={w.verified}
          index={i}
          isSelected={selectedAgent?.id === w.id}
          onClick={() => {
            if (w.isReal) {
              const ag = agents.find((a) => a.id === w.id);
              if (ag) onSelectAgent(selectedAgent?.id === ag.id ? null : ag);
            }
          }}
        />
      ))}

      {Array.from({ length: 14 }, (_, i) => (
        <DataPacket key={`pkt-${i}`} index={i} />
      ))}

      <OrbitControls
        target={[0, 1, 0]}
        enablePan={false}
        enableZoom
        minDistance={8}
        maxDistance={35}
        autoRotate
        autoRotateSpeed={0.15}
        maxPolarAngle={Math.PI / 2.5}
        minPolarAngle={Math.PI / 7}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export default function Scene3DCanvas(props: Scene3DProps) {
  return (
    <Canvas
      camera={{ position: [16, 14, 16], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.3;
      }}
      fallback={
        <div style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center", background: "#050910",
        }}>
          <p style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(6,182,212,0.6)" }}>
            Loading Clawdverse...
          </p>
        </div>
      }
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
