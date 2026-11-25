/**
 * Pure polyhedron definitions for each physical die. No rendering or physics
 * imports here, so this file is shared by the renderer, the physics sim, the
 * texture-atlas generator and the tests.
 */

export type Vec3 = [number, number, number];

export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd10p' | 'd12' | 'd20';

export interface DieShape {
  kind: DieKind;
  vertices: Vec3[];
  /** Each face lists vertex indices counter-clockwise when seen from outside. */
  faces: number[][];
  /** The number that face represents when it is the reading face (1-based). */
  faceValue: number[];
  /** Atlas key drawn on each face. */
  faceLabel: string[];
  /** Index into face vertices whose direction is "up" for the label. */
  faceUpVertex: number[];
  /** d4 is read from the face that lies on the table; the rest from the face pointing up. */
  readDown: boolean;
  /** For d4: label of each vertex (the number printed at that corner). */
  vertexLabel?: string[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export function faceCentroid(shape: { vertices: Vec3[] }, face: number[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const i of face) for (let k = 0; k < 3; k++) c[k] += shape.vertices[i][k] / face.length;
  return c;
}

export function faceNormal(shape: { vertices: Vec3[] }, face: number[]): Vec3 {
  const [a, b, c] = face.map((i) => shape.vertices[i]);
  return normalize(cross(sub(b, a), sub(c, a)));
}

/** Makes every face wind counter-clockwise when viewed from outside. */
function orientOutward(vertices: Vec3[], faces: number[][]): number[][] {
  return faces.map((f) => {
    const n = faceNormal({ vertices }, f);
    return dot(n, faceCentroid({ vertices }, f)) < 0 ? [...f].reverse() : f;
  });
}

/** Finds all faces of a convex hull whose vertices are on a sphere, by brute force. */
function hullFaces(vertices: Vec3[]): number[][] {
  const faces: number[][] = [];
  const seen = new Set<string>();
  const n = vertices.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) {
        const normal = cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]));
        if (len(normal) < 1e-9) continue;
        const nn = normalize(normal);
        const d = dot(nn, vertices[a]);
        let pos = 0;
        let neg = 0;
        const on: number[] = [];
        for (let i = 0; i < n; i++) {
          const s = dot(nn, vertices[i]) - d;
          if (Math.abs(s) < 1e-6) on.push(i);
          else if (s > 0) pos++;
          else neg++;
        }
        if (pos > 0 && neg > 0) continue;
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push(sortAround(vertices, on));
      }
  return faces;
}

/** Orders coplanar points around their centroid. */
function sortAround(vertices: Vec3[], idx: number[]): number[] {
  const c = faceCentroid({ vertices }, idx);
  const n = normalize(c);
  const u = normalize(sub(vertices[idx[0]], c));
  const v = cross(n, u);
  return [...idx].sort((i, j) => {
    const pi = sub(vertices[i], c);
    const pj = sub(vertices[j], c);
    return Math.atan2(dot(pi, v), dot(pi, u)) - Math.atan2(dot(pj, v), dot(pj, u));
  });
}

/** Pairs each face with its opposite and gives the pair values summing to N + 1. */
function oppositeValues(vertices: Vec3[], faces: number[][]): number[] {
  const normals = faces.map((f) => faceNormal({ vertices }, f));
  const values = new Array<number>(faces.length).fill(0);
  let next = 1;
  for (let i = 0; i < faces.length; i++) {
    if (values[i]) continue;
    let best = -1;
    let bestDot = Infinity;
    for (let j = 0; j < faces.length; j++) {
      if (j === i || values[j]) continue;
      const d = dot(normals[i], normals[j]);
      if (d < bestDot) {
        bestDot = d;
        best = j;
      }
    }
    values[i] = next;
    values[best] = faces.length + 1 - next;
    next++;
  }
  return values;
}

/** Scales vertices so the die's bounding radius equals `radius`. */
function fit(vertices: Vec3[], radius: number): Vec3[] {
  const r = Math.max(...vertices.map(len));
  return vertices.map((v) => scale(v, radius / r));
}

