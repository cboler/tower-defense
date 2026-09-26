import sharp from 'sharp';
import fs from 'fs';

function cleanSpriteAlpha(data, width, height) {
  // A pixel is background if it is neutral gray or white from the checkerboard pattern
  function isChecker(x, y) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    return r > 155 && g > 155 && b > 155 && maxDiff < 22;
  }

  const visited = new Uint8Array(width * height);
  const queue = [];

  // Seed all borders
  for (let x = 0; x < width; x++) {
    if (isChecker(x, 0)) queue.push([x, 0]);
    if (isChecker(x, height - 1)) queue.push([x, height - 1]);
  }
  for (let y = 0; y < height; y++) {
    if (isChecker(0, y)) queue.push([0, y]);
    if (isChecker(width - 1, y)) queue.push([width - 1, y]);
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.pop();
    const idx = cy * width + cx;
    if (visited[idx]) continue;
    visited[idx] = 1;

    // Set transparent
    data[idx * 4 + 3] = 0;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (!visited[nIdx] && isChecker(nx, ny)) {
          queue.push([nx, ny]);
        }
      }
    }
  }

  // Second pass: any remaining enclosed checkerboard pockets (like between arm and hip)
  // If a pixel matches checkerboard and has alpha still 255, test if it's connected to character or a checker tile
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (data[idx * 4 + 3] > 0 && isChecker(x, y)) {
        // Clear isolated checkerboard pixel pockets
        data[idx * 4 + 3] = 0;
      }
    }
  }
}

async function extractSprites() {
  const monsterImg = sharp('public/assets/monster-creeps.jpg');

  const monsters = [
    { id: 'skulker', left: 12, top: 40, width: 178, height: 180 },
    { id: 'swiftbeak', left: 528, top: 15, width: 185, height: 195 },
    { id: 'prismatic-ooze', left: 16, top: 305, width: 185, height: 165 },
    { id: 'pyre-core', left: 526, top: 268, width: 195, height: 195 },
    { id: 'dread-gaze', left: 5, top: 540, width: 232, height: 175 },
    { id: 'bonewalker', left: 526, top: 538, width: 185, height: 185 },
    { id: 'bramble-golem', left: 10, top: 780, width: 228, height: 218 },
    { id: 'sky-sovereign', left: 520, top: 778, width: 255, height: 218 },
  ];

  for (const m of monsters) {
    const buf = await monsterImg.clone().extract(m).toBuffer();
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    cleanSpriteAlpha(data, info.width, info.height);

    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toFile(`public/assets/monsters/${m.id}-sprite.png`);

    console.log(`Extracted monster: ${m.id}`);
  }

  const wardenImg = sharp('public/assets/warden-classes.jpg');

  const wardens = [
    { id: 'blade-warden', left: 15, top: 315, width: 195, height: 185 },
    { id: 'ranger', left: 285, top: 310, width: 160, height: 190 },
    { id: 'elementalist', left: 540, top: 305, width: 160, height: 195 },
    { id: 'chronomancer', left: 795, top: 305, width: 175, height: 195 },
    { id: 'oracle', left: 35, top: 805, width: 160, height: 195 },
    { id: 'rogue', left: 295, top: 805, width: 175, height: 195 },
    { id: 'lancer', left: 535, top: 800, width: 180, height: 200 },
    { id: 'juggernaut', left: 765, top: 805, width: 210, height: 195 },
  ];

  for (const w of wardens) {
    const buf = await wardenImg.clone().extract(w).toBuffer();
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    cleanSpriteAlpha(data, info.width, info.height);

    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toFile(`public/assets/sprites/${w.id}.png`);

    console.log(`Extracted warden sprite: ${w.id}`);
  }
}

extractSprites().catch(console.error);
