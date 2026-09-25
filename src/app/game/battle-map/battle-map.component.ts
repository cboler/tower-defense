import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
} from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { GamepadService } from '../../core/services/gamepad.service';
import { TOWER_CLASSES, TowerClassId, TowerInstance } from '../../core/models/tower.model';
import { MobInstance } from '../../core/models/mob.model';
import { TileCode } from '../../core/models/map.model';
import { CameraPreset, ThreeBattlefieldService } from './three-battlefield.service';

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
      <!-- Tactical Camera & Mode Control Toolbar -->
      <div class="battlefield-toolbar" aria-label="Battlefield View Controls">
        <div class="camera-pill">
          <span class="toolbar-label">VIEW:</span>
          <button
            type="button"
            class="cam-btn"
            [class.active]="three.activeCameraMode() === 'tactics'"
            (click)="setCameraMode('tactics')"
            title="Isometric 2.5D Tactics Diorama"
          >
            📐 Tactics 2.5D
          </button>
          <button
            type="button"
            class="cam-btn"
            [class.active]="three.activeCameraMode() === 'isometric'"
            (click)="setCameraMode('isometric')"
            title="45° Corner Isometric View"
          >
            💎 Corner Iso
          </button>
          <button
            type="button"
            class="cam-btn"
            [class.active]="three.activeCameraMode() === 'topdown'"
            (click)="setCameraMode('topdown')"
            title="Top-Down Overhead Tactical"
          >
            🎯 Top-Down
          </button>
        </div>

        <div class="map-badge-pill">
          <span class="pill-dot"></span>
          <span class="map-name">{{ game.activeMap().name }}</span>
        </div>
      </div>

      <!-- Main Battlefield Stage (Three.js WebGL Engine) -->
      <div class="battlefield-stage-wrapper">
        <canvas
          #threeCanvas
          class="three-battlefield-canvas"
          [class.hidden]="!three.isWebGLSupported()"
          aria-label="Interactive 3D Tactics Battlefield"
        ></canvas>

        <!-- Floating Combat Text & Particle Sparks Overlay -->
        <div class="floating-text-layer" aria-hidden="true">
          @for (text of game.floatingTexts(); track text.id) {
            <div
              class="floating-text"
              [class]="'text-' + text.style"
              [style.color]="text.color"
              [style.left.%]="((text.x + 0.5) / game.activeMap().width) * 100"
              [style.top.%]="((text.y + 0.5) / game.activeMap().height) * 100"
            >
              {{ text.text }}
            </div>
          }
        </div>

        <!-- 2D Fallback / Accessible Grid (Visible if WebGL is unsupported or as screen reader backing) -->
        <div
          class="battlefield-grid"
          [class.sr-only]="three.isWebGLSupported()"
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
                  <img
                    [src]="'assets/sprites/' + tower.classId + '.png'"
                    [alt]="tower.classId"
                    class="tower-sprite-img"
                    loading="lazy"
                  />
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
                  <img
                    [src]="'assets/monsters/' + mob.typeId + '-sprite.png'"
                    [alt]="mob.name"
                    class="mob-sprite-img"
                    loading="lazy"
                  />
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
        </div>
      </div>

      <!-- Tactical Controller & Keyboard Shortcuts Footer -->
      <footer class="controller-guide-bar" aria-label="Tactical Controller Action Prompts">
        @if (game.selectedTower(); as tower) {
          <div class="guide-item active-action">
            <kbd class="key-badge">[A]</kbd>
            <span class="guide-desc">Upgrade (Lv.{{ tower.level + 1 }})</span>
          </div>
          <div class="guide-item active-action">
            <kbd class="key-badge">[X]</kbd>
            <span class="guide-desc">Dismiss (+Refund)</span>
          </div>
          @if (tower.classId !== 'barricade' && tower.classId !== 'oracle') {
            <div class="guide-item active-action">
              <kbd class="key-badge">[Y]</kbd>
              <span class="guide-desc">Priority: {{ tower.targetPriority }}</span>
            </div>
          }
          <div class="guide-item">
            <kbd class="key-badge">[B]</kbd>
            <span class="guide-desc">Deselect</span>
          </div>
        } @else if (game.selectedTile(); as tile) {
          @if (isBuildTile(tile)) {
            <div class="guide-item active-action">
              <kbd class="key-badge">[A]</kbd>
              <span class="guide-desc"
                >Deploy {{ activeClassDef().name }} ({{ activeClassDef().cost }}G)</span
              >
            </div>
            <div class="guide-item">
              <kbd class="key-badge">[LB / RB]</kbd>
              <span class="guide-desc">Switch Class</span>
            </div>
            <div class="guide-item">
              <kbd class="key-badge">[B]</kbd>
              <span class="guide-desc">Deselect</span>
            </div>
          } @else if (isMazeTile(tile)) {
            <div class="guide-item active-action">
              <kbd class="key-badge">[A]</kbd>
              <span class="guide-desc">{{
                hasBarricadeAt(tile.x, tile.y) ? 'Dismantle Barricade' : 'Erect Barricade (30G)'
              }}</span>
            </div>
            <div class="guide-item">
              <kbd class="key-badge">[B]</kbd>
              <span class="guide-desc">Deselect</span>
            </div>
          } @else {
            <div class="guide-item">
              <kbd class="key-badge">D-Pad / Stick</kbd>
              <span class="guide-desc">Move</span>
            </div>
            <div class="guide-item">
              <kbd class="key-badge">[B]</kbd>
              <span class="guide-desc">Deselect</span>
            </div>
            <div class="guide-item">
              <kbd class="key-badge">[X]</kbd>
              <span class="guide-desc">Call Wave</span>
            </div>
          }
        } @else {
          <div class="guide-item">
            <kbd class="key-badge">D-Pad / Stick</kbd>
            <span class="guide-desc">Move Cursor</span>
          </div>
          <div class="guide-item">
            <kbd class="key-badge">[A]</kbd>
            <span class="guide-desc">Select Tile</span>
          </div>
          <div class="guide-item">
            <kbd class="key-badge">[LB / RB]</kbd>
            <span class="guide-desc">Class ({{ activeClassDef().name }})</span>
          </div>
          <div class="guide-item">
            <kbd class="key-badge">[X]</kbd>
            <span class="guide-desc">Call Wave</span>
          </div>
          <div class="guide-item">
            <kbd class="key-badge">[Y]</kbd>
            <span class="guide-desc">Speed ({{ game.gameSpeed() }}x)</span>
          </div>
          <div class="guide-item">
            <kbd class="key-badge">[START / Esc]</kbd>
            <span class="guide-desc">Menu</span>
          </div>
        }
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
      }

      .battlefield-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        background: #080c14;
        border: 2px solid #1e293b;
        border-radius: var(--radius-lg);
        overflow: hidden;
        box-shadow:
          0 16px 36px rgba(0, 0, 0, 0.75),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        outline: none;

        &:focus-visible {
          border-color: var(--color-primary);
        }
      }

      /* View Toolbar */
      .battlefield-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: linear-space(#090e17 0%, #111827 100%);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        user-select: none;
      }

      .camera-pill {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .toolbar-label {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-right: 4px;
      }

      .cam-btn {
        background: #1e293b;
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: #334155;
          color: #f8fafc;
        }

        &.active {
          background: #0284c7;
          color: #ffffff;
          border-color: #38bdf8;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }
      }

      .map-badge-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 9999px;
        padding: 3px 10px;

        .pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 6px #38bdf8;
        }

        .map-name {
          font-size: 0.72rem;
          font-weight: 600;
          color: #cbd5e1;
        }
      }

      /* Stage & WebGL Canvas */
      .battlefield-stage-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        flex: 1;
        min-height: 0;
        background: #080c14;
        overflow: hidden;
      }

      .three-battlefield-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        cursor: pointer;

        &.hidden {
          display: none;
        }
      }

      /* Floating Combat Text Overlay */
      .floating-text-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 20;
      }

      .floating-text {
        position: absolute;
        transform: translate(-50%, -100%);
        font-weight: 800;
        font-size: 0.85rem;
        text-shadow:
          0 1px 3px rgba(0, 0, 0, 0.9),
          0 0 6px rgba(0, 0, 0, 0.8);
        animation: float-damage 0.85s ease-out forwards;
        white-space: nowrap;

        &.text-gold {
          color: #facc15;
          font-size: 0.95rem;
        }

        &.text-crit {
          color: #fb923c;
          font-size: 1.05rem;
          text-shadow: 0 0 10px rgba(251, 146, 60, 0.8);
        }

        &.text-heal {
          color: #34d399;
        }
      }

      @keyframes float-damage {
        0% {
          opacity: 0;
          transform: translate(-50%, 0) scale(0.6);
        }
        25% {
          opacity: 1;
          transform: translate(-50%, -12px) scale(1.15);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -32px) scale(1);
        }
      }

      /* Fallback 2D Grid */
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

        &.sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }
      }

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
        }

        &.tile-build {
          background: linear-gradient(135deg, #0e1e24 0%, #132b35 100%);
        }

        &.tile-maze {
          background: #18192c;
          border: 1px dashed rgba(168, 85, 247, 0.4);
        }

        &.tile-obstacle {
          background: #231215;
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

      .portal-vortex,
      .crystal-altar,
      .maze-sigil {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;

        .tile-tag,
        .sigil-label {
          font-size: 0.5rem;
          font-weight: 700;
          color: #94a3b8;
        }
      }

      .selection-reticle {
        position: absolute;
        inset: 2px;
        pointer-events: none;
        z-index: 10;

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

      .range-circle {
        position: absolute;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 2px dashed rgba(56, 189, 248, 0.85);
        background: radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, transparent 75%);
        pointer-events: none;
        z-index: 5;
      }

      .placed-tower {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 6;
      }

      .tower-avatar {
        position: relative;
        width: 82%;
        height: 82%;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);

        .tower-sprite-img {
          width: 86%;
          height: 86%;
          object-fit: contain;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
        }

        .tower-level-badge {
          position: absolute;
          bottom: -4px;
          right: -4px;
          background: #0284c7;
          border: 1px solid #38bdf8;
          border-radius: 4px;
          padding: 1px 3px;
          font-size: 0.55rem;
          font-weight: 700;
          color: #ffffff;
        }
      }

      .barricade-block {
        width: 84%;
        height: 84%;
        background: #0891b2;
        border: 2px solid #38bdf8;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 10px rgba(6, 182, 212, 0.6);

        .barricade-label {
          font-size: 0.5rem;
          font-weight: 800;
          color: #ffffff;
        }
      }

      .creep-entity {
        position: absolute;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 7;
        pointer-events: none;

        .creep-health-bar {
          width: 24px;
          height: 3px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 2px;
          margin-bottom: 2px;
          overflow: hidden;

          .health-fill {
            height: 100%;
            transition: width 0.1s linear;
          }
        }

        .creep-sprite {
          position: relative;
          width: 26px;
          height: 26px;

          .mob-sprite-img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
          }
        }
      }

      /* Controller Guide Bar */
      .controller-guide-bar {
        display: flex;
        align-items: center;
        justify-content: space-around;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px 12px;
        background: #090e17;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      .guide-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .key-badge {
        background: #1e293b;
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: 4px;
        padding: 1px 5px;
        font-size: 0.65rem;
        font-family: var(--font-mono);
        font-weight: 700;
      }

      .guide-desc {
        font-size: 0.68rem;
        color: #94a3b8;
      }

      @media (max-width: 767px) {
        .battlefield-toolbar {
          padding: 4px 8px;

          .toolbar-label {
            display: none;
          }

          .cam-btn {
            padding: 2px 6px;
            font-size: 0.65rem;
          }

          .map-badge-pill {
            padding: 2px 8px;

            .map-name {
              font-size: 0.65rem;
            }
          }
        }

        .controller-guide-bar {
          display: flex;
          padding: 3px 6px;
          gap: 4px;

          .guide-item {
            gap: 2px;
          }

          .guide-desc {
            font-size: 0.6rem;
          }

          .key-badge {
            font-size: 0.58rem;
            padding: 1px 3px;
          }
        }
      }
    `,
  ],
})
export class BattleMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('threeCanvas') private threeCanvasRef?: ElementRef<HTMLCanvasElement>;

  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly three = inject(ThreeBattlefieldService);

  private resizeHandler = () => this.three.resize();
  private resizeObserver?: ResizeObserver;

  constructor() {
    // When the map changes, update Three.js terrain
    effect(() => {
      this.game.activeMap();
      this.three.rebuildTerrain(this.game);
    });
  }

  public ngAfterViewInit(): void {
    if (this.threeCanvasRef?.nativeElement) {
      this.three.init(this.threeCanvasRef.nativeElement, this.game);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.resizeHandler);
    }
    if (
      typeof ResizeObserver !== 'undefined' &&
      this.threeCanvasRef?.nativeElement?.parentElement
    ) {
      this.resizeObserver = new ResizeObserver(() => {
        this.three.resize();
      });
      this.resizeObserver.observe(this.threeCanvasRef.nativeElement.parentElement);
    }
  }

  public ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.resizeObserver?.disconnect();
    this.three.destroy();
  }

  protected setCameraMode(mode: CameraPreset): void {
    this.three.setCameraPreset(mode);
  }

  protected readonly activeClassDef = computed(() => TOWER_CLASSES[this.game.selectedClassId()]);

  protected isBuildTile(tile: { x: number; y: number }): boolean {
    return this.game.activeMap().tiles[tile.y]?.[tile.x] === 'B';
  }

  protected isMazeTile(tile: { x: number; y: number }): boolean {
    return this.game.activeMap().tiles[tile.y]?.[tile.x] === 'M';
  }

  protected readonly selectedTowerRange = computed(() => {
    const tile = this.game.selectedTile();
    const map = this.game.activeMap();
    if (!tile) return null;

    const tower = this.game.selectedTower();
    let range = 0;

    if (tower) {
      if (tower.classId === 'barricade') return null;
      const def = TOWER_CLASSES[tower.classId];
      range = def.levels[tower.level - 1].range;
    } else {
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
        const tile = this.game.selectedTile();
        if (tile) {
          const tower = this.game.selectedTower();
          if (tower) {
            this.game.upgradeTower(tower.id);
          } else {
            const cellType = this.game.activeMap().tiles[tile.y]?.[tile.x];
            if (cellType === 'M') {
              const hasBarricade = this.game.barricades().has(`${tile.x},${tile.y}`);
              if (hasBarricade) {
                const bar = this.game.towers().find((t) => t.x === tile.x && t.y === tile.y);
                if (bar) this.game.sellTower(bar.id);
              } else {
                this.game.placeTower(tile.x, tile.y, 'barricade');
              }
            } else if (cellType === 'B') {
              this.game.placeTower(tile.x, tile.y, this.game.selectedClassId());
            }
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
