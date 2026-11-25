import { DieShape, Vec3, dot, faceCentroid, faceNormal, normalize } from './geometry';

/** Quaternion as [x, y, z, w]. */
export type Quat = [number, number, number, number];

type Mat3 = number[]; // row-major 3x3

const crossV = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function frame(shape: DieShape, face: number, vertex: number): Mat3 {
  const n = faceNormal(shape, shape.faces[face]);
  const c = faceCentroid(shape, shape.faces[face]);
  const v = shape.vertices[vertex];
  const u = normalize([v[0] - c[0], v[1] - c[1], v[2] - c[2]]);
  const w = crossV(n, u);
  // Columns n, u, w stored row-major.
  return [n[0], u[0], w[0], n[1], u[1], w[1], n[2], u[2], w[2]];
}

const mulABt = (a: Mat3, b: Mat3): Mat3 => {
  const r: Mat3 = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j * 3] + a[i * 3 + 1] * b[j * 3 + 1] + a[i * 3 + 2] * b[j * 3 + 2]);
  return r;
};

const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

function matToQuat(m: Mat3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

function mapsShapeToItself(shape: DieShape, m: Mat3): boolean {
  return shape.vertices.every((v) => {
    const p = apply(m, v);
    return shape.vertices.some((q) => {
      const d: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      return dot(d, d) < 1e-6;
    });
  });
}

const cache = new Map<string, Quat>();

/**
 * Returns a rotation S, in the die's local space, that is a symmetry of the
 * shape and carries face `from` onto face `to`. Rendering the die with
 * `bodyQuat * S` keeps the silhouette and collisions identical but makes
 * face `from` appear where face `to` landed.
 */
export function symmetryMapping(shape: DieShape, from: number, to: number): Quat {
  const key = `${shape.kind}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = frame(shape, from, shape.faces[from][0]);
  for (const v of shape.faces[to]) {
    const dst = frame(shape, to, v);
    const m = mulABt(dst, src);
    if (mapsShapeToItself(shape, m)) {
      const q = matToQuat(m);
      cache.set(key, q);
      return q;
    }
  }
  throw new Error(`No symmetry maps ${shape.kind} face ${from} to ${to}`);
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

export function mulQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
