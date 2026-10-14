// Renders heroes' recruit portraits and full-body sprites from their battlefield models (the
// authored glTF when one is published, else the sculpted miniature), so every class's pictures
// share one look: the same bust framing on the head, portrait lighting, cel shading and ink, on a
// backdrop in the class colour. Uses Playwright's Chromium for WebGL.
// Usage: node scripts/render-hero-art.mjs [classId ...] [--out <dir>]
//   No class ids renders every hero. --out writes there instead of public/assets (for review).
import fs from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';
import sharp from 'sharp';
import { chromium } from 'playwright';

const root = path.resolve('.');
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outRoot = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : path.join(root, 'public/assets');
// Class ids are every argument except --out and the directory after it
const only = args.filter((a, i) => !a.startsWith('--') && !(outFlag >= 0 && i === outFlag + 1));

/** Rendered at twice the final size and scaled down, for clean edges and ink lines. */
const SUPERSAMPLE = 2;
const PORTRAIT = 256;
const SPRITE = [160, 195];
/** Busts turn the hero toward its weapon hand's far side; these carry theirs high, so face front. */
const BUST_YAW = { juggernaut: 0.32, lancer: 0.3 };

const entry = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { animateModel, createHeroModel } from './src/app/game/battle-map/battlefield-models';
import { instantiateModel } from './src/app/game/battle-map/imported-models';
import { TOWER_CLASSES } from './src/app/core/models/tower.model';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x000000, 0);

// Portrait lighting: a warm key from the upper left, a soft fill and a cool rim behind
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x3a3346, 1.7));
const key = new THREE.DirectionalLight(0xffe2bd, 3.4);
key.position.set(-6, 9, 9);
const fill = new THREE.DirectionalLight(0x9cc7ff, 0.8);
fill.position.set(8, 3, 6);
const rim = new THREE.DirectionalLight(0xc4b5fd, 2.2);
rim.position.set(4, 6, -9);
scene.add(key, fill, rim);

let model = null;
window.heroes = () =>
  Object.values(TOWER_CLASSES)
    .filter((c) => c.id !== 'barricade')
    .map((c) => ({ id: c.id, color: c.color }));

window.load = async (id, glb, settings) => {
  if (model) scene.remove(model);
  if (glb) {
    const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0)).buffer;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
    const sculpted = createHeroModel(id);
    const height = new THREE.Box3().setFromObject(sculpted).getSize(new THREE.Vector3()).y;
    model = instantiateModel({ scene: gltf.scene, animations: gltf.animations }, settings, height, {}).root;
  } else {
    model = createHeroModel(id);
  }
  animateModel(model, 0, 0, 0);
  scene.add(model);
};

/**
 * Full body: framed on the whole model. Bust: framed on the head joint at a fixed distance, so
 * every hero's face lands in the same place whatever hat or staff they carry.
 */
window.shot = (o) => {
  model.rotation.y = o.yaw;
  model.updateMatrixWorld(true);
  const target = new THREE.Vector3();
  let distance;
  const head = model.getObjectByName('head');
  if (o.bust && head) {
    head.getWorldPosition(target);
    target.y += 0.02;
    distance = 2.05;
  } else {
    const box = new THREE.Box3().setFromObject(model);
    const height = box.getSize(new THREE.Vector3()).y;
    box.getCenter(target);
    distance = height * 3.2;
  }
  renderer.setSize(o.w, o.h, false);
  const camera = new THREE.PerspectiveCamera(24, o.w / o.h, 0.05, 50);
  camera.position.set(target.x, target.y + distance * 0.16, target.z + distance);
  camera.lookAt(target);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};
`;

const bundle = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'iife',
  logLevel: 'warning',
});

const manifest = JSON.parse(
  await fs.readFile(path.join(root, 'public/assets/models/manifest.json'), 'utf8'),
);
const settings = JSON.parse(
  await fs.readFile(path.join(root, 'art/models/models.json'), 'utf8').catch(() => '{}'),
);

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(error.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

const shot = async (options) => {
  const url = await page.evaluate((o) => window.shot(o), options);
  return Buffer.from(url.split(',')[1], 'base64');
};

/** The portrait card: the class colour glowing from behind the hero into a dark navy edge. */
function backdrop(size, color) {
  const hex = `#${color.replace('#', '')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <radialGradient id="g" cx="50%" cy="38%" r="70%">
        <stop offset="0" stop-color="${hex}" stop-opacity="0.95"/>
        <stop offset="0.45" stop-color="${hex}" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#0b1220" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="#0b1220"/>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

const heroes = (await page.evaluate(() => window.heroes())).filter(
  (h) => !only.length || only.includes(h.id),
);
await fs.mkdir(path.join(outRoot, 'portraits'), { recursive: true });
await fs.mkdir(path.join(outRoot, 'sprites'), { recursive: true });

for (const { id, color } of heroes) {
  const entry = manifest.heroes?.[id];
  const glb = entry
    ? (await fs.readFile(path.join(root, 'public/assets/models', entry.file))).toString('base64')
    : null;
  await page.evaluate(([i, g, s]) => window.load(i, g, s), [id, glb, settings.heroes?.[id] ?? {}]);

  // Full body, turned a little to its left, transparent for the battle fallback grid
  const [sw, sh] = SPRITE;
  const body = await shot({ w: 640, h: 760, yaw: 0.3 });
  await sharp(body)
    .trim()
    .resize(sw, sh, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outRoot, 'sprites', `${id}.png`));

  // Head-and-shoulders bust, turned the other way so a raised weapon clears the face
  const size = PORTRAIT * SUPERSAMPLE;
  const bust = await shot({ w: size, h: size, yaw: BUST_YAW[id] ?? -0.42, bust: true });
  const hero = await sharp(bust)
    .resize(PORTRAIT, PORTRAIT, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  await sharp(backdrop(PORTRAIT, color))
    .composite([{ input: hero }])
    .png()
    .toFile(path.join(outRoot, 'portraits', `${id}.png`));
  console.log(`✓ ${id}${entry ? ' (authored)' : ''}`);
}

await browser.close();
