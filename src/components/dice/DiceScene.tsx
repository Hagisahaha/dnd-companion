/*
 * Dice rendering uses an imperative, mutable controller shared with the three.js render
 * loop (it works like a ref: poses are written 60×/s without re-rendering). That pattern is
 * outside React Compiler's model, so this file opts out of the compiler and its lint rules.
 */
/* eslint-disable react-hooks/immutability */
'use no memo';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DieKind, Vec3 } from '../../dice/geometry';
import { dieGeometry } from '../../dice/mesh';
import { FPS, ThrowTrack } from '../../dice/simulate';
import type { Quat } from '../../dice/symmetry';
import { useAtlas } from './useAtlas';

export const CAMERA_HEIGHT = 24;
export const CAMERA_FOV = 35;
const PLAYBACK_SPEED = 1.15;
const HOLD_HEIGHT = 2.8;

export interface SceneDie {
  key: string;
  kind: DieKind;
}

export interface Pose {
  p: Vec3;
  q: Quat;
}

/**
 * Mutable controller shared by the tray (gestures) and the scene (render loop).
 * Kept outside React state so 60 fps updates never trigger re-renders.
 */
export interface DiceController {
  phase: 'rest' | 'holding' | 'playing';
  hand: { x: number; z: number };
  poses: Pose[];
  track: ThrowTrack | null;
  /** For each scene die, its index in `track`, or -1 if it stays still. */
  trackMap: number[];
  trackStart: number;
  impactCursor: number;
  onImpact?: (strength: number) => void;
  onSettled?: () => void;
}

export function createController(poses: Pose[] = []): DiceController {
  return { phase: 'rest', hand: { x: 0, z: 0 }, poses, track: null, trackMap: [], trackStart: 0, impactCursor: 0 };
}

/** Where the i-th held die floats relative to the finger. */
function heldOffset(i: number): [number, number] {
  if (i === 0) return [0, 0];
  const a = i * 2.39996;
  const r = 1.25 * Math.sqrt(i);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();

export function DiceScene({ dice, ctrl, skin }: { dice: SceneDie[]; ctrl: DiceController; skin: string }) {
  const atlas = useAtlas();
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map: atlas, color: skin, roughness: 0.42, metalness: 0.0 }),
    [atlas, skin],
  );

  useEffect(() => {
    camera.up.set(0, 0, -1);
    camera.position.set(0, CAMERA_HEIGHT, 0);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const c = ctrl;
    if (c.phase === 'holding') {
      dice.forEach((_, i) => {
        const [ox, oz] = heldOffset(i);
        euler.set(t * 3.1 + i * 1.7, t * 2.3 + i * 0.9, t * 1.7 + i * 2.1);
        quat.setFromEuler(euler);
        c.poses[i] = {
          p: [c.hand.x + ox, HOLD_HEIGHT + Math.sin(t * 11 + i) * 0.18, c.hand.z + oz],
          q: [quat.x, quat.y, quat.z, quat.w],
        };
      });
    } else if (c.phase === 'playing' && c.track) {
      const tr = c.track;
      const frame = Math.min(tr.frames - 1, Math.floor((performance.now() - c.trackStart) / 1000 * FPS * PLAYBACK_SPEED));
      dice.forEach((_, i) => {
        const k = c.trackMap[i];
        if (k < 0) return;
        const p = tr.positions[k];
        const q = tr.quaternions[k];
        c.poses[i] = {
          p: [p[frame * 3], p[frame * 3 + 1], p[frame * 3 + 2]],
          q: [q[frame * 4], q[frame * 4 + 1], q[frame * 4 + 2], q[frame * 4 + 3]],
        };
      });
      while (c.impactCursor < tr.impacts.length && tr.impacts[c.impactCursor].frame <= frame) {
        c.onImpact?.(tr.impacts[c.impactCursor].strength);
        c.impactCursor++;
      }
      if (frame >= tr.frames - 1) {
        c.phase = 'rest';
        c.onSettled?.();
      }
    }
    dice.forEach((_, i) => {
      const m = meshes.current[i];
      const pose = c.poses[i];
      if (!m || !pose) return;
      m.position.set(...pose.p);
      m.quaternion.set(...pose.q);
    });
  });

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight
        position={[2.5, 30, 4]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
      {dice.map((d, i) => (
        <mesh
          key={d.key}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={dieGeometry(d.kind)}
          material={material}
          castShadow
          position={ctrl.poses[i]?.p ?? [0, -10, 0]}
        />
      ))}
    </>
  );
}
