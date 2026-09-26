import sharp from 'sharp';

async function testExtract() {
  const image = sharp('public/assets/monster-creeps.jpg');
  // Panel 0: Skulker (col 0, row 0). Big character is approximately:
  // left: 10, top: 40, width: 170, height: 180
  const buffer = await image
    .clone()
    .extract({ left: 15, top: 40, width: 175, height: 185 })
    .toBuffer();

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  // Flood fill from borders
  // A pixel is background if it's close to neutral gray or white (checkerboard)
  function isChecker(x, y) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    // Checkerboard squares in AI images are usually R,G,B > 175 and maxDiff < 15
    return r > 165 && g > 165 && b > 165 && maxDiff < 20;
  }

  const visited = new Uint8Array(width * height);
  const queue = [];

  // Seed borders
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

  await sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(
      'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/test_skulker.png',
    );

  console.log('Saved test_skulker.png');
}

testExtract().catch(console.error);
