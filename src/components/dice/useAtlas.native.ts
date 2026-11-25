import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

const ATLAS = require('../../../assets/dice/atlas.png');

type NativeTexture = THREE.Texture & { isDataTexture?: boolean };

export function useAtlas(): THREE.Texture {
  // On native, '@react-three/fiber' resolves to its native build, which patches TextureLoader to accept
  // asset module ids. It returns a texture flagged `isDataTexture` with `image.data.localUri`, which is
  // what expo-gl needs to upload it.
  const loaded = useLoader(THREE.TextureLoader, ATLAS as string) as NativeTexture;
  return useMemo(() => {
    const tex = loaded.clone() as NativeTexture;
    // clone() copies the image but not that ad-hoc flag; without it three takes the DOM upload path.
    tex.isDataTexture = loaded.isDataTexture;
    tex.flipY = loaded.flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [loaded]);
}
