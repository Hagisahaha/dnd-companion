import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Lets the player pick a portrait, crops it square and shrinks it to a small JPEG data URI
 * (~15-30 KB), so it lives inside the character and syncs like any other field.
 * Returns null if the picker was cancelled.
 */
export async function pickAvatar(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const side = Math.min(asset.width || 512, asset.height || 512);
  const ctx = ImageManipulator.manipulate(asset.uri);
  // allowsEditing already crops to a square on phones; on web, crop the centre ourselves.
  if (asset.width && asset.height && asset.width !== asset.height) {
    ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: 256, height: 256 });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}
