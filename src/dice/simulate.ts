import * as CANNON from 'cannon-es';
import { DieKind, Vec3, faceNormal, faceForValue, getShape, readingFace } from './geometry';
import { Quat, mulQuat, rotateVec, symmetryMapping } from './symmetry';

export const FPS = 60;
const MAX_FRAMES = FPS * 4;
const GRAVITY = -60;

export interface ThrowDie {
  kind: DieKind;
  /** Value this die must show when it stops (1-based; d10 "0" face is 10). */
  value: number;
  start: Vec3;
  /** Orientation at release; random when omitted. */
  rotation?: Quat;
}

export interface ThrowInput {
  dice: ThrowDie[];
  /** Throw velocity on the table plane (world units / s): x right, z toward the bottom of the screen. */
  velocity: [number, number];
  /** Half extents of the tray floor (x, z). */
  bounds: [number, number];
  /** Seed for spin/jitter so replays are stable in tests. */
  random?: () => number;
}

export interface Impact {
  frame: number;
  strength: number;
}

export interface ThrowTrack {
  frames: number;
  /** Per die: frames * 3 positions. */
  positions: Float32Array[];
  /** Per die: frames * 4 quaternions, already corrected to land on the forced value. */
  quaternions: Float32Array[];
  impacts: Impact[];
}

const shapeCache = new Map<DieKind, CANNON.ConvexPolyhedron>();
function physicsShape(kind: DieKind) {
  let s = shapeCache.get(kind);
  if (!s) {
    const shape = getShape(kind);
    s = new CANNON.ConvexPolyhedron({
      vertices: shape.vertices.map(([x, y, z]) => new CANNON.Vec3(x, y, z)),
      faces: shape.faces,
    });
    shapeCache.set(kind, s);
  }
  return s;
}

/**
 * Runs the whole throw headless, then rewrites each die's orientation with a
 * shape symmetry so the face showing at rest carries the pre-rolled value.
 * Rendering is pure playback of the returned track.
 */
export function simulateThrow(input: ThrowInput): ThrowTrack {
  const rand = input.random ?? Math.random;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.NaiveBroadphase();
  (world.solver as CANNON.GSSolver).iterations = 12;

  const diceMat = new CANNON.Material('dice');
  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, wallMat, { friction: 0.3, restitution: 0.45 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.2, restitution: 0.4 }));

  const [bx, bz] = input.bounds;
  const addPlane = (pos: Vec3, axis: Vec3, angle: number) => {
    const b = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
    b.position.set(...pos);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(...axis), angle);
    world.addBody(b);
  };
  addPlane([0, 0, 0], [1, 0, 0], -Math.PI / 2); // floor
  addPlane([-bx, 0, 0], [0, 1, 0], Math.PI / 2); // left
  addPlane([bx, 0, 0], [0, 1, 0], -Math.PI / 2); // right
  addPlane([0, 0, -bz], [0, 1, 0], 0); // top
  addPlane([0, 0, bz], [0, 1, 0], Math.PI); // bottom
  addPlane([0, 12, 0], [1, 0, 0], Math.PI / 2); // lid

  const impacts: Impact[] = [];
  let frame = 0;
  const bodies = input.dice.map((d) => {
    const body = new CANNON.Body({
      mass: 1,
      material: diceMat,
      shape: physicsShape(d.kind),
      linearDamping: 0.2,
      angularDamping: 0.3,
      sleepSpeedLimit: 0.45,
      sleepTimeLimit: 0.1,
    });
    body.position.set(...d.start);
    if (d.rotation) body.quaternion.set(...d.rotation);
    else body.quaternion.setFromEuler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
    const [vx, vz] = input.velocity;
    body.velocity.set(vx * (0.85 + rand() * 0.3), 4 + rand() * 4, vz * (0.85 + rand() * 0.3));
    const spin = 18 + Math.hypot(vx, vz) * 0.6;
    body.angularVelocity.set((rand() - 0.5) * spin, (rand() - 0.5) * spin, (rand() - 0.5) * spin);
    body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      const strength = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (strength > 2) impacts.push({ frame, strength });
    });
    world.addBody(body);
    return body;
  });

  const pos: number[][] = bodies.map(() => []);
  const rot: number[][] = bodies.map(() => []);
  const record = () =>
    bodies.forEach((b, i) => {
      pos[i].push(b.position.x, b.position.y, b.position.z);
      rot[i].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    });

  record();
  for (frame = 1; frame < MAX_FRAMES; frame++) {
    world.step(1 / FPS);
    record();
    if (frame > 20 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
  }
  const frames = bodies.length ? pos[0].length / 3 : 0;

  const quaternions = input.dice.map((d, i) => {
    const shape = getShape(d.kind);
    const last = (frames - 1) * 4;
    const q: Quat = [rot[i][last], rot[i][last + 1], rot[i][last + 2], rot[i][last + 3]];
    const normals = shape.faces.map((f) => rotateVec(q, faceNormal(shape, f)));
    const landed = readingFace(shape, normals);
    const wanted = faceForValue(shape, d.value);
    const s = symmetryMapping(shape, wanted, landed);
    const out = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      const o = f * 4;
      const fixed = mulQuat([rot[i][o], rot[i][o + 1], rot[i][o + 2], rot[i][o + 3]], s);
      out.set(fixed, o);
    }
    return out;
  });

  return {
    frames,
    positions: pos.map((p) => Float32Array.from(p.slice(0, frames * 3))),
    quaternions,
    impacts: dedupeImpacts(impacts),
  };
}

function dedupeImpacts(list: Impact[]): Impact[] {
  const byFrame = new Map<number, number>();
  for (const i of list) byFrame.set(i.frame, Math.max(byFrame.get(i.frame) ?? 0, i.strength));
  return [...byFrame].map(([frame, strength]) => ({ frame, strength })).sort((a, b) => a.frame - b.frame);
}
