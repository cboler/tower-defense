// Bakes every hero and monster into pixel-art sprite sheets for the HD-2D look: the same
// miniature the 3D board uses (authored glTF when published, else sculpted), posed through
// the shared motions, rendered orthographically at the board camera's pitch with no
// anti-aliasing, in 8 facings, then given a 1px ink outline.
// Output: public/assets/actors/<kind>/<id>.png and public/assets/actors/actors.json
// Usage: node scripts/bake-sprites.mjs [id ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';
import sharp from 'sharp';
import prettier from 'prettier';
import { chromium } from 'playwright';

const root = path.resolve('.');
const outDir = path.join(root, 'public/assets/actors');
const only = process.argv.slice(2);
/** Pixels per tile: one shared pixel grid, so every sprite on the board matches. */
const PIXELS_PER_TILE = 36;
/**
 * Sprites are drawn from a shallow, nearly front-on angle like hand-made tactics sprites, so faces
 * read; they stand as camera-facing billboards on the steeper board.
 */
const SPRITE_PITCH_DEGREES = 25;

const entry = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { animateModel, createHeroModel, createMonsterModel } from './src/app/game/battle-map/battlefield-models';
import { instantiateModel } from './src/app/game/battle-map/imported-models';
import {
  CLASS_ATTACK, attackDuration, attackImpact, leadArm, poseAttack, poseIdle,
} from './src/app/game/battle-map/motions';
import { TOWER_CLASSES } from './src/app/core/models/tower.model';
import { MOB_TYPES } from './src/app/core/models/mob.model';

const PPU = ${PIXELS_PER_TILE};
const DIRECTIONS = 8;
const PITCH = (${SPRITE_PITCH_DEGREES} * Math.PI) / 180;
const INK = [0x1a, 0x14, 0x24];
const BOSSES = new Set(['sky-sovereign', 'bramble-golem']);
/**
 * Pixel art exaggerates weapons so they survive a 40px sprite: blades and hafts get thicker
 * (x, z) and a little longer (y, along the weapon). Sprites only; the 3D look is untouched.
 */
const WEAPON_EMPHASIS = { default: [1.8, 1.3, 1.8], juggernaut: [1.15, 1.15, 1.15], lancer: [1.8, 1.05, 1.8], chronomancer: [1.8, 1.0, 1.8], oracle: [1.8, 1.0, 1.8], elementalist: [1.4, 1.4, 1.4], astrologian: [1.4, 1.4, 1.4] };

function emphasiseWeapons(model, id) {
  const [x, y, z] = WEAPON_EMPHASIS[id] ?? WEAPON_EMPHASIS.default;
  model.getObjectByName('weapon')?.scale.multiply(new THREE.Vector3(x, y, z));
  const offhand = model.getObjectByName('offhand');
  if (!offhand) return;
  if (offhand.getObjectByName('shield')) offhand.scale.multiplyScalar(1.15);
  else if (offhand.getObjectByName('bow')) offhand.scale.multiplyScalar(1.2);
  else offhand.scale.multiply(new THREE.Vector3(...WEAPON_EMPHASIS.default));
}
/**
 * Faces must survive a 40px sprite seen from above: heroes get a bigger head tipped up toward
 * the viewer, so brims, hoods and fringes stop hiding the eyes, and bigger eyes. Sprites only.
 */
const FACE_EMPHASIS = { head: 1.14, tilt: 0.2, eyes: 1.45 };

function emphasiseFace(model) {
  const head = model.getObjectByName('head');
  if (!head) return;
  head.scale.multiplyScalar(FACE_EMPHASIS.head);
  head.rotation.x -= FACE_EMPHASIS.tilt;
  head.traverse((part) => {
    if (part.name === 'eye') part.scale.multiplyScalar(FACE_EMPHASIS.eyes);
  });
}
const IDLE_FRAMES = 4;
const ATTACK_FRAMES = 8;
const WALK_FRAMES = 8;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xc7e6ff, 0x394b47, 2.0));
const sun = new THREE.DirectionalLight(0xffe4b5, 3.2); sun.position.set(-9, 19, 11);
const fill = new THREE.DirectionalLight(0x38bdf8, 0.9); fill.position.set(10, 8, -8);
const rim = new THREE.DirectionalLight(0xa855f7, 0.75); rim.position.set(0, -6, -10);
scene.add(sun, fill, rim);

