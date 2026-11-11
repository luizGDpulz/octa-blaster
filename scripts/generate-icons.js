import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SIZES = [16, 32, 48, 96, 128, 256];
const svgPath = path.resolve('public/icon.svg');
const outDir = path.resolve('public/icon');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function createIco(images) {
  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO resource
  header.writeUInt16LE(count, 4); // Number of images

  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Offset to image data
    entries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((img) => img.buffer)]);
}

async function generate() {
  const svgBuffer = fs.readFileSync(svgPath);
  const icoCandidates = [];

  for (const size of SIZES) {
    const dest = path.join(outDir, `${size}.png`);
    const pngBuf = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();

    fs.writeFileSync(dest, pngBuf);
    console.log(`Generated ${size}x${size} -> ${dest}`);

    if ([16, 32, 48].includes(size)) {
      icoCandidates.push({ width: size, height: size, buffer: pngBuf });
    }
  }

  // Gera ícones .ico compatíveis com Windows / Favicon
  const icoBuffer = createIco(icoCandidates);
  const icoPath = path.resolve('public/icon.ico');
  const faviconPath = path.resolve('public/favicon.ico');

  fs.writeFileSync(icoPath, icoBuffer);
  fs.writeFileSync(faviconPath, icoBuffer);
  console.log(`Generated ICO -> ${icoPath}`);
  console.log(`Generated Favicon -> ${faviconPath}`);
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

