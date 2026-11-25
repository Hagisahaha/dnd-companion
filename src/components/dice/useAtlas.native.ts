import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

const ATLAS = require('../../../assets/dice/atlas.png');

export function useAtlas(): THREE.Texture {
  // On native, '@react-three/fiber' resolves to its native build, which patches TextureLoader to accept asset module ids.
  const tex = useLoader(THREE.TextureLoader, ATLAS as string) as THREE.Texture;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