const toCamera = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
const up = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH));
const right = new THREE.Vector3(1, 0, 0);

async function piece(kind, id, glb, settings) {
  let model;
  if (glb) {
    const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0)).buffer;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
    const sculpted = kind === 'heroes' ? createHeroModel(id) : createMonsterModel(id);
    const height = new THREE.Box3().setFromObject(sculpted).getSize(new THREE.Vector3()).y;
    model = instantiateModel({ scene: gltf.scene, animations: gltf.animations }, settings, height, { outline: false }).root;
  } else {
    model = kind === 'heroes' ? createHeroModel(id, { outline: false }) : createMonsterModel(id, { outline: false });
  }
  model.rotation.set(0, 0, 0);
  emphasiseWeapons(model, id);
  if (kind === 'heroes') emphasiseFace(model);
  // Monsters are scaled on the board; bake them at that size so every sprite shares one pixel grid
  if (kind === 'monsters') model.scale.setScalar(BOSSES.has(id) ? 1.35 : 0.95);
  const holder = new THREE.Group();
  holder.add(model);
  scene.add(holder);
  return { model, holder };
}

function animationsFor(kind, id) {
  if (kind === 'monsters') {
    return [{ name: 'walk', frames: WALK_FRAMES, pose: (m, u) => animateModel(m, u * Math.PI * 2, 0.55, 0) }];
  }
  const attack = CLASS_ATTACK[id];
  const lead = leadArm(id);
  return [
    { name: 'idle', frames: IDLE_FRAMES, pose: (m, u) => poseIdle(m, u) },
    {
      name: 'attack',
      frames: ATTACK_FRAMES,
      // Skip the rest pose at either end: frames span the wind-up through the recovery
      pose: (m, u) => { poseIdle(m, 0); poseAttack(m, attack, u, lead); },
      u: (i) => (i + 1) / (ATTACK_FRAMES + 1),
      duration: attackDuration(attack),
      impact: Math.round(attackImpact(attack) * (ATTACK_FRAMES + 1) - 1),
    },
  ];
}

