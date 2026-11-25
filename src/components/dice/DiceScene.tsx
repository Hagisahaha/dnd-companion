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
import { FPS, ThrowInput, ThrowSim, ThrowTrack } from '../../dice/simulate';
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
  /** Final (value-corrected) track, once the simulation has finished. */
  track: ThrowTrack | null;
  /** Simulation still running in small slices each frame; raw poses are played until it finishes. */
  sim: ThrowSim | null;
  /** Playback frame at which the corrected track took over (blended in over a few frames). */
  correctedAt: number;
  /** For each scene die, its index in the throw, or -1 if it stays still. */
  trackMap: number[];
  trackStart: number;
  impactCursor: number;
  onImpact?: (strength: number) => void;
  onSettled?: () => void;
}

export function createController(poses: Pose[] = []): DiceController {
  return { phase: 'rest', hand: { x: 0, z: 0 }, poses, track: null, sim: null, correctedAt: 0, trackMap: [], trackStart: 0, impactCursor: 0 };
}

/**
 * Starts a throw without blocking: a few milliseconds of physics now, the rest spread
 * over the next frames by the render loop. Dice leave the hand on this very frame.
 */
export function startThrow(ctrl: DiceController, input: ThrowInput, trackMap: number[]) {
  const sim = new ThrowSim(input);
  sim.advance(4);
  ctrl.sim = sim;
  ctrl.track = sim.done ? sim.finish() : null;
  ctrl.correctedAt = 0;
  ctrl.trackMap = trackMap;
  ctrl.trackStart = performance.now();
  ctrl.impactCursor = 0;
  ctrl.phase = 'playing';
}

/** Physics budget per rendered frame while a throw is still being simulated. */
const SIM_BUDGET_MS = 5;
/** Frames (physics rate) over which the value-corrected orientation is blended in. */
const BLEND_FRAMES = 4;

/** Where the i-th held die floats relative to the finger. */
function heldOffset(i: number): [number, number] {
  if (i === 0) return [0, 0];
  const a = i * 2.39996;
  const r = 1.25 * Math.sqrt(i);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const qa: number[] = [0, 0, 0, 0];
const qb: number[] = [0, 0, 0, 0];
const qc: number[] = [0, 0, 0, 0];

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
    } else if (c.phase === 'playing' && (c.track || c.sim)) {
      const fNow = ((performance.now() - c.trackStart) / 1000) * FPS * PLAYBACK_SPEED;
      // Keep the physics ahead of playback, a few ms per frame.
      if (!c.track && c.sim) {
        c.sim.advance(SIM_BUDGET_MS);
        if (c.sim.done) {
          c.track = c.sim.finish();
          c.correctedAt = fNow;
        }
      }
      const sim = c.sim;
      const tr = c.track;
      const available = tr ? tr.frames : sim!.frames;
      const f = Math.min(available - 1, fNow);
      const f0 = Math.floor(f);
      const f1 = Math.min(available - 1, f0 + 1);
      const t = f - f0;
      const blend = tr && sim && c.correctedAt > 0 ? Math.min(1, (fNow - c.correctedAt) / BLEND_FRAMES) : 1;
      dice.forEach((_, i) => {
        const k = c.trackMap[i];
        if (k < 0) return;
        const p: ArrayLike<number> = tr ? tr.positions[k] : sim!.pos[k];
        const p0 = f0 * 3;
        const p1 = f1 * 3;
        const pose: Pose = {
          p: [p[p0] + (p[p1] - p[p0]) * t, p[p0 + 1] + (p[p1 + 1] - p[p0 + 1]) * t, p[p0 + 2] + (p[p1 + 2] - p[p0 + 2]) * t],
          q: [0, 0, 0, 1],
        };
        const raw = (fr: number, out: number[]) => {
          const r = sim!.rot[k];
          out[0] = r[fr * 4]; out[1] = r[fr * 4 + 1]; out[2] = r[fr * 4 + 2]; out[3] = r[fr * 4 + 3];
        };
        const fixed = (fr: number, out: number[]) => {
          const q = tr!.quaternions[k];
          out[0] = q[fr * 4]; out[1] = q[fr * 4 + 1]; out[2] = q[fr * 4 + 2]; out[3] = q[fr * 4 + 3];
        };
        const get = tr ? fixed : raw;
        get(f0, qa);
        get(f1, qb);
        THREE.Quaternion.slerpFlat(qc, 0, qa, 0, qb, 0, t);
        if (blend < 1) {
          // Ease from the raw spin into the corrected one while the die is still tumbling fast.
          raw(f0, qa);
          raw(f1, qb);
          THREE.Quaternion.slerpFlat(qa, 0, qa, 0, qb, 0, t);
          THREE.Quaternion.slerpFlat(qc, 0, qa, 0, qc, 0, blend);
        }
        pose.q = [qc[0], qc[1], qc[2], qc[3]];
        c.poses[i] = pose;
      });
      // One list for the whole throw so the cursor stays valid when the corrected track takes over.
      const impacts = sim ? sim.impacts : tr!.impacts;
      while (c.impactCursor < impacts.length && impacts[c.impactCursor].frame <= f) {
        c.onImpact?.(impacts[c.impactCursor].strength);
        c.impactCursor++;
      }
      if (tr && fNow >= tr.frames - 1) {
        c.phase = 'rest';
        c.sim = null;
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
