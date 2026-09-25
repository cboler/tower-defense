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
│   │   ├── hud/                     # Crystals, Gold, Wave call, speed, gamepad pill
│   │   ├── tower-panel/             # Class recruitment dock, priority, and upgrade dossier
│   │   └── game.component.ts        # Main game coordinator and victory/defeat modals
│   ├── status/                      # PWA diagnostic and runtime verification
│   ├── app.routes.ts                # Application routes
│   └── app.ts                       # App root shell with PWA install prompts
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
```

## Guardrails

- **Trademarked Content**: Do not use trademarked names (e.g. _Chocobo_, _Moogle_, _Final Fantasy_, _Ivalice_). Use our original counterparts: _Swiftbeak_, _Skulker_, _Prismatic Ooze_, _Blade Warden_, etc.
- **Light Mazing Rule**: When placing an Aether Barricade on a `MAZE_SLOT` tile (`M`), the pathfinding service must verify that at least one valid path from spawn to sanctuary remains open. Monsters must never be completely sealed off.
- **Controller Support**: All interactive game features must remain accessible via standard Gamepad API controls (Button A to place/upgrade, B to cancel, X to call wave, Y for speed, LB/RB to cycle classes, D-Pad/sticks for map navigation) alongside keyboard and touch/mouse controls.
- **Audio Synthesis**: Avoid external binary audio files. Use procedural Web Audio API synthesis in `AudioService` so the app remains lightweight, offline-first, and instant to load.
- **Zero Regression Quality**: Any code changes must pass `npm test`, `npm run lint`, and `npm run format:check`.
