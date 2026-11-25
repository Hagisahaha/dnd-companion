/**
 * Renders assets/dice/atlas.png: one cell per die face with its number.
 * Run: npx tsx scripts/gen-dice-atlas.mts
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { ATLAS_H, ATLAS_W, CELL, CELLS, COLS, FONT_SCALE, faceUVs } from '../src/dice/atlas';
import { getShape } from '../src/dice/geometry';

type Text = { text: string; x: number; y: number; size: number; angle: number; underline: boolean };

const texts: Text[] = [];
for (const cell of CELLS) {
  const shape = getShape(cell.kind);
  const ox = (cell.index % COLS) * CELL;
  const oy = Math.floor(cell.index / COLS) * CELL;
  const size = FONT_SCALE[cell.kind] * CELL;
  if (cell.kind === 'd4') {
    // Number at each corner, upright when that corner points up.
    faceUVs(shape, cell.face).forEach(([u, v], k) => {
      const label = shape.vertexLabel![shape.faces[cell.face][k]];
      const cx = 0.5 + (u - 0.5) * 0.52;
      const cy = 0.5 + (v - 0.5) * 0.52;
      const angle = Math.atan2(u - 0.5, v - 0.5);
      texts.push({ text: label, x: ox + cx * CELL, y: oy + (1 - cy) * CELL, size, angle, underline: false });
    });
  } else {
    const label = shape.faceLabel[cell.face];
    const underline = (label === '6' || label === '9') && shape.faces.length > 6;
    texts.push({ text: label, x: ox + CELL / 2, y: oy + CELL / 2, size, angle: 0, underline });
  }
}

const html = `<canvas id="c" width="${ATLAS_W}" height="${ATLAS_H}"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, ${ATLAS_W}, ${ATLAS_H});
ctx.fillStyle = '#111114';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (const t of ${JSON.stringify(texts)}) {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.font = '700 ' + t.size + 'px "Inter", "Helvetica Neue", "DejaVu Sans", sans-serif';
  ctx.fillText(t.text, 0, 0);
  if (t.underline) {
    const w = ctx.measureText(t.text).width;
    ctx.fillRect(-w / 2, t.size * 0.5, w, Math.max(2, t.size * 0.08));
  }
  ctx.restore();
}
</script>`;

// Uses the project's playwright if installed, otherwise the global one.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pw: any;
try {
  pw = require('playwright'); // eslint-disable-line
} catch {
  pw = require(`${execSync('npm root -g').toString().trim()}/playwright`);
}
const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const data = await page.evaluate(() => (document.getElementById('c') as HTMLCanvasElement).toDataURL('image/png'));
writeFileSync('assets/dice/atlas.png', Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log(`atlas ${ATLAS_W}x${ATLAS_H}, ${CELLS.length} cells`);
