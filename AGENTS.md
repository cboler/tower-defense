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
│   │   │   ├── model-library.service.ts # Authored model when published, else sculpted
│   │   │   ├── motions.ts             # Keyframed attacks/idle shared by 3D heroes and sprites
│   │   │   ├── sprite-actors.ts       # HD-2D billboard sprites (8 facings) from baked sheets
│   │   │   ├── sprite-library.service.ts # Loads the baked sheets in public/assets/actors
│   │   │   ├── pixel-terrain.ts       # HD-2D board, rim and cliff painted as pixel art in code
│   │   │   ├── pixel-props.ts         # HD-2D scenery sprites painted in code (trees, crystals...)
│   │   │   ├── pixel-scenery.ts       # Prop billboards, island cliff, rim prop layout and themes
│   │   │   ├── pixel-fx.ts            # HD-2D projectiles, slashes, explosions and pixel rings
│   │   │   └── hd2d-post.ts           # HD-2D lens: bloom, tilt-shift, grade, vignette (lazy)
│   │   ├── hud/                     # Crystals, Gold, Wave call, speed, gamepad pill
│   │   ├── tower-panel/             # Class recruitment dock, priority, and upgrade dossier
│   │   └── game.component.ts        # Main game coordinator and victory/defeat modals
│   ├── model-gallery/               # /models art bench: lil-gui tuning, .glb drag-and-drop
│   ├── status/                      # PWA diagnostic and runtime verification
│   ├── app.routes.ts                # Application routes
│   └── app.ts                       # App root shell with PWA install prompts
art/models/                          # Model pipeline inputs (see Authored Models)
public/assets/models/                # Published .glb models + generated manifest.json
public/assets/actors/                # Baked HD-2D sprite sheets + actors.json
public/assets/portraits, sprites/     # Hero pictures rendered from the models (npm run models:art)
public/assets/monsters/              # Monster pictures rendered from the models
public/assets/reference/             # The original painted art, kept as the /models gallery's reference
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
npm run models:blender         # art/models/blender/*.py → art/models/source/*.glb (headless)
npm run models:optimize        # art/models/source/*.glb → public/assets/models + manifest
npm run models:art [-- <id>]   # render heroes' and monsters' pictures from their models
npm run sprites:bake [-- <id>] # bake HD-2D sprite sheets from the miniatures
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

**Scripted Blender models**: `art/models/blender/<heroes|monsters>/<id>.py` build a model headless
with the helpers in `art/models/blender/kit.py`. Scripts work in the game's space (metres, +Y up,
facing +Z) on the same joints and pivots as the sculpted rig (`humanoid()` in
`battlefield-models.ts`), so the game animates them like sculpted pieces. Parts smaller than 3 cm
are left unoutlined, as on sculpted miniatures. Run `npm run models:blender -- <id>`, then
`npm run models:optimize` (set `BLENDER` if Blender isn't found). The Blade Warden is the example.

Models should face +Z; scale and position don't matter. Avoid Draco compression (meshopt is
applied instead). Models without clips still animate if they keep the sculpted joint names
(`arm-right`, `leg-left`, `cape`...), as exported blockouts do. Only feed your own artwork to
image-to-3D tools.

## Pictures

Every hero and monster picture in the UI (recruit cards, dossier, story dialogue, bestiary, wave
preview, the no-WebGL fallback board) is rendered from the piece's in-game model by
`npm run models:art` (`scripts/render-art.mjs`), so the presentation matches the battlefield: the
same portrait lighting, cel shading and ink, on a backdrop in the piece's colour. Hero busts are
framed on the head joint; monsters are framed on the head where they have one, else whole. Re-run
it after changing a model (and re-bake sprites); `--out <dir>` renders a review set without
touching the live pictures. The original painted art lives in `public/assets/reference/` as the
`/models` gallery's sculpting reference.

## Board Looks

The board has two looks, switched with the map button, the pause menu or `V`, and remembered per
browser: **Miniatures** (cel-shaded 3D pieces) and **HD-2D** (pixel-art sprites standing on the 3D
diorama, with bloom, tilt-shift, a colour grade and a vignette; effects are skipped on CPU-rendered
WebGL).

