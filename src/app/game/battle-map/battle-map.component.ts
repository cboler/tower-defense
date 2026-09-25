import { Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { GamepadService } from '../../core/services/gamepad.service';
import { TOWER_CLASSES, TowerClassId, TowerInstance } from '../../core/models/tower.model';
import { MobInstance } from '../../core/models/mob.model';
import { TileCode } from '../../core/models/map.model';

@Component({
  selector: 'app-battle-map',
  standalone: true,
  imports: [],
  template: `
    <div
      class="battlefield-container"
      role="region"
      aria-label="Tower Defense Battlefield"
      tabindex="0"
      id="battlefield-map"
      (keydown)="onKeyDown($event)"
    >
      <!-- Main Grid Board -->
      <div
        class="battlefield-grid"
        [style.--cols]="game.activeMap().width"
        [style.--rows]="game.activeMap().height"
      >
        <!-- Terrain Tiles -->
        @for (row of game.activeMap().tiles; track rIdx; let rIdx = $index) {
          @for (tile of row; track cIdx; let cIdx = $index) {
            <div
              class="grid-cell"
              [class.tile-path]="tile === 'P'"
              [class.tile-build]="tile === 'B'"
              [class.tile-maze]="tile === 'M'"
              [class.tile-obstacle]="tile === 'O'"
              [class.tile-spawn]="tile === 'S'"
              [class.tile-sanctuary]="tile === 'C'"
              [class.is-selected]="isTileSelected(cIdx, rIdx)"
              [class.has-barricade]="hasBarricadeAt(cIdx, rIdx)"
              (click)="onCellClick(cIdx, rIdx)"
              (keydown.enter)="onCellClick(cIdx, rIdx)"
              [title]="getCellTooltip(tile, cIdx, rIdx)"
              role="button"
              tabindex="0"
              [attr.aria-label]="getCellTooltip(tile, cIdx, rIdx)"
            >
              @if (tile === 'S') {
                <div class="portal-vortex" aria-hidden="true">
                  <span class="vortex-core">🌀</span>
                  <span class="tile-tag">SPAWN</span>
                </div>
              } @else if (tile === 'C') {
                <div class="crystal-altar" aria-hidden="true">
                  <span class="altar-crystal">💎</span>
                  <span class="tile-tag">ALTAR</span>
                </div>
              } @else if (tile === 'M' && !hasBarricadeAt(cIdx, rIdx)) {
                <div class="maze-sigil" aria-hidden="true">
                  <span class="sigil-icon">🛡️</span>
                  <span class="sigil-label">MAZE</span>
                </div>
              } @else if (tile === 'O') {
                <div class="obstacle-fissure" aria-hidden="true">
                  <span class="fissure-icon">🌋</span>
                </div>
              }

              <!-- Reticle Indicator for Selected Cell -->
              @if (isTileSelected(cIdx, rIdx)) {
                <div class="selection-reticle" aria-hidden="true">
                  <span class="corner tl"></span>
                  <span class="corner tr"></span>
                  <span class="corner bl"></span>
                  <span class="corner br"></span>
                </div>
              }
            </div>
          }
        }

        <!-- Active Tower Range Circle Overlay -->
        @if (selectedTowerRange()) {
          <div
            class="range-circle"
            [style.left.%]="selectedTowerRange()!.leftPercent"
            [style.top.%]="selectedTowerRange()!.topPercent"
            [style.width.%]="selectedTowerRange()!.widthPercent"
            [style.height.%]="selectedTowerRange()!.heightPercent"
            aria-hidden="true"
          ></div>
        }

        <!-- Placed Towers Overlay -->
        @for (tower of game.towers(); track tower.id) {
          <div
            class="placed-tower"
            [class.is-selected]="isTileSelected(tower.x, tower.y)"
            [style.left.%]="(tower.x / game.activeMap().width) * 100"
            [style.top.%]="(tower.y / game.activeMap().height) * 100"
            [style.width.%]="(1 / game.activeMap().width) * 100"
            [style.height.%]="(1 / game.activeMap().height) * 100"
            (click)="onCellClick(tower.x, tower.y); $event.stopPropagation()"
            (keydown.enter)="onCellClick(tower.x, tower.y); $event.stopPropagation()"
            role="button"
            tabindex="0"
            [attr.aria-label]="tower.classId + ' level ' + tower.level"
          >
            @if (tower.classId === 'barricade') {
              <div class="barricade-block" title="Aether Barricade (Click to Inspect/Sell)">
                <span class="barricade-icon">🛡️</span>
                <span class="barricade-label">BLOCKED</span>
              </div>
            } @else {
              <div
                class="tower-avatar"
                [style.background-color]="getTowerColor(tower.classId)"
                [title]="getTowerTitle(tower)"
              >
                <span class="tower-icon">{{ getTowerIcon(tower.classId) }}</span>
                <div class="tower-level-badge">
                  <span class="level-stars">L{{ tower.level }}</span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Creeps / Monsters Layer -->
        @for (mob of game.mobs(); track mob.id) {
          @if (!mob.isDead && !mob.hasEscaped) {
            <div
              class="creep-entity"
              [class.is-flying]="mob.isFlying"
              [style.left.%]="((mob.x + 0.5) / game.activeMap().width) * 100"
              [style.top.%]="((mob.y + 0.5) / game.activeMap().height) * 100"
              [title]="mob.name + ' (' + mob.hp + '/' + mob.maxHp + ' HP)'"
            >
              @if (mob.isFlying) {
                <div class="flyer-shadow" aria-hidden="true"></div>
              }

              <!-- Health Bar -->
              <div class="creep-health-bar" aria-hidden="true">
                <div
                  class="health-fill"
                  [style.width.%]="(mob.hp / mob.maxHp) * 100"
                  [style.background-color]="getHealthColor(mob.hp / mob.maxHp)"
                ></div>
              </div>

              <!-- Monster Sprite Avatar -->
              <div class="creep-sprite">
                <span class="sprite-icon">{{ mob.icon }}</span>
                @if (mob.armor >= 0.5) {
                  <span class="armor-badge" title="High Physical Armor">🛡️</span>
                }
                @if (mob.magicResist >= 0.5) {
                  <span class="magic-shield-badge" title="High Magic Shield">✨</span>
                }
                @if (hasSlowEffect(mob)) {
                  <span class="status-badge slow-badge" title="Slowed">❄️</span>
                }
                @if (hasStunEffect(mob)) {
                  <span class="status-badge stun-badge" title="Stunned">⚡</span>
                }
              </div>
            </div>
          }
        }

        <!-- Projectiles Layer -->
        @for (proj of game.projectiles(); track proj.id) {
          <div
            class="projectile-entity"
            [class]="'proj-' + proj.visualType"
            [style.left.%]="((proj.currentX + 0.5) / game.activeMap().width) * 100"
            [style.top.%]="((proj.currentY + 0.5) / game.activeMap().height) * 100"
            aria-hidden="true"
          >
            @if (proj.visualType === 'arrow') {
              <span class="proj-glyph">🏹</span>
            } @else if (proj.visualType === 'fireball') {
              <span class="proj-glyph flame">🔥</span>
            } @else if (proj.visualType === 'time-orb') {
              <span class="proj-glyph time">🟣</span>
            } @else if (proj.visualType === 'spear') {
              <span class="proj-glyph spear">🔱</span>
            }
          </div>
        }

        <!-- Particle Effects Layer -->
        @for (particle of game.particles(); track particle.id) {
          <div
            class="particle-fx"
            [class]="'fx-' + particle.type"
            [style.left.%]="((particle.x + 0.5) / game.activeMap().width) * 100"
            [style.top.%]="((particle.y + 0.5) / game.activeMap().height) * 100"
            aria-hidden="true"
          ></div>
        }

        <!-- Floating Combat Text Layer -->
        @for (text of game.floatingTexts(); track text.id) {
          <div
            class="floating-text"
            [class]="'text-' + text.style"
            [style.color]="text.color"
            [style.left.%]="((text.x + 0.5) / game.activeMap().width) * 100"
            [style.top.%]="((text.y + 0.5) / game.activeMap().height) * 100"
            aria-hidden="true"
          >
            {{ text.text }}
          </div>
        }
      </div>

      <!-- Tactical Controller & Keyboard Shortcuts Footer -->
      <footer class="controller-guide-bar">
        <div class="guide-item">
          <kbd class="key-badge">D-Pad / WASD</kbd>
          <span class="guide-desc">Move Cursor</span>
        </div>
        <div class="guide-item">
          <kbd class="key-badge">[A] / Space</kbd>
          <span class="guide-desc">Place / Upgrade</span>
        </div>
        <div class="guide-item">
          <kbd class="key-badge">[B] / Esc</kbd>
          <span class="guide-desc">Cancel / Deselect</span>
        </div>
        <div class="guide-item">
          <kbd class="key-badge">[LB / RB] / 1-9</kbd>
          <span class="guide-desc">Cycle Class</span>
        </div>
        <div class="guide-item">
          <kbd class="key-badge">[X] / Enter</kbd>
          <span class="guide-desc">Call Wave</span>
        </div>
        <div class="guide-item">
          <kbd class="key-badge">[Y]</kbd>
          <span class="guide-desc">Speed ({{ game.gameSpeed() }}x)</span>
        </div>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .battlefield-container {
        position: relative;
        display: flex;
        flex-direction: column;
        background: #090d16;
        border: 2px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
        outline: none;

        &:focus-visible {
          border-color: var(--color-primary);
        }
      }

      /* Battlefield Grid */
      .battlefield-grid {
        position: relative;
        display: grid;
        grid-template-columns: repeat(var(--cols), 1fr);
        grid-template-rows: repeat(var(--rows), 1fr);
        aspect-ratio: 14 / 9;
        width: 100%;
        background-color: #0c1322;
        user-select: none;
        overflow: hidden;
      }

      /* Grid Cells */
      .grid-cell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.04);
        cursor: pointer;
        transition: background-color 0.15s ease;

        &.tile-path {
          background: #1e293b;
          background-image: radial-gradient(
            circle at center,
            rgba(148, 163, 184, 0.08) 1px,
            transparent 1px
          );
          background-size: 8px 8px;
        }

        &.tile-build {
          background: #0f2027;
          background: linear-gradient(135deg, #0e1e24 0%, #132b35 100%);
          &:hover {
            background: linear-gradient(135deg, #132932 0%, #1a3845 100%);
          }
        }

        &.tile-maze {
          background: #18192c;
          border: 1px dashed rgba(168, 85, 247, 0.4);
          &:hover {
            background: rgba(168, 85, 247, 0.18);
          }
        }

        &.tile-obstacle {
          background: #231215;
          border-color: rgba(239, 68, 68, 0.3);
        }

        &.tile-spawn {
          background: #1e1b4b;
        }

        &.tile-sanctuary {
          background: #1e1b4b;
        }

        &.has-barricade {
          background: #334155 !important;
        }
      }

      /* Selection Reticle */
      .selection-reticle {
        position: absolute;
        inset: 2px;
        pointer-events: none;
        z-index: 10;
        animation: pulse-reticle 1s infinite alternate ease-in-out;

        .corner {
          position: absolute;
          width: 8px;
          height: 8px;
          border-color: #38bdf8;
          border-style: solid;
        }
        .tl {
          top: 0;
          left: 0;
          border-width: 2px 0 0 2px;
        }
        .tr {
          top: 0;
          right: 0;
          border-width: 2px 2px 0 0;
        }
        .bl {
          bottom: 0;
          left: 0;
          border-width: 0 0 2px 2px;
        }
        .br {
          bottom: 0;
          right: 0;
          border-width: 0 2px 2px 0;
        }
      }

      @keyframes pulse-reticle {
        from {
          opacity: 0.7;
          transform: scale(0.96);
        }
        to {
          opacity: 1;
          transform: scale(1.02);
        }
      }

      /* Range Circle */
      .range-circle {
        position: absolute;
        transform: translate(-50%, -50%);
        border: 2px dashed rgba(56, 189, 248, 0.7);
        background: radial-gradient(
          circle,
          rgba(56, 189, 248, 0.15) 0%,
          rgba(56, 189, 248, 0.03) 70%,
          transparent 100%
        );
        border-radius: 50%;
        pointer-events: none;
        z-index: 5;
        animation: rotate-range 20s linear infinite;
      }

      @keyframes rotate-range {
        from {
          transform: translate(-50%, -50%) rotate(0deg);
        }
        to {
          transform: translate(-50%, -50%) rotate(360deg);
        }
      }

      /* Icons in Tiles */
      .portal-vortex,
      .crystal-altar,
      .maze-sigil,
      .obstacle-fissure {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        line-height: 1;
      }

      .portal-vortex .vortex-core {
        font-size: 1.4rem;
        animation: spin-vortex 4s linear infinite;
      }

      @keyframes spin-vortex {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      .crystal-altar .altar-crystal {
        font-size: 1.5rem;
        filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.9));
        animation: float-crystal 2s infinite ease-in-out;
      }

      @keyframes float-crystal {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-4px);
        }
      }

      .tile-tag {
        font-family: var(--font-mono);
        font-size: 0.55rem;
        font-weight: 700;
        color: #94a3b8;
        margin-top: 2px;
      }

      .maze-sigil {
        opacity: 0.7;
        .sigil-icon {
          font-size: 0.9rem;
        }
        .sigil-label {
          font-family: var(--font-mono);
          font-size: 0.5rem;
          color: #c084fc;
        }
      }

      /* Placed Towers Layer */
      .placed-tower {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 6;
        cursor: pointer;

        &.is-selected {
          filter: drop-shadow(0 0 6px #38bdf8);
        }
      }

      .tower-avatar {
        position: relative;
        width: 82%;
        height: 82%;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
        border: 2px solid rgba(255, 255, 255, 0.3);
        transition: transform 0.15s ease;

        &:hover {
          transform: scale(1.08);
        }
      }

      .tower-icon {
        font-size: 1.3rem;
      }

      .tower-level-badge {
        position: absolute;
        bottom: -3px;
        right: -3px;
        background: #0f172a;
        border: 1px solid #38bdf8;
        border-radius: var(--radius-sm);
        padding: 0 3px;
        font-family: var(--font-mono);
        font-size: 0.6rem;
        font-weight: 800;
        color: #38bdf8;
      }

      .barricade-block {
        width: 86%;
        height: 86%;
        background: #475569;
        border: 2px solid #94a3b8;
        border-radius: var(--radius-sm);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);

        .barricade-icon {
          font-size: 1.1rem;
        }
        .barricade-label {
          font-family: var(--font-mono);
          font-size: 0.45rem;
          font-weight: 700;
          color: #f1f5f9;
        }
      }

      /* Creep Entities Layer */
      .creep-entity {
        position: absolute;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 7;

        &.is-flying {
          z-index: 9;
          transform: translate(-50%, -75%);
        }
      }

      .flyer-shadow {
        position: absolute;
        top: 22px;
        width: 18px;
        height: 7px;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 50%;
        filter: blur(1px);
      }

      .creep-health-bar {
        width: 28px;
        height: 4px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 2px;
      }

      .health-fill {
        height: 100%;
        transition: width 0.1s ease;
      }

      .creep-sprite {
        position: relative;
        font-size: 1.35rem;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
      }

      .armor-badge,
      .magic-shield-badge,
      .status-badge {
        position: absolute;
        top: -4px;
        font-size: 0.65rem;
      }
      .armor-badge {
        left: -6px;
      }
      .magic-shield-badge {
        right: -6px;
      }
      .status-badge {
        top: -8px;
        left: 4px;
      }

      /* Projectiles Layer */
      .projectile-entity {
        position: absolute;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 8;
      }

      .proj-glyph {
        font-size: 0.9rem;
        display: inline-block;
      }

      .proj-glyph.flame {
        animation: spin-vortex 0.5s linear infinite;
      }

      /* Particles */
      .particle-fx {
        position: absolute;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        pointer-events: none;
        z-index: 8;
        animation: fade-particle 0.4s ease-out forwards;

        &.fx-explosion {
          background: radial-gradient(
            circle,
            rgba(249, 115, 22, 0.8) 0%,
            rgba(239, 68, 68, 0.3) 60%,
            transparent 100%
          );
          width: 48px;
          height: 48px;
        }

        &.fx-slash {
          border: 2px solid #38bdf8;
          width: 32px;
          height: 32px;
        }

        &.fx-time-pulse {
          border: 2px dashed #a855f7;
          width: 40px;
          height: 40px;
        }

        &.fx-aura {
          border: 2px solid #38bdf8;
          box-shadow: 0 0 12px #38bdf8;
          width: 50px;
          height: 50px;
        }

        &.fx-tremor {
          border: 2px solid #e11d48;
          width: 56px;
          height: 56px;
        }
      }

      @keyframes fade-particle {
        0% {
          transform: translate(-50%, -50%) scale(0.3);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) scale(1.4);
          opacity: 0;
        }
      }

      /* Floating Text */
      .floating-text {
        position: absolute;
        transform: translate(-50%, -50%);
        font-family: var(--font-mono);
        font-weight: 800;
        font-size: 0.75rem;
        pointer-events: none;
        z-index: 12;
        text-shadow:
          0 1px 3px rgba(0, 0, 0, 0.9),
          0 0 4px rgba(0, 0, 0, 0.8);
        animation: float-up-fade 0.85s ease-out forwards;
      }

      @keyframes float-up-fade {
        0% {
          transform: translate(-50%, 0) scale(0.8);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -24px) scale(1.1);
          opacity: 0;
        }
      }

      /* Controller Guide Bar */
      .controller-guide-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-around;
        gap: var(--space-2) var(--space-4);
        padding: var(--space-2) var(--space-4);
        background: #0f172a;
        border-top: 1px solid var(--border-subtle);
        font-size: var(--font-size-xs);
      }

      .guide-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .key-badge {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        background: #1e293b;
        color: #38bdf8;
        border: 1px solid #334155;
        border-radius: var(--radius-sm);
        padding: 2px 6px;
        font-weight: 600;
      }

      .guide-desc {
        color: var(--text-secondary);
      }

      @media (max-width: 600px) {
        .controller-guide-bar {
          gap: var(--space-1) var(--space-2);
          padding: var(--space-1) var(--space-2);
          font-size: 0.65rem;
        }
        .key-badge {
          font-size: 0.55rem;
          padding: 1px 4px;
        }
      }
    `,
  ],
})
export class BattleMapComponent {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);

  protected readonly selectedTowerRange = computed(() => {
    const tile = this.game.selectedTile();
    const map = this.game.activeMap();
    if (!tile) return null;

    // Check if there is a placed tower here
    const tower = this.game.selectedTower();
    let range = 0;

    if (tower) {
      if (tower.classId === 'barricade') return null;
      const def = TOWER_CLASSES[tower.classId];
      range = def.levels[tower.level - 1].range;
    } else {
      // Show range preview for currently selected class in dock if this is a build tile
      const cellType = map.tiles[tile.y]?.[tile.x];
      if (cellType === 'B') {
        const classDef = TOWER_CLASSES[this.game.selectedClassId()];
        if (classDef.id !== 'barricade') {
          range = classDef.levels[0].range;
        }
      }
    }

    if (range <= 0) return null;

    const cellWidthPercent = 100 / map.width;
    const cellHeightPercent = 100 / map.height;

    return {
      leftPercent: (tile.x + 0.5) * cellWidthPercent,
      topPercent: (tile.y + 0.5) * cellHeightPercent,
      widthPercent: range * 2 * cellWidthPercent,
      heightPercent: range * 2 * cellHeightPercent,
    };
  });

  protected isTileSelected(x: number, y: number): boolean {
    const cur = this.game.selectedTile();
    return cur !== null && cur.x === x && cur.y === y;
  }

  protected hasBarricadeAt(x: number, y: number): boolean {
    return this.game.barricades().has(`${x},${y}`);
  }

  protected onCellClick(x: number, y: number): void {
    this.game.selectTile(x, y);
  }

  protected getCellTooltip(tile: TileCode, x: number, y: number): string {
    const tower = this.game.towers().find((t) => t.x === x && t.y === y);
    if (tower) {
      const def = TOWER_CLASSES[tower.classId];
      return `${def.name} (Level ${tower.level}) at (${x}, ${y})`;
    }
    switch (tile) {
      case 'B':
        return `Build Vantage Platform at (${x}, ${y}) - Click to place tower`;
      case 'M':
        return `Maze Slot at (${x}, ${y}) - Place Aether Barricade to redirect creeps`;
      case 'P':
        return `Ground Monster Path at (${x}, ${y})`;
      case 'S':
        return `Monster Spawn Portal at (${x}, ${y})`;
      case 'C':
        return `Sacred Crystal Sanctuary at (${x}, ${y})`;
      case 'O':
        return `Obstacle Chasm at (${x}, ${y})`;
    }
  }

  protected getTowerColor(classId: TowerClassId): string {
    return TOWER_CLASSES[classId].color;
  }

  protected getTowerIcon(classId: TowerClassId): string {
    return TOWER_CLASSES[classId].icon;
  }

  protected getTowerTitle(tower: TowerInstance): string {
    const def = TOWER_CLASSES[tower.classId];
    return `${def.name} Lv.${tower.level} (Kills: ${tower.kills}, Damage: ${tower.damageDealt})`;
  }

  protected getHealthColor(ratio: number): string {
    if (ratio > 0.6) return '#10b981';
    if (ratio > 0.25) return '#f59e0b';
    return '#ef4444';
  }

  protected hasSlowEffect(mob: MobInstance): boolean {
    return mob.statusEffects.some((e) => e.type === 'slow' && e.remainingMs > 0);
  }

  protected hasStunEffect(mob: MobInstance): boolean {
    return mob.statusEffects.some((e) => e.type === 'stun' && e.remainingMs > 0);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.game.moveCursor(0, -1);
        event.preventDefault();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.game.moveCursor(0, 1);
        event.preventDefault();
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.game.moveCursor(-1, 0);
        event.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.game.moveCursor(1, 0);
        event.preventDefault();
        break;
      case 'Enter': {
        // Confirm action on current tile
        const tile = this.game.selectedTile();
        if (tile) {
          const tower = this.game.selectedTower();
          if (tower) {
            this.game.upgradeTower(tower.id);
          } else {
            this.game.placeTower(tile.x, tile.y, this.game.selectedClassId());
          }
        }
        break;
      }
      case 'Escape':
        this.game.selectTile(-1, -1);
        break;
    }
  }
}
