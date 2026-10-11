// Renders a hero's battlefield miniature to its recruit portrait and sprite, for classes
// that have no painted artwork. Uses Playwright's Chromium for WebGL.
// Usage: node scripts/render-hero-art.mjs <classId>
import path from 'node:path';
import esbuild from 'esbuild';
import sharp from 'sharp';
import { chromium } from 'playwright';

const classId = process.argv[2];
if (!classId) {
  console.error('Usage: node scripts/render-hero-art.mjs <classId>');
  process.exit(1);
}

const root = path.resolve('.');

// Same lights and tone mapping as the /models gallery, on a transparent background
const entry = `
import * as THREE from 'three';
import { animateModel, createHeroModel } from './src/app/game/battle-map/battlefield-models';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xc7e6ff, 0x394b47, 2.0));
const sun = new THREE.DirectionalLight(0xffe4b5, 3.2);
sun.position.set(-9, 19, 11);
const fill = new THREE.DirectionalLight(0x38bdf8, 0.9);
fill.position.set(10, 8, -8);
const rim = new THREE.DirectionalLight(0xa855f7, 0.75);
rim.position.set(0, -6, -10);
scene.add(sun, fill, rim);

const model = createHeroModel(${JSON.stringify(classId)});
animateModel(model, 0, 0, 0);
scene.add(model);

window.renderShot = (shot) => {
  model.rotation.y = shot.yaw;
  const box = new THREE.Box3().setFromObject(model);
  const height = box.getSize(new THREE.Vector3()).y;
  const center = box.getCenter(new THREE.Vector3());
  center.y = box.min.y + height * shot.focus;
  const [w, h] = shot.size;
  renderer.setSize(w, h, false);
  const camera = new THREE.PerspectiveCamera(24, w / h, 0.05, 50);
  camera.position.set(
    center.x + height * shot.distance * 0.3,
    center.y + height * shot.lift,
    center.z + height * shot.distance,
  );
  camera.lookAt(center);
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

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(error.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

const shot = async (options) => {
  const url = await page.evaluate((o) => window.renderShot(o), options);
  return Buffer.from(url.split(',')[1], 'base64');
};

// Full body, feet to headgear, sized like the painted sprites
const sprite = await shot({ size: [640, 760], focus: 0.5, distance: 3.2, lift: 0.35, yaw: 0.2 });
await sharp(sprite)
  .trim()
  .resize(160, 195, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(root, `public/assets/sprites/${classId}.png`));

// Head-and-shoulders bust for the recruit cards and dossier header
const portrait = await shot({
  size: [768, 768],
  focus: 0.72,
  distance: 1.55,
  lift: 0.12,
  yaw: 0.2,
});
await sharp(portrait)
  .resize(256, 256)
  .png()
  .toFile(path.join(root, `public/assets/portraits/${classId}.png`));

await browser.close();
console.log(`Rendered ${classId} portrait and sprite.`);
