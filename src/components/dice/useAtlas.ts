import { useLoader } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import { useMemo } from 'react';
import * as THREE from 'three';

const ATLAS = require('../../../assets/dice/atlas.png');

export function useAtlas(): THREE.Texture {
  const uri = useMemo(() => Asset.fromModule(ATLAS).uri, []);
  const loaded = useLoader(THREE.TextureLoader, uri);
  // Configure a clone: the loader's instance is cached and shared.
  return useMemo(() => {
    const tex = loaded.clone();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [loaded]);
}
