# AGENTS.md

These instructions apply to the entire repository.

## Repository Overview

- **Product**: Crystal Wardens, an Angular PWA tactical tower defense inspired by _Final Fantasy: Crystal Defenders_, featuring fantasy classes, light mazing barricades, and native Gamepad API controller support.
- **Framework**: Angular 22 standalone components with Angular Signals for reactive state.
- **PWA & Deployment**: Angular Service Worker (`ngsw-config.json`), Web App Manifest (`public/manifest.webmanifest`), and dynamic base-href GitHub Pages deployment via GitHub Actions (`.github/workflows/deploy.yml`).
- **No Backend**: Pure client-side game engine, procedural Web Audio API sound synthesis, and local browser storage.

## Key Architecture & Map of Code

```
src/
├── app/
│   ├── core/
│   │   ├── models/
│   │   │   ├── tower.model.ts       # 8 Fantasy classes + Barricade, levels, damage types
│   │   │   ├── mob.model.ts         # 8 Original monsters (Skulker, Swiftbeak, etc.)
│   │   │   ├── map.model.ts         # 14x9 grid maps, tiles (Path, Build, Maze, Obstacle)
│   │   │   ├── wave.model.ts        # Wave schedules and monster compositions
│   │   │   └── game-state.model.ts  # Projectiles, particles, floating combat text
│   │   └── services/
│   │       ├── audio.service.ts     # Synthesized Web Audio API sound effects
│   │       ├── gamepad.service.ts   # Gamepad API navigation, focus, and button actions
│   │       ├── pathfinding.service.ts # BFS ground/air pathfinding and mazing validation
│   │       └── game.service.ts      # Core game loop, targeting, waves, and economy
│   ├── game/
│   │   ├── battle-map/              # Grid rendering, creep/tower layers, range overlay
│   │   │   ├── three-battlefield.service.ts # Three.js board, miniatures, effects, camera
│   │   │   ├── battlefield-models.ts  # Sculpted (procedural) hero & monster miniatures
│   │   │   ├── imported-models.ts     # Fits, cel-shades, outlines & animates glTF models
│   │   │   └── model-library.service.ts # Authored model when published, else sculpted
│   │   ├── hud/                     # Crystals, Gold, Wave call, speed, gamepad pill
│   │   ├── tower-panel/             # Class recruitment dock, priority, and upgrade dossier
│   │   └── game.component.ts        # Main game coordinator and victory/defeat modals
│   ├── model-gallery/               # /models art bench: lil-gui tuning, .glb drag-and-drop
│   ├── status/                      # PWA diagnostic and runtime verification
│   ├── app.routes.ts                # Application routes
│   └── app.ts                       # App root shell with PWA install prompts
art/models/                          # Model pipeline inputs (see Authored Models)
public/assets/models/                # Published .glb models + generated manifest.json
```

## Commands & Quality Gates

Prerequisite: Node.js 24 and npm 11.

```bash
# Install dependencies from lockfile
npm ci

# Run development server
npm start

# Execute unit test suite with Vitest
npm test -- --watch=false

# Run ESLint static analysis
npm run lint

# Format with Prettier
npm run format
npm run format:check

# Production build and GitHub Pages preparation
npm run build
npm run build:pages

# Playwright E2E smoke tests
npm run e2e

# Model pipeline (see Authored Models)
npm run models:export          # sculpted miniatures → art/models/blockouts/*.glb
npm run models:optimize        # art/models/source/*.glb → public/assets/models + manifest
npm run models:art -- <class>  # render a recruit portrait & sprite from a miniature
```

## Authored Models

Heroes and monsters default to the sculpted miniatures in `battlefield-models.ts`. Any piece can
be replaced by an authored glTF model (Blender, Meshy, Tripo...):

1. **Try it**: open `/models` and drop the `.glb` onto the piece's card. The inspector fits it to
   the sculpted footprint and shows it at board size. Tune turn, height, cel shading, outline and
   clip mapping, then use _Copy models.json entry_. Tuning also applies to the battle for the
   session.
2. **Publish it**: save the raw export as `art/models/source/<heroes|monsters>/<id>.glb` (id is
   the `TowerClassId` / `MobTypeId`), paste the copied settings into `art/models/models.json`,
   run `npm run models:optimize`, and commit `public/assets/models/`. Raw sources and blockouts
   are gitignored.

`models.json` keys per model: `yaw` (radians), `height` (tiles; default is the sculpted
height), `toon` / `outline` (default `true`), `clips` (`{ idle, attack, walk }` clip names;
otherwise matched by name: Idle, Attack/Slash/Cast..., Walk/Run/Fly), and the build budgets
`maxTriangles` (default 10000) and `textureSize` (default 512).

Models should face +Z; scale and position don't matter. Avoid Draco compression (meshopt is
applied instead). Models without clips still animate if they keep the sculpted joint names
(`arm-right`, `leg-left`, `cape`...), as exported blockouts do. Only feed your own artwork to
image-to-3D tools.

## Guardrails

- **Trademarked Content**: Do not use trademarked names (e.g. _Chocobo_, _Moogle_, _Final Fantasy_, _Ivalice_). Use our original counterparts: _Swiftbeak_, _Skulker_, _Prismatic Ooze_, _Blade Warden_, etc.
- **Light Mazing Rule**: When placing an Aether Barricade on a `MAZE_SLOT` tile (`M`), the pathfinding service must verify that at least one valid path from spawn to sanctuary remains open. Monsters must never be completely sealed off.
- **Controller Support**: All interactive game features must remain accessible via standard Gamepad API controls (Button A to place/upgrade, B to cancel, X to call wave, Y for speed, LB/RB to cycle classes, D-Pad/sticks for map navigation) alongside keyboard and touch/mouse controls.
- **Audio Synthesis**: Avoid external binary audio files. Use procedural Web Audio API synthesis in `AudioService` so the app remains lightweight, offline-first, and instant to load.
- **Sculpted Fallback**: Every hero and monster must keep a working sculpted miniature. `public/assets/models/manifest.json` must always exist (an empty one is fine) so the app never makes a failing request.
- **Zero Regression Quality**: Any code changes must pass `npm test`, `npm run lint`, and `npm run format:check`.
