import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SIZES = [16, 32, 48, 96, 128];
const svgPath = path.resolve('public/icon.svg');
const outDir = path.resolve('public/icon');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function generate() {
  const svgBuffer = fs.readFileSync(svgPath);

  for (const size of SIZES) {
    const dest = path.join(outDir, `${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(dest);
    console.log(`Generated ${size}x${size} -> ${dest}`);
  }
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
