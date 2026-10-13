// Builds authored models from the Blender scripts in art/models/blender/<kind>/<id>.py, headless,
// into art/models/source/<kind>/<id>.glb. Publish them afterwards with `npm run models:optimize`.
// Usage: node scripts/build-blender-models.mjs [id ...]
// Set BLENDER to the Blender executable if it isn't found automatically.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('.');
const scriptsDir = path.join(root, 'art/models/blender');
const sourceDir = path.join(root, 'art/models/source');
const only = new Set(process.argv.slice(2));

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const candidates = [];
  for (const base of [
    'C:/Program Files/Blender Foundation',
    'C:/Program Files (x86)/Blender Foundation',
  ]) {
    if (!fs.existsSync(base)) continue;
    // Newest installed version first
    const versions = fs
      .readdirSync(base)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    candidates.push(...versions.map((dir) => path.join(base, dir, 'blender.exe')));
  }
  candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
  return candidates.find((file) => fs.existsSync(file)) ?? 'blender';
}

const blender = findBlender();
let built = 0;
let failed = false;

for (const kind of ['heroes', 'monsters']) {
  const dir = path.join(scriptsDir, kind);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.py'))) {
    const id = path.basename(file, '.py');
    if (only.size && !only.has(id)) continue;
    const output = path.join(sourceDir, kind, `${id}.glb`);
    const result = spawnSync(
      blender,
      ['--background', '--factory-startup', '--python', path.join(dir, file), '--', output],
      { encoding: 'utf8' },
    );
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const lines = log.split(/\r?\n/);
    const at = lines.findIndex((line) => line.startsWith('MINIATURE '));
    const summary = at >= 0 ? lines[at] : undefined;
    if (result.status !== 0 || !summary || result.error) {
      failed = true;
      console.error(`✗ ${kind}/${id}`);
      console.error(result.error?.message ?? log.trim().split('\n').slice(-25).join('\n'));
      continue;
    }
    built++;
    console.log(`✓ ${summary.replace('MINIATURE ', '').replace(root + path.sep, '')}`);
    // Triangles per merged mesh, to see where the budget goes
    console.log(`  ${lines[at - 1]}`);
  }
}

console.log(`Built ${built} model(s) with ${blender}`);
if (failed) process.exitCode = 1;
