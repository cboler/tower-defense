// Renders every piece's pictures from its battlefield model (the authored glTF when one is
// published, else the sculpted miniature), so heroes and monsters share one look across the game:
// portrait lighting, cel shading and ink, on a backdrop in the piece's colour.
//   Heroes:   public/assets/portraits/<id>.png (bust framed on the head) and sprites/<id>.png
//   Monsters: public/assets/monsters/<id>-portrait.png (the creature framed whole, as many have
//             no head and shoulders) and <id>-sprite.png
// Uses Playwright's Chromium for WebGL.
// Usage: node scripts/render-art.mjs [id ...] [--out <dir>]
//   No ids renders every hero and monster. --out writes there instead of public/assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';
import sharp from 'sharp';
import { chromium } from 'playwright';

const root = path.resolve('.');
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outRoot = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : path.join(root, 'public/assets');
// Ids are every argument except --out and the directory after it
const only = args.filter((a, i) => !a.startsWith('--') && !(outFlag >= 0 && i === outFlag + 1));

/** Rendered at twice the final size and scaled down, for clean edges and ink lines. */
const SUPERSAMPLE = 2;
const PORTRAIT = 256;
const HERO_SPRITE = [160, 195];
const MONSTER_SPRITE = [200, 200];
/** Busts turn the hero toward its weapon hand's far side; these carry theirs high, so face front. */
const BUST_YAW = { juggernaut: 0.32, lancer: 0.3 };
/** Monster portraits turn to the left, except where a hood or crest would hide the face. */
const CREATURE_YAW = { skulker: 0.35 };

const entry = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { animateModel, createHeroModel, createMonsterModel } from './src/app/game/battle-map/battlefield-models';
import { instantiateModel } from './src/app/game/battle-map/imported-models';
import { TOWER_CLASSES } from './src/app/core/models/tower.model';
import { MOB_TYPES } from './src/app/core/models/mob.model';

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
window.pieces = () => [
  ...Object.values(TOWER_CLASSES)
    .filter((c) => c.id !== 'barricade')
    .map((c) => ({ kind: 'heroes', id: c.id, color: c.color })),
  ...Object.values(MOB_TYPES).map((m) => ({ kind: 'monsters', id: m.id, color: m.color })),
];

window.load = async (kind, id, glb, settings) => {
  if (model) scene.remove(model);
  const create = kind === 'heroes' ? createHeroModel : createMonsterModel;
  if (glb) {
    const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0)).buffer;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
    const sculpted = create(id);
    const height = new THREE.Box3().setFromObject(sculpted).getSize(new THREE.Vector3()).y;
    model = instantiateModel({ scene: gltf.scene, animations: gltf.animations }, settings, height, {}).root;
  } else {
    model = create(id);
  }
  animateModel(model, 0, 0, 0);
  scene.add(model);
};

/**
 * Bust: framed on the head joint at a fixed distance, so every hero's face lands in the same
 * place whatever hat or staff it carries. Creature: the whole model, a little above centre.
 * Body: the whole model, for full-length sprites.
 */
window.shot = (o) => {
  model.rotation.y = o.yaw;
  model.updateMatrixWorld(true);
  const target = new THREE.Vector3();
  let distance;
  const head = model.getObjectByName('head');
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  box.getCenter(target);
  if (o.frame === 'bust' && head) {
    head.getWorldPosition(target);
    target.y += 0.02;
    distance = 2.05;
  } else if (o.frame === 'creature' && head) {
    // Close on the head, scaled to the creature, so even a 32px icon reads
    head.getWorldPosition(target);
    target.y -= size.y * 0.06;
    distance = Math.max(size.x * 0.6, size.y) * 1.75;
  } else if (o.frame === 'creature') {
    target.y += size.y * 0.04;
    distance = Math.max(size.x, size.y) * 1.95;
  } else {
    distance = size.y * 3.2;
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

/** The portrait card: the piece's colour glowing from behind it into a dark navy edge. */
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

/** Writes a transparent full-length picture, trimmed and fitted to `size`. */
async function writeSprite(image, [w, h], file) {
  await sharp(image)
    .trim()
    .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(file);
}

/** Writes a portrait: the supersampled render scaled down onto the colour backdrop. */
async function writePortrait(image, color, file) {
  const piece = await sharp(image)
    .resize(PORTRAIT, PORTRAIT, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  await sharp(backdrop(PORTRAIT, color))
    .composite([{ input: piece }])
    .png()
    .toFile(file);
}

const pieces = (await page.evaluate(() => window.pieces())).filter(
  (p) => !only.length || only.includes(p.id),
);
for (const dir of ['portraits', 'sprites', 'monsters']) {
  await fs.mkdir(path.join(outRoot, dir), { recursive: true });
}

const size = PORTRAIT * SUPERSAMPLE;
for (const { kind, id, color } of pieces) {
  const entry = manifest[kind]?.[id];
  const glb = entry
    ? (await fs.readFile(path.join(root, 'public/assets/models', entry.file))).toString('base64')
    : null;
  await page.evaluate(
    ([k, i, g, s]) => window.load(k, i, g, s),
    [kind, id, glb, settings[kind]?.[id] ?? {}],
  );

  if (kind === 'heroes') {
    // Full body turned a little to its left; the bust turned the other way, so a raised weapon
    // clears the face
    const body = await shot({ w: 640, h: 760, yaw: 0.3, frame: 'body' });
    await writeSprite(body, HERO_SPRITE, path.join(outRoot, 'sprites', `${id}.png`));
    const bust = await shot({ w: size, h: size, yaw: BUST_YAW[id] ?? -0.42, frame: 'bust' });
    await writePortrait(bust, color, path.join(outRoot, 'portraits', `${id}.png`));
  } else {
    const body = await shot({ w: 720, h: 720, yaw: -0.5, frame: 'body' });
    await writeSprite(body, MONSTER_SPRITE, path.join(outRoot, 'monsters', `${id}-sprite.png`));
    const portrait = await shot({
      w: size,
      h: size,
      yaw: CREATURE_YAW[id] ?? -0.5,
      frame: 'creature',
    });
    await writePortrait(portrait, color, path.join(outRoot, 'monsters', `${id}-portrait.png`));
  }
  console.log(`✓ ${kind}/${id}${entry ? ' (authored)' : ''}`);
}

await browser.close();
