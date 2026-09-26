import sharp from 'sharp';

async function processTerrainTextures() {
  // 1. Grass
  await sharp(
    'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/seamless_grass_texture_1790463949753.jpg',
  )
    .resize(512, 512)
    .png()
    .toFile('public/assets/tile-grass.png');
  console.log('Saved public/assets/tile-grass.png');

  // 2. Cobblestone
  await sharp(
    'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/seamless_stone_road_1790463967622.jpg',
  )
    .resize(512, 512)
    .png()
    .toFile('public/assets/tile-cobblestone.png');
  console.log('Saved public/assets/tile-cobblestone.png');

  // 3. Runic Barricade
  await sharp(
    'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/seamless_runic_tile_1790463985901.jpg',
  )
    .resize(512, 512)
    .png()
    .toFile('public/assets/tile-runic-barricade.png');
  console.log('Saved public/assets/tile-runic-barricade.png');

  // 4. Volcanic Basalt Texture (Procedural high-res basalt with molten magma fissures)
  const size = 512;
  const raw = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Basalt crags + molten cracks
      const nx = (x / size) * 8;
      const ny = (y / size) * 8;
      const crack =
        Math.sin(nx * 3 + Math.cos(ny * 4) * 2) * Math.cos(ny * 3 + Math.sin(nx * 4) * 2);
      const isVein = Math.abs(crack) < 0.12;
      const isCore = Math.abs(crack) < 0.05;

      if (isCore) {
        // Glowing bright molten yellow/orange
        raw[idx] = 254;
        raw[idx + 1] = 215;
        raw[idx + 2] = 100;
        raw[idx + 3] = 255;
      } else if (isVein) {
        // Glowing magma red/orange
        raw[idx] = 234;
        raw[idx + 1] = 88;
        raw[idx + 2] = 12;
        raw[idx + 3] = 255;
      } else {
        // Craggy dark basalt rock
        const noise = (Math.sin(x * 12.3 + y * 45.6) * 10000) % 1;
        const base = 28 + Math.floor(noise * 18);
        raw[idx] = base + 4;
        raw[idx + 1] = base;
        raw[idx + 2] = base + 8;
        raw[idx + 3] = 255;
      }
    }
  }

  await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile('public/assets/tile-volcanic.png');
  console.log('Saved public/assets/tile-volcanic.png');
}

processTerrainTextures().catch(console.error);
