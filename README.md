# Crystal Wardens: Tower Defense

A tactical fantasy job-based **Angular PWA Tower Defense** inspired by _Final Fantasy: Crystal Defenders_, featuring light mazing mechanics and full gamepad/controller support.

## Overview

In **Crystal Wardens**, players defend the Sacred Crystal Sanctuary against incoming hordes of marauding fantasy beasts. Summon and position classic fantasy champions along vantage ridges and strategically place Aether Barricades to maze and weave enemy paths into lethal choke points.

### Key Features

- **8 Distinct Fantasy Classes + Aether Barricades**:
  - **Blade Warden** (Warrior): Rapid physical circular melee slashes; high ground DPS.
  - **Ranger** (Archer): Battlefield-spanning range; anti-air specialist (+50% bonus damage to Flying monsters).
  - **Elementalist** (Black Mage): Explosive arcane fireballs that completely bypass physical armor.
  - **Chronomancer** (Time Mage): Spatial gravity pulse that slows enemy movement speed by 40–72%.
  - **Oracle** (White Mage): Divine aura boosting attack speed (+25–60%) and damage of all adjacent allied towers.
  - **Rogue** (Thief): Swift daggers with _Plunder_—generates bonus gold per hit and per defeat.
  - **Lancer** (Dragoon): Long spear thrusts with aerial Jump Plunges that deal burst damage and stun targets.
  - **Juggernaut** (Berserker): Heavy ground tremor shockwaves that fracture armor on all ground units in radius.
  - **Aether Barricade** (Light Mazing): Erected on designated maze slots to redirect creep pathing without completely blocking the path.

- **Unique Bestiary (Renamed & Original)**:
  - **Skulker**: Standard infantry runner with balanced speed and resilience.
  - **Swiftbeak**: High-speed avian sprinter that cuts incoming slow effects in half.
  - **Prismatic Ooze**: Armored slime with 80% physical damage reduction; highly weak to magic.
  - **Pyre Core**: Volatile elemental with 80% magic resistance; enrages and speeds up at low HP.
  - **Dread Gaze**: Winged flying horror that glides over ground barricades and ignores melee strikes.
  - **Bonewalker**: Fragile undead swarmer attacking in dense packs.
  - **Bramble Golem**: Colossal monolith boss with massive health pool.
  - **Sky Sovereign**: Flying apex dragon boss testing complete air and ground coordination.

- **3 Tactical Maps**:
  - **Verdant Crossroads** (Stage 1): Winding valley pass with vantage ridges.
  - **Sunken Sanctum** (Stage 2): Open temple courtyard with multiple maze slots for custom routing.
  - **Molten Caldera** (Stage 3): Magma fissures where flying units take direct flight corridors while ground creeps navigate the perimeter.

- **Full Controller Support (Gamepad API)**:
  - Native Gamepad API integration: D-pad / sticks navigate map tiles or UI buttons.
  - Button `A`: Place defender, upgrade tower, or activate focused button.
  - Button `B`: Deselect / cancel.
  - Button `X`: Call next wave (or start early for bonus honor).
  - Button `Y`: Cycle speed (`1x` → `2x` → `4x`).
  - `LB` / `RB`: Cycle selected defender class.

- **Synthesized Retro Audio Engine**:
  - Pure Web Audio API procedural synthesis: sword slashes, arrow whooshes, arcane explosions, temporal drones, coin pickups, and victory fanfares without any external audio asset dependencies.

- **Mobile-First PWA & GitHub Pages Ready**:
  - Installable PWA with service worker offline caching and standalone display mode.
  - Automated deployment workflow with SPA 404 client-side routing fallback.

---

## Technical Stack

| Component          | Technology                                                |
| ------------------ | --------------------------------------------------------- |
| Framework          | Angular 22 (Standalone Components, Signals)               |
| Audio Engine       | Web Audio API (Synthesized procedurally)                  |
| Gamepad System     | Native Gamepad API with spatial focus navigation          |
| Pathfinding        | Breadth-First Search (BFS) with dynamic mazing validation |
| PWA Infrastructure | Angular Service Worker (`@angular/service-worker`)        |
| Testing Stack      | Vitest (`npm test`) + Playwright (`npm run e2e`)          |
| Code Quality       | ESLint + Prettier                                         |
| Hosting            | GitHub Pages via GitHub Actions workflow                  |

---

## Local Development

```bash
# Install dependencies
npm ci

# Start local development server
npm start
```

Navigate to `http://localhost:4200/` in your browser.

---

## Developer Commands & Verification

| Command                | Purpose                                                                          |
| :--------------------- | :------------------------------------------------------------------------------- |
| `npm start`            | Runs Angular local dev server (`ng serve`)                                       |
| `npm run build`        | Builds production application bundle                                             |
| `npm run build:pages`  | Builds production application and generates GitHub Pages `404.html` SPA fallback |
| `npm test`             | Runs Vitest unit test suite (`ng test --watch=false`)                            |
| `npm run lint`         | Runs ESLint static analysis (`ng lint`)                                          |
| `npm run format`       | Formats codebase using Prettier                                                  |
| `npm run format:check` | Verifies code formatting compliance                                              |
| `npm run e2e`          | Runs Playwright smoke suite across phone, tablet, and desktop viewports          |

---

## Controls Reference

| Action            | Keyboard           | Controller (Gamepad)  | Touch / Mouse       |
| ----------------- | ------------------ | --------------------- | ------------------- |
| Move Map Cursor   | `W/A/S/D` / Arrows | Left Stick / D-Pad    | Tap / Click Tile    |
| Deploy / Upgrade  | `Enter` / `Space`  | Button `A` (South)    | Deploy / Upgrade UI |
| Deselect / Cancel | `Escape`           | Button `B` (East)     | Tap Outside / Close |
| Call Next Wave    | `Space` (idle)     | Button `X` (West)     | Call Wave Button    |
| Cycle Game Speed  | `Y`                | Button `Y` (North)    | Speed Button        |
| Cycle Class Dock  | `1`–`9`            | `LB` / `RB` Shoulders | Class Cards Dock    |

---

## License

[MIT](LICENSE)
