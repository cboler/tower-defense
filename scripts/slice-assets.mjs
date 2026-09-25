import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDirs = ['public/assets/portraits', 'public/assets/sprites', 'public/assets/monsters'];

for (const dir of outDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. Process Warden Classes (1024x1024, 4x4 grid of 256x256 cells)
const classGrid = [
  // Row 0: Portraits
  { id: 'blade-warden', type: 'portrait', col: 0, row: 0 },
  { id: 'ranger', type: 'portrait', col: 1, row: 0 },
  { id: 'elementalist', type: 'portrait', col: 2, row: 0 },
  { id: 'chronomancer', type: 'portrait', col: 3, row: 0 },
  // Row 1: Sprites
  { id: 'blade-warden', type: 'sprite', col: 0, row: 1 },
  { id: 'ranger', type: 'sprite', col: 1, row: 1 },
  { id: 'elementalist', type: 'sprite', col: 2, row: 1 },
  { id: 'chronomancer', type: 'sprite', col: 3, row: 1 },
  // Row 2: Portraits
  { id: 'oracle', type: 'portrait', col: 0, row: 2 },
  { id: 'rogue', type: 'portrait', col: 1, row: 2 },
  { id: 'lancer', type: 'portrait', col: 2, row: 2 },
  { id: 'juggernaut', type: 'portrait', col: 3, row: 2 },
  // Row 3: Sprites
  { id: 'oracle', type: 'sprite', col: 0, row: 3 },
  { id: 'rogue', type: 'sprite', col: 1, row: 3 },
  { id: 'lancer', type: 'sprite', col: 2, row: 3 },
  { id: 'juggernaut', type: 'sprite', col: 3, row: 3 },
];

async function processWardenAssets() {
  const image = sharp('public/assets/warden-classes.jpg');

  for (const item of classGrid) {
    const left = item.col * 256;
    const top = item.row * 256;
    const width = 256;
    const height = 256;

    // Extract cell
    const cellBuffer = await image.clone().extract({ left, top, width, height }).toBuffer();

    // Make background transparent (keying out checkerboard/light pixels)
    // Checkerboard is near-white or light grey: r > 210, g > 210, b > 210
    const { data, info } = await sharp(cellBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Key out outer background pixels while preserving character
    // We can do a flood fill or simple color distance check:
    // Notice checkerboard in the image is ~ (220-255, 220-255, 220-255)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      // Checkerboard is nearly neutral grey/white
      if (r > 200 && g > 200 && b > 200 && maxDiff < 18) {
        data[i + 3] = 0; // transparent
      } else if (r > 185 && g > 185 && b > 185 && maxDiff < 12) {
        data[i + 3] = 0;
      }
    }

    const destFile =
      item.type === 'portrait'
        ? `public/assets/portraits/${item.id}.png`
        : `public/assets/sprites/${item.id}.png`;

    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .png()
      .toFile(destFile);

    console.log(`Saved ${destFile}`);
  }
}

// 2. Process Monsters (1024x1024, 2 columns x 4 rows, each 512x256)
const monsterPanels = [
  { id: 'skulker', col: 0, row: 0 },
  { id: 'swiftbeak', col: 1, row: 0 },
  { id: 'prismatic-ooze', col: 0, row: 1 },
  { id: 'pyre-core', col: 1, row: 1 },
  { id: 'dread-gaze', col: 0, row: 2 },
  { id: 'bonewalker', col: 1, row: 2 },
  { id: 'bramble-golem', col: 0, row: 3 },
  { id: 'sky-sovereign', col: 1, row: 3 },
];

async function processMonsterAssets() {
  const image = sharp('public/assets/monster-creeps.jpg');

  for (const item of monsterPanels) {
    const left = item.col * 512;
    const top = item.row * 256;

    // Portrait inset is roughly at right side: x in [380..500], y in [10..130] within panel
    const portraitBuffer = await image
      .clone()
      .extract({ left: left + 370, top: top + 5, width: 135, height: 135 })
      .png()
      .toFile(`public/assets/monsters/${item.id}-portrait.png`);

    // Main sprite is on the left side of panel: x in [10..360], y in [10..245]
    const spriteBuffer = await image
      .clone()
      .extract({ left: left + 10, top: top + 10, width: 350, height: 236 })
      .toBuffer();

    const { data, info } = await sharp(spriteBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (r > 195 && g > 195 && b > 195 && maxDiff < 18) {
        data[i + 3] = 0;
      }
    }

    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .png()
      .toFile(`public/assets/monsters/${item.id}-sprite.png`);

    console.log(`Saved monster ${item.id}`);
  }
}

async function processUiAndTileAssets() {
  const image = sharp('public/assets/tactics-ui-tiles.jpg');

  // Top-left: Classic Blue Dialog Window Frame (512x512)
  await image
    .clone()
    .extract({ left: 0, top: 0, width: 512, height: 512 })
    .png()
    .toFile('public/assets/tactics-window-frame.png');

  // Top-right: Crystal Altar (512x512)
  const crystalBuffer = await image
    .clone()
    .extract({ left: 512, top: 0, width: 512, height: 512 })
    .toBuffer();

  const { data, info } = await sharp(crystalBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (r > 190 && g > 185 && b > 180 && maxDiff < 15) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile('public/assets/crystal-altar.png');

  // Bottom-left: 4 terrain blocks (each 256x256 inside bottom-left 512x512)
  // Grass (0, 512)
  await image
    .clone()
    .extract({ left: 0, top: 512, width: 256, height: 256 })
    .png()
    .toFile('public/assets/tile-grass.png');

  // Stone cobblestone (256, 512)
  await image
    .clone()
    .extract({ left: 256, top: 512, width: 256, height: 256 })
    .png()
    .toFile('public/assets/tile-cobblestone.png');

  // Lava / volcanic rock (0, 768)
  await image
    .clone()
    .extract({ left: 0, top: 768, width: 256, height: 256 })
    .png()
    .toFile('public/assets/tile-volcanic.png');

  // Runic maze barricade cube (256, 768)
  await image
    .clone()
    .extract({ left: 256, top: 768, width: 256, height: 256 })
    .png()
    .toFile('public/assets/tile-runic-barricade.png');

  console.log('UI and terrain assets processed successfully!');
}

async function run() {
  await processWardenAssets();
  await processMonsterAssets();
  await processUiAndTileAssets();
  console.log('All assets processed successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
