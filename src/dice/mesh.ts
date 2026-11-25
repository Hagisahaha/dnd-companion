import * as THREE from 'three';
import { atlasUV, cellIndex, faceUVs } from './atlas';
import { DieKind, faceNormal, getShape } from './geometry';

const cache = new Map<DieKind, THREE.BufferGeometry>();

/** Flat-shaded, non-indexed geometry with each face mapped onto its atlas cell. */
export function dieGeometry(kind: DieKind): THREE.BufferGeometry {
  const hit = cache.get(kind);
  if (hit) return hit;
  const shape = getShape(kind);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  shape.faces.forEach((face, fi) => {
    const n = faceNormal(shape, face);
    const uvs = faceUVs(shape, fi).map((p) => atlasUV(cellIndex(kind, fi), p));
    for (let k = 1; k < face.length - 1; k++) {
      for (const j of [0, k, k + 1]) {
        pos.push(...shape.vertices[face[j]]);
        nor.push(...n);
        uv.push(...uvs[j]);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  cache.set(kind, g);
  return g;
}
