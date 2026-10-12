// Publishes authored models for the board:
//   art/models/source/<heroes|monsters>/<id>.glb  →  public/assets/models/<kind>/<id>.glb
// Joins same-material parts, welds, decimates to the triangle budget, shrinks textures to WebP,
// strips PBR maps the cel shading ignores, and meshopt-compresses. Then rewrites public/assets/models/manifest.json from
// everything published, merged with the per-model settings in art/models/models.json.
// Usage: node scripts/optimize-models.mjs [id ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import prettier from 'prettier';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  join,
  meshopt,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const KINDS = ['heroes', 'monsters'];
/** Per-model budgets; override with "maxTriangles" / "textureSize" in models.json. */
const DEFAULTS = { maxTriangles: 10000, textureSize: 512 };
const SIZE_WARNING = 400 * 1024;
/** Build-time options that don't belong in the runtime manifest. */
const BUILD_ONLY = new Set(['maxTriangles', 'textureSize']);

const root = path.resolve('.');
const sourceDir = path.join(root, 'art/models/source');
const publishDir = path.join(root, 'public/assets/models');
const settings = JSON.parse(await fs.readFile(path.join(root, 'art/models/models.json'), 'utf8'));
const only = new Set(process.argv.slice(2));

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const logger = new Logger(Logger.Verbosity.WARN);
const io = new NodeIO().setLogger(logger).registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

/** Triangles drawn, counting a mesh once per node that places it. */
function countTriangles(document) {
  let total = 0;
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;
      const indices = primitive.getIndices();
      total += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return total;
}

/**
 * Flat-coloured parts (Blender blockouts, low-poly kits) become vertex colours on one shared
 * material, so join() can merge each joint's parts into a single draw call. Textured, glowing
 * and see-through materials keep their own.
 */
function flatColorsToVertexColors(document) {
  const root = document.getRoot();
  const shared = new Map();
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      if (!material || primitive.getAttribute('COLOR_0')) continue;
      if (material.getBaseColorTexture() || material.getEmissiveTexture()) continue;
      if (material.getEmissiveFactor().some((v) => v > 0)) continue;
      if (material.getAlphaMode() !== 'OPAQUE') continue;
      const [r, g, b] = material.getBaseColorFactor();
      const position = primitive.getAttribute('POSITION');
      const colors = new Float32Array(position.getCount() * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
      primitive.setAttribute(
        'COLOR_0',
        document.createAccessor().setType('VEC3').setArray(colors).setBuffer(position.getBuffer()),
      );
      const key = material.getDoubleSided() ? 'double' : 'single';
      if (!shared.has(key)) {
        shared.set(
          key,
          document
            .createMaterial(`vertex-colour-${key}`)
            .setDoubleSided(material.getDoubleSided())
            .setRoughnessFactor(material.getRoughnessFactor())
            .setMetallicFactor(material.getMetallicFactor()),
        );
      }
      primitive.setMaterial(shared.get(key));
    }
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
let failed = false;

for (const kind of KINDS) {
  const files = await fs.readdir(path.join(sourceDir, kind)).catch(() => []);
  for (const file of files.filter((name) => /\.(glb|gltf)$/i.test(name))) {
    const id = path.parse(file).name;
    if (only.size && !only.has(id)) continue;
    const options = { ...DEFAULTS, ...settings[kind]?.[id] };
    const source = path.join(sourceDir, kind, file);
    let document;
    try {
      document = (await io.read(source)).setLogger(logger);
    } catch (error) {
      failed = true;
      console.error(`✗ ${kind}/${file}: ${error.message}`);
      if (/draco/i.test(error.message)) {
        console.error('  Re-export without Draco compression; meshopt is applied here instead.');
      }
      continue;
    }

    const before = countTriangles(document);
    if (options.toon !== false) {
      // Cel shading only reads colour and emissive maps
      for (const material of document.getRoot().listMaterials()) {
        material.setNormalTexture(null);
        material.setOcclusionTexture(null);
        material.setMetallicRoughnessTexture(null);
      }
    }
    flatColorsToVertexColors(document);
    await document.transform(
      dedup(),
      prune(),
      // Merge same-material parts into one draw call; named nodes are animated joints
      join({ keepNamed: true }),
      weld(),
      resample(),
      ...(before > options.maxTriangles
        ? [
            simplify({
              simplifier: MeshoptSimplifier,
              ratio: options.maxTriangles / before,
              error: 0.02,
            }),
          ]
        : []),
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [options.textureSize, options.textureSize],
      }),
      prune(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );

    const target = path.join(publishDir, kind, `${id}.glb`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await io.write(target, document);
    const after = countTriangles(document);
    const { size } = await fs.stat(target);
    const sourceSize = (await fs.stat(source)).size;
    const warnings = [
      after > options.maxTriangles ? `over the ${options.maxTriangles}-triangle budget` : '',
      size > SIZE_WARNING ? `over ${kb(SIZE_WARNING)}` : '',
    ].filter(Boolean);
    console.log(
      `${warnings.length ? '!' : '✓'} ${kind}/${id}: ${before} → ${after} triangles, ` +
        `${kb(sourceSize)} → ${kb(size)}${warnings.length ? ` (${warnings.join(', ')})` : ''}`,
    );
  }
}

// The manifest lists what is published, so sources can live outside the repo
const manifest = { heroes: {}, monsters: {} };
for (const kind of KINDS) {
  const files = await fs.readdir(path.join(publishDir, kind)).catch(() => []);
  for (const file of files.filter((name) => name.endsWith('.glb')).sort()) {
    const id = path.basename(file, '.glb');
    const full = path.join(publishDir, kind, file);
    const document = await io.read(full);
    const runtime = Object.fromEntries(
      Object.entries(settings[kind]?.[id] ?? {}).filter(([key]) => !BUILD_ONLY.has(key)),
    );
    manifest[kind][id] = {
      file: `${kind}/${file}`,
      ...runtime,
      triangles: countTriangles(document),
      bytes: (await fs.stat(full)).size,
      clipNames: document
        .getRoot()
        .listAnimations()
        .map((clip) => clip.getName()),
    };
  }
}
const manifestFile = path.join(publishDir, 'manifest.json');
const style = (await prettier.resolveConfig(manifestFile)) ?? {};
await fs.writeFile(
  manifestFile,
  await prettier.format(JSON.stringify(manifest), { ...style, filepath: manifestFile }),
);
const published = KINDS.flatMap((kind) => Object.keys(manifest[kind]));
console.log(
  `manifest.json lists ${published.length} model(s)${published.length ? ': ' : ''}${published.join(', ')}`,
);
if (failed) process.exitCode = 1;