function build(kind: DieKind, raw: Vec3[], radius: number, faces?: number[][]): DieShape {
  const vertices = fit(raw, radius);
  const f = orientOutward(vertices, faces ?? hullFaces(vertices));
  const faceValue = oppositeValues(vertices, f);
  return {
    kind,
    vertices,
    faces: f,
    faceValue,
    faceLabel: faceValue.map(String),
    faceUpVertex: f.map(() => 0),
    readDown: false,
  };
}

function d4(): DieShape {
  const vertices = fit(
    [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ],
    1.0,
  );
  const faces = orientOutward(vertices, [
    [1, 2, 3],
    [0, 2, 3],
    [0, 1, 3],
    [0, 1, 2],
  ]);
  const vertexLabel = ['1', '2', '3', '4'];
  // Face i omits vertex i, so when face i lies on the table, vertex i is on top.
  const faceValue = faces.map((f) => [0, 1, 2, 3].find((v) => !f.includes(v))! + 1);
  return {
    kind: 'd4',
    vertices,
    faces,
    faceValue,
    faceLabel: faces.map((_, i) => `d4f${i}`),
    faceUpVertex: faces.map(() => 0),
    readDown: true,
    vertexLabel,
  };
}

function d10(kind: 'd10' | 'd10p'): DieShape {
  const h = 1.05;
  const cos36 = Math.cos(Math.PI / 5);
  const e = (h * (1 - cos36)) / (1 + cos36);
  const raw: Vec3[] = [[0, h, 0], [0, -h, 0]];
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5;
    raw.push([Math.cos(a), k % 2 === 0 ? e : -e, Math.sin(a)]);
  }
  const ring = (k: number) => 2 + ((k + 10) % 10);
  const faces: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const u = 2 * i;
    faces.push([0, ring(u), ring(u + 1), ring(u + 2)]);
    faces.push([1, ring(u + 1), ring(u + 2), ring(u + 3)]);
  }
  const shape = build(kind, raw, 1.0, faces);
  // Faces keep their apex at index 0 after orientOutward (reverse keeps [0] last), so find it.
  shape.faceUpVertex = shape.faces.map((f) => f.findIndex((v) => v === 0 || v === 1));
  shape.faceLabel = shape.faceValue.map((v) =>
    kind === 'd10' ? String(v % 10) : String((v % 10) * 10).padStart(2, '0'),
  );
  return shape;
}

const icosa: Vec3[] = [];
for (const a of [-1, 1])
  for (const b of [-PHI, PHI]) {
    icosa.push([0, a, b], [a, b, 0], [b, 0, a]);
  }

const dodeca: Vec3[] = [];
for (const a of [-1, 1])
  for (const b of [-1, 1])
    for (const c of [-1, 1]) dodeca.push([a, b, c]);
for (const a of [-1 / PHI, 1 / PHI])
  for (const b of [-PHI, PHI]) dodeca.push([0, a, b], [a, b, 0], [b, 0, a]);

const cube: Vec3[] = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) cube.push([a, b, c]);

const SHAPES: Record<DieKind, DieShape> = {
  d4: d4(),
  d6: build('d6', cube, 0.95),
  d8: build('d8', [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], 1.0),
  d10: d10('d10'),
  d10p: d10('d10p'),
  d12: build('d12', dodeca, 1.0),
  d20: build('d20', icosa, 1.05),
};

export function getShape(kind: DieKind): DieShape {
  return SHAPES[kind];
}

/** Face whose value is read when the die rests with world-space normals `worldNormals`. */
export function readingFace(shape: DieShape, worldNormals: Vec3[]): number {
  let best = 0;
  let bestY = -Infinity;
  worldNormals.forEach((n, i) => {
    const y = shape.readDown ? -n[1] : n[1];
    if (y > bestY) {
      bestY = y;
      best = i;
    }
  });
  return best;
}

/** Face index that shows `value` (1-based). For d10, 10 is the "0" face. */
export function faceForValue(shape: DieShape, value: number): number {
  const i = shape.faceValue.indexOf(value);
  if (i < 0) throw new Error(`${shape.kind} has no face ${value}`);
  return i;
}
