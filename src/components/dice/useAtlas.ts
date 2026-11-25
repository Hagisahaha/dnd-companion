import { useLoader } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import { useMemo } from 'react';
import * as THREE from 'three';

const ATLAS = require('../../../assets/dice/atlas.png');

export function useAtlas(): THREE.Texture {
  const uri = useMemo(() => Asset.fromModule(ATLAS).uri, []);
  const tex = useLoader(THREE.TextureLoader, uri);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