/** Screen-space bounds (in tiles) of every pose and facing, to size the cell. */
function measure(holder, model, animations) {
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let d = 0; d < DIRECTIONS; d++) {
    holder.rotation.y = (d / DIRECTIONS) * Math.PI * 2;
    for (const anim of animations) {
      for (let i = 0; i < anim.frames; i++) {
        anim.pose(model, anim.u ? anim.u(i) : i / anim.frames);
        holder.updateMatrixWorld(true);
        box.setFromObject(holder);
        for (let c = 0; c < 8; c++) {
          corner.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z);
          const x = corner.dot(right), y = corner.dot(up);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

window.bake = async (kind, id, glb, settings) => {
  const { model, holder } = await piece(kind, id, glb, settings);
  const animations = animationsFor(kind, id);
  const b = measure(holder, model, animations);
  // Cell symmetric about the feet, with a 2px margin for the outline; multiples of 4px
  const halfW = Math.ceil((Math.max(-b.minX, b.maxX) * PPU + 2) / 2) * 2;
  const above = Math.ceil(b.maxY * PPU + 2);
  const below = Math.ceil(-b.minY * PPU + 2);
  const cellW = Math.ceil((halfW * 2) / 4) * 4;
  const cellH = Math.ceil((above + below) / 4) * 4;
  const anchor = [cellW / 2, cellH - below];

  const columns = Math.max(...animations.map((a) => a.frames));
  const rows = animations.length * DIRECTIONS;
  const atlas = document.createElement('canvas');
  atlas.width = columns * cellW;
  atlas.height = rows * cellH;
  const ctx = atlas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Orthographic view at the board's pitch, one texel per screen pixel, feet on the anchor
  const camera = new THREE.OrthographicCamera(-cellW / 2 / PPU, cellW / 2 / PPU, cellH / 2 / PPU, -cellH / 2 / PPU, 0.01, 40);
  const target = up.clone().multiplyScalar((cellH / 2 - below) / PPU);
  camera.position.copy(target).addScaledVector(toCamera, 15);
  camera.up.copy(up);
  camera.lookAt(target);
  renderer.setSize(cellW, cellH, false);

  const meta = { cell: [cellW, cellH], anchor, directions: DIRECTIONS, animations: {} };
  animations.forEach((anim, a) => {
    meta.animations[anim.name] = {
      row: a * DIRECTIONS,
      frames: anim.frames,
      ...(anim.duration ? { duration: anim.duration, impact: anim.impact } : {}),
    };
    for (let d = 0; d < DIRECTIONS; d++) {
      holder.rotation.y = (d / DIRECTIONS) * Math.PI * 2;
      for (let i = 0; i < anim.frames; i++) {
        anim.pose(model, anim.u ? anim.u(i) : i / anim.frames);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, i * cellW, (a * DIRECTIONS + d) * cellH);
      }
    }
  });
  scene.remove(holder);

  // Hard alpha, then a 1px ink outline around every silhouette, kept inside its own cell
  const image = ctx.getImageData(0, 0, atlas.width, atlas.height);
  const px = image.data;
  for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 128 ? 255 : 0;
  const solid = new Uint8Array(atlas.width * atlas.height);
  for (let i = 0; i < solid.length; i++) solid[i] = px[i * 4 + 3] ? 1 : 0;
  for (let y = 0; y < atlas.height; y++) {
    for (let x = 0; x < atlas.width; x++) {
      const i = y * atlas.width + x;
      if (solid[i]) continue;
      const cx = x % cellW, cy = y % cellH;
      const near =
        (cx > 0 && solid[i - 1]) || (cx < cellW - 1 && solid[i + 1]) ||
        (cy > 0 && solid[i - atlas.width]) || (cy < cellH - 1 && solid[i + atlas.width]);
      if (near) px.set([...INK, 255], i * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  return { meta, png: atlas.toDataURL('image/png') };
};

window.pieces = () => ({
  heroes: Object.keys(TOWER_CLASSES).filter((id) => id !== 'barricade'),
  monsters: Object.keys(MOB_TYPES),
});
`;

const bundle = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'iife',
  logLevel: 'warning',
});

const manifestFile = path.join(root, 'public/assets/models/manifest.json');
const models = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
const sheetsFile = path.join(outDir, 'actors.json');
const sheets = await fs
  .readFile(sheetsFile, 'utf8')
  .then((text) => JSON.parse(text))
  .catch(() => ({ pixelsPerTile: PIXELS_PER_TILE, heroes: {}, monsters: {} }));
sheets.pixelsPerTile = PIXELS_PER_TILE;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(error.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

const all = await page.evaluate(() => window.pieces());
for (const kind of ['heroes', 'monsters']) {
  for (const id of all[kind]) {
    if (only.length && !only.includes(id)) continue;
    const entry = models[kind]?.[id];
    const glb = entry
      ? (await fs.readFile(path.join(root, 'public/assets/models', entry.file))).toString('base64')
      : null;
    const { meta, png } = await page.evaluate(
      ([k, i, g, s]) => window.bake(k, i, g, s),
      [kind, id, glb, entry ?? {}],
    );
    const file = path.join(outDir, kind, `${id}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Palette PNG: lossless for pixel art with few colours, and much smaller
    await sharp(Buffer.from(png.split(',')[1], 'base64'))
      .png({ palette: true, colours: 256, dither: 0, compressionLevel: 9 })
      .toFile(file);
    sheets[kind][id] = { file: `${kind}/${id}.png`, ...meta };
    const { size } = await fs.stat(file);
    console.log(
      `✓ ${kind}/${id}: ${meta.cell.join('×')} cells, ${(size / 1024).toFixed(0)} KB${entry ? ' (authored)' : ''}`,
    );
  }
}
await browser.close();

const style = (await prettier.resolveConfig(sheetsFile)) ?? {};
await fs.writeFile(
  sheetsFile,
  await prettier.format(JSON.stringify(sheets), { ...style, filepath: sheetsFile }),
);
