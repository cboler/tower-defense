// Exports every sculpted miniature as a .glb blockout for Blender, or as a reference for
// image-to-3D tools. Joints keep their names (arm-right, leg-left...) and carry Idle and
// Attack clips (heroes) or a Walk clip (monsters) sampled from the procedural animation.
// Usage: node scripts/export-blockouts.mjs [id ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';

const root = path.resolve('.');
const outDir = path.join(root, 'art/models/blockouts');

const entry = `
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  animateModel,
  createHeroModel,
  createMonsterModel,
} from './src/app/game/battle-map/battlefield-models';
import { TOWER_CLASSES } from './src/app/core/models/tower.model';
import { MOB_TYPES } from './src/app/core/models/mob.model';

const JOINTS = ['leg-left', 'leg-right', 'arm-left', 'arm-right', 'cape', 'tail',
  'wing-left', 'wing-right', 'orbit', 'focus'];

/** Records joint rotations while pose(u) sweeps u from 0 to 1; still joints are skipped. */
function sample(model, name, duration, fps, pose) {
  const nodes = JOINTS.map((n) => model.getObjectByName(n)).filter(Boolean);
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = [];
  const values = nodes.map(() => []);
  for (let i = 0; i < frames; i++) {
    pose(i / (frames - 1));
    times.push((i / (frames - 1)) * duration);
    nodes.forEach((node, k) => values[k].push(...node.quaternion.toArray()));
  }
  animateModel(model, 0, 0, 0);
  const tracks = nodes
    .map((node, k) => new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', times, values[k]))
    .filter((track) => track.values.some((v, i) => Math.abs(v - track.values[i % 4]) > 1e-5));
  return tracks.length ? new THREE.AnimationClip(name, duration, tracks) : null;
}

/** Toon materials don't survive glTF; standard ones carry the same colours into Blender. */
function standardMaterials(model) {
  model.traverse((object) => {
    if (!object.isMesh) return;
    const toon = object.material;
    object.material = new THREE.MeshStandardMaterial({
      name: toon.name,
      color: toon.color,
      emissive: toon.emissive,
      emissiveIntensity: toon.emissiveIntensity,
      roughness: 0.85,
      metalness: 0,
      side: toon.side,
    });
  });
}

export async function exportAll(only) {
  const pieces = [
    ...Object.keys(TOWER_CLASSES)
      .filter((id) => id !== 'barricade')
      .map((id) => ({ kind: 'heroes', id, model: createHeroModel(id, { outline: false }) })),
    ...Object.keys(MOB_TYPES).map((id) => ({
      kind: 'monsters',
      id,
      model: createMonsterModel(id, { outline: false }),
    })),
  ].filter((piece) => !only.length || only.includes(piece.id));

  const exporter = new GLTFExporter();
  const results = [];
  for (const { kind, id, model } of pieces) {
    // Face +z without the board's three-quarter turn
    model.rotation.y = 0;
    model.name = id;
    const clips =
      kind === 'heroes'
        ? [
            // Cape, orbit and focus all complete whole cycles over 20 pi
            sample(model, 'Idle', (Math.PI * 20) / 2.4, 6, (u) =>
              animateModel(model, u * Math.PI * 20, 0, 0),
            ),
            sample(model, 'Attack', 0.4, 30, (u) =>
              animateModel(model, 0, 0, Math.sin(u * Math.PI)),
            ),
          ]
        : [
            sample(model, 'Walk', 0.8, 30, (u) => animateModel(model, u * Math.PI * 2, 0.55, 0)),
          ];
    standardMaterials(model);
    const buffer = await exporter.parseAsync(model, {
      binary: true,
      animations: clips.filter(Boolean),
    });
    results.push({ kind, id, buffer });
  }
  return results;
}
`;

// GLTFExporter reads its output back through FileReader, which Node lacks
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const bundle = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
const code = Buffer.from(bundle.outputFiles[0].text).toString('base64');
const { exportAll } = await import(`data:text/javascript;base64,${code}`);

for (const { kind, id, buffer } of await exportAll(process.argv.slice(2))) {
  const file = path.join(outDir, kind, `${id}.glb`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(buffer));
  console.log(`${path.relative(root, file)}  ${(buffer.byteLength / 1024).toFixed(0)} KB`);
}