HD-2D sprites are baked, not drawn: `npm run sprites:bake` renders each piece's miniature (authored
model if published, else sculpted) through the motions in `motions.ts`, in 8 facings at 36 pixels
per tile from a shallow 25° angle, with a 1px ink outline. Re-bake after changing a model, a motion
or a hero's weapon hand. Weapons sit in the right hand (screen left), as in the art, and are
drawn thicker in sprites (`WEAPON_EMPHASIS` in the baker) so they survive at sprite size.

In HD-2D the board itself is pixel art painted in `pixel-terrain.ts` at 28 texels per tile (about a
sprite pixel on screen): one continuous painting for the tile tops that reads each tile's
neighbours (sunlit meadow lips, shade beside taller tiles, a faint tactics grid), a wall atlas for
tile sides, and a glow map for runes and lava. The sun comes from the side so shadows show; sprites
cast their silhouettes through an upright stand-in turned toward it.

The scenery is painted in code too, never loaded: `pixel-props.ts` paints trees, bushes, rocks,
runestones, crystal clusters, the altar's dais and turning crystal, the spawn gate, sky islands,
clouds and the sky as pixel-art frame strips (a breeze, a glint, a turn) at the sprites' 36 pixels
per tile, lit from the upper left with a 1px ink outline. In HD-2D the board sits on a one-tile rim
of wild meadow (`R` ground) above a painted cliff that tapers to a keel; `pixel-scenery.ts` scatters
props over the rim per map theme (`SCENERY_THEMES`) and hides tall ones that would stand between the
camera and the board. Sprites lean back at most 60° (`MAX_SPRITE_LEAN`), and HD-2D's overhead
preset stops at about 72°, so side-drawn sprites never lie flat. Distant backdrops get bigger pixels
so they look the same size on screen.

Pixels are sampled "sharp bilinear" (`SPRITE_SAMPLE`, `sharpenPixels`): each texel drawn flat with a
one-screen-pixel seam, so sprites and the board painting stay even at the non-integer scales of real
screens and don't crawl in motion. Their textures are therefore linearly filtered, not nearest. The
tilt-shift focus band follows the board on screen, so short canvases never blur the play area. The
sprite baker also enlarges heroes' heads and eyes and tips the head toward the viewer
(`FACE_EMPHASIS`), so faces read at sprite size; eyes are `eye` joints in the sculpted rig.

Combat effects are pixel art in HD-2D too (`pixel-fx.ts`): painted projectiles rolled to point along
their flight on screen, painted slashes, explosions and level-up pillars tinted by the game's effect
colour, square sparks that shrink a pixel at a time, and one `PixelRing` shader for every ring (impact
and aura rings, range circles, hero plinth and XP rings) drawn on the board's texel grid. Fades are
ordered dither (`dissolve`), never transparency. The tile cursor is painted brackets plus a floating
crystal. The Miniatures look keeps its 3D effects; both exist side by side and the look picks.

## Guardrails

- **Trademarked Content**: Do not use trademarked names (e.g. _Chocobo_, _Moogle_, _Final Fantasy_, _Ivalice_). Use our original counterparts: _Swiftbeak_, _Skulker_, _Prismatic Ooze_, _Blade Warden_, etc. The one deliberate exception is the About sheet (`about-modal`), which credits _Crystal Defenders_ by name, links to where to buy it and states that this fan project is unaffiliated; keep that credit, and keep the names out of the game itself.
- **Light Mazing Rule**: When placing an Aether Barricade on a `MAZE_SLOT` tile (`M`), the pathfinding service must verify that at least one valid path from spawn to sanctuary remains open. Monsters must never be completely sealed off.
- **Controller Support**: All interactive game features must remain accessible via standard Gamepad API controls (A to place/upgrade, B to cancel, X to call or rush a wave, Y for the recruit menu, LB/RB to pick up and swap the hero being placed, RT for speed, D-Pad/sticks for map navigation) alongside keyboard and touch/mouse controls. Placing is a mode: the hero in hand hovers over the cursor tile (range ring red where it can't stand) until A, Enter or a click sets it down; B, Esc or right-click puts it back.
- **Audio Synthesis**: Avoid external binary audio files. Use procedural Web Audio API synthesis in `AudioService` so the app remains lightweight, offline-first, and instant to load.
- **Sculpted Fallback**: Every hero and monster must keep a working sculpted miniature. `public/assets/models/manifest.json` must always exist (an empty one is fine) so the app never makes a failing request.
- **Zero Regression Quality**: Any code changes must pass `npm test`, `npm run lint`, and `npm run format:check`.
