import sharp from 'sharp';

async function processAdvSprites() {
  const list = [
    {
      file: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/red_mage_sprite_1790463834574.jpg',
      out: 'public/assets/sprites/red-mage.png',
      crop: { left: 80, top: 40, width: 860, height: 940 },
    },
    {
      file: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/ninja_sprite_1790463853469.jpg',
      out: 'public/assets/sprites/ninja.png',
      crop: { left: 140, top: 50, width: 750, height: 920 },
    },
    {
      file: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/samurai_sprite_1790463871038.jpg',
      out: 'public/assets/sprites/samurai.png',
      crop: { left: 200, top: 5, width: 680, height: 900 },
    },
    {
      file: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/paladin_sprite_1790463886758.jpg',
      out: 'public/assets/sprites/paladin.png',
      crop: { left: 100, top: 60, width: 820, height: 880 },
    },
    {
      file: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/astrologian_sprite_1790463902684.jpg',
      out: 'public/assets/sprites/astrologian.png',
      crop: { left: 120, top: 50, width: 780, height: 930 },
    },
  ];

  for (const item of list) {
    const cropped = await sharp(item.file)
      .extract(item.crop)
      .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toBuffer();

    const { data, info } = await sharp(cropped)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Key out white / near-white background
    const width = info.width;
    const height = info.height;
    const visited = new Uint8Array(width * height);
    const queue = [];

    function isBg(x, y) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      return r > 240 && g > 240 && b > 240;
    }

    for (let x = 0; x < width; x++) {
      if (isBg(x, 0)) queue.push([x, 0]);
      if (isBg(x, height - 1)) queue.push([x, height - 1]);
    }
    for (let y = 0; y < height; y++) {
      if (isBg(0, y)) queue.push([0, y]);
      if (isBg(width - 1, y)) queue.push([width - 1, y]);
    }

    while (queue.length > 0) {
      const [cx, cy] = queue.pop();
      const idx = cy * width + cx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      data[idx * 4 + 3] = 0;

      const nbs = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of nbs) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (!visited[nIdx] && isBg(nx, ny)) {
            queue.push([nx, ny]);
          }
        }
      }
    }

    // Also remove any remaining near-white pixels near outer edge
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx] > 248 && data[idx + 1] > 248 && data[idx + 2] > 248) {
          data[idx + 3] = 0;
        }
      }
    }

    await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(item.out);
    console.log(`Saved clean advanced sprite: ${item.out}`);
  }
}

processAdvSprites().catch(console.error);
