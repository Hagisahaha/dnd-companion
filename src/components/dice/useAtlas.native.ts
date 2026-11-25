import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

const ATLAS = require('../../../assets/dice/atlas.png');

export function useAtlas(): THREE.Texture {
  // On native, '@react-three/fiber' resolves to its native build, which patches TextureLoader to accept asset module ids.
  const loaded = useLoader(THREE.TextureLoader, ATLAS as string) as THREE.Texture;
  // Configure a clone: the loader's instance is cached and shared.
  return useMemo(() => {
    const tex = loaded.clone();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [loaded]);
}
