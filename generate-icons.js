'use strict';
const sharp = require('sharp');
const path  = require('path');

const SRC   = path.join(__dirname, 'icons', 'icon.svg');
const SIZES  = [192, 512];
const MASKABLE_PADDING = 0.10; // 10% safe-zone for maskable icons

async function main() {
  for (const size of SIZES) {
    // Standard icon
    await sharp(SRC)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, 'icons', `icon-${size}.png`));
    console.log(`icon-${size}.png`);

    // Maskable icon (slightly smaller dragon, padded background)
    const inner = Math.round(size * (1 - MASKABLE_PADDING * 2));
    const pad   = Math.round(size * MASKABLE_PADDING);
    await sharp(SRC)
      .resize(inner, inner)
      .extend({ top: pad, bottom: pad, left: pad, right: pad,
                background: { r: 7, g: 11, b: 20, alpha: 1 } })
      .png()
      .toFile(path.join(__dirname, 'icons', `icon-maskable-${size}.png`));
    console.log(`icon-maskable-${size}.png`);
  }

  // Apple Touch Icon (180x180)
  await sharp(SRC)
    .resize(180, 180)
    .png()
    .toFile(path.join(__dirname, 'icons', 'apple-touch-icon.png'));
  console.log('apple-touch-icon.png');

  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
