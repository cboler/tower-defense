import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { GameService } from '../core/services/game.service';
import { GamepadAction, GamepadService } from '../core/services/gamepad.service';
import { AudioService } from '../core/services/audio.service';
import { ALL_MAPS } from '../core/models/map.model';
import { TowerClassId } from '../core/models/tower.model';
import { HudComponent } from './hud/hud.component';
import { BattleMapComponent } from './battle-map/battle-map.component';
import { TowerPanelComponent } from './tower-panel/tower-panel.component';
import { CameraPreset, ThreeBattlefieldService } from './battle-map/three-battlefield.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [HudComponent, BattleMapComponent, TowerPanelComponent],
  template: `
    <div class="game-view" role="main" aria-label="Crystal Wardens Arena">
      <!-- Top HUD -->
      <app-hud class="game-hud-block" />

      <!-- Main Arena Presentation Container (Zero-Scroll Viewport) -->
      <div class="arena-stage-area">
        <!-- Center Battlefield & Action Bar -->
        <app-battle-map class="battle-map-stage" />

        <!-- Tower Command Panel (Mobile drawer / Tablet bottom dock / Desktop side console) -->
        <app-tower-panel
          class="tower-command-dock"
          [class.is-visible]="isVantageSelected()"
          (closePanel)="deselectVantage()"
        />
      </div>

      <!-- Game Over Modal Overlay -->
      @if (game.isGameOver()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="defeat-title">
          <div class="modal-card defeat-card">
            <span class="modal-icon" aria-hidden="true">💔</span>
            <h2 id="defeat-title" class="modal-heading">The Crystals Have Shattered!</h2>
            <p class="modal-subtitle">
              The marauding hordes overwhelmed your perimeter and plundered the sacred sanctuary.
            </p>

            <div class="defeat-stats">
              <div class="stat-pill">
                <span class="stat-tag">Waves Survived</span>
                <span class="stat-num"
                  >{{ game.currentWaveIndex() }} / {{ game.totalWaves() }}</span
                >
              </div>
              <div class="stat-pill">
                <span class="stat-tag">Final Score</span>
                <span class="stat-num">{{ game.score() }}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-tag">Defenders Deployed</span>
                <span class="stat-num">{{ game.towers().length }}</span>
              </div>
            </div>

            <button
              type="button"
              class="modal-btn restart-btn"
              id="defeat-restart-btn"
              (click)="restartGame()"
            >
              🔄 Try Again [A]
            </button>
          </div>
        </div>
      }

      <!-- Victory Modal Overlay -->
      @if (game.isVictory()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="victory-title">
          <div class="modal-card victory-card">
            <span class="modal-icon" aria-hidden="true">👑</span>
            <h2 id="victory-title" class="modal-heading">Sacred Sanctuary Protected!</h2>
            <p class="modal-subtitle">
              All {{ game.totalWaves() }} waves of marauders and apex titans were defeated!
            </p>

            <div class="victory-stats">
              <div class="stat-pill">
                <span class="stat-tag">Crystals Saved</span>
                <span class="stat-num">{{ game.crystals() }} / {{ game.maxCrystals() }}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-tag">Victory Honor Score</span>
                <span class="stat-num">{{ game.score() }}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-tag">Battle Rank</span>
                <span class="stat-num rank-s">{{ getRank() }}</span>
              </div>
            </div>

            <div class="victory-actions">
              <button
                type="button"
                class="modal-btn next-stage-btn"
                id="victory-next-btn"
                (click)="nextStage()"
              >
                🗺️ Next Stage [A]
              </button>
              <button
                type="button"
                class="modal-btn replay-btn"
                id="victory-replay-btn"
                (click)="restartGame()"
              >
                🔄 Replay Stage
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Tactical Pause / System Options Modal Overlay -->
      @if (isPauseMenuOpen()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div class="modal-card pause-card">
            <div class="modal-header-banner">
              <span class="modal-icon" aria-hidden="true">📜</span>
              <h2 id="pause-title" class="modal-heading">Tactical Pause</h2>
              <p class="modal-subtitle">Battle suspended. Adjust tactical settings or resume.</p>
            </div>

            <div class="pause-options-list">
              <button
                type="button"
                class="modal-btn resume-btn"
                id="pause-resume-btn"
                (click)="isPauseMenuOpen.set(false)"
              >
                <span>⚔️ Resume Battle</span>
                <kbd class="btn-kbd">[B / Start]</kbd>
              </button>

              <button type="button" class="modal-btn opt-btn" (click)="cycleCameraPreset()">
                <span>📐 Camera: {{ three.activeCameraMode() }}</span>
                <kbd class="btn-kbd">[View / Back]</kbd>
              </button>

              <button type="button" class="modal-btn opt-btn" (click)="audio.toggleMute()">
                <span>{{ audio.muted() ? '🔇 Audio: Muted' : '🔊 Audio: Active' }}</span>
                <kbd class="btn-kbd">[Y]</kbd>
              </button>

              <div class="stage-select-box">
                <span class="stage-select-label">SELECT STAGE [D-Pad ◄ ►]:</span>
                <div class="stage-buttons-row">
                  @for (m of allMaps; track m.id) {
                    <button
                      type="button"
                      class="stage-choice-btn"
                      [class.active]="game.activeMap().id === m.id"
                      (click)="game.loadMap(m); isPauseMenuOpen.set(false)"
                    >
                      {{ m.name }}
                    </button>
                  }
                </div>
              </div>

              <button
                type="button"
                class="modal-btn opt-btn restart-opt"
                (click)="restartGame(); isPauseMenuOpen.set(false)"
              >
                <span>🔄 Restart Stage</span>
                <kbd class="btn-kbd">[X]</kbd>
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        max-height: 100dvh;
        overflow: hidden;
      }

      .game-view {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-height: 100dvh;
        overflow: hidden;
      }

      .game-hud-block {
        flex-shrink: 0;
        z-index: 10;
      }

      .arena-stage-area {
        position: relative;
        flex: 1;
        min-height: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .battle-map-stage {
        flex: 1;
        min-height: 0;
        min-width: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      /* Layout 1: Mobile First (<= 767px, Pixel 9 Pro) */
      .tower-command-dock {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: 52dvh;
        z-index: 50;
        transform: translateY(105%);
        opacity: 0;
        pointer-events: none;
        transition:
          transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
          opacity 0.2s ease;

        &.is-visible {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
      }

      /* Layout 2: Tablet (768px - 1024px) */
      @media (min-width: 768px) and (max-width: 1024px) {
        .game-view {
          padding: 0 10px;
          gap: 6px;
        }

        .arena-stage-area {
          flex-direction: column;
        }

        .tower-command-dock {
          position: relative;
          width: 100%;
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          margin-top: 0;
          transform: none;
          transition:
            max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1),
            opacity 0.25s ease,
            margin 0.25s ease;

          &.is-visible {
            max-height: 250px;
            opacity: 1;
            pointer-events: auto;
            margin-top: 6px;
          }
        }
      }

      /* Layout 3: Desktop (> 1024px) */
      @media (min-width: 1025px) {
        :host {
          max-width: 1600px;
          margin: 0 auto;
        }

        .game-view {
          padding: 6px 16px;
          gap: 8px;
        }

        .arena-stage-area {
          flex-direction: row;
          gap: 16px;
        }

        .battle-map-stage {
          flex: 1;
          min-width: 0;
          height: 100%;
        }

        .tower-command-dock {
          position: relative;
          width: 0;
          height: 100%;
          max-height: 100%;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          transform: translateX(24px);
          margin-left: -16px;
          transition:
            width 0.32s cubic-bezier(0.16, 1, 0.3, 1),
            opacity 0.25s ease,
            transform 0.32s cubic-bezier(0.16, 1, 0.3, 1),
            margin 0.32s ease;

          &.is-visible {
            width: 380px;
            opacity: 1;
            transform: translateX(0);
            pointer-events: auto;
            margin-left: 0;
          }
        }
      }

      /* Modal Overlays */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(4, 6, 12, 0.88);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        animation: fade-in 0.2s ease-out;
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .modal-card {
        width: 100%;
        max-width: 480px;
        background: linear-gradient(180deg, #0e1e38 0%, #070d18 100%);
        border: 2px solid #ca8a04;
        border-radius: var(--radius-lg);
        padding: var(--space-6);
        text-align: center;
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.9),
          0 0 24px rgba(202, 138, 4, 0.25);
        animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes scale-up {
        from {
          transform: scale(0.94);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .defeat-card {
        border-color: rgba(239, 68, 68, 0.7);
        box-shadow: 0 0 32px rgba(239, 68, 68, 0.35);
      }

      .victory-card {
        border-color: rgba(56, 189, 248, 0.7);
        box-shadow: 0 0 32px rgba(56, 189, 248, 0.35);
      }

      .pause-card {
        border-color: #38bdf8;
        box-shadow: 0 0 32px rgba(56, 189, 248, 0.3);
      }

      .modal-icon {
        font-size: 3rem;
        display: block;
        margin-bottom: var(--space-2);
      }

      .modal-heading {
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        margin: 0 0 var(--space-2) 0;
        color: #f8fafc;
      }

      .modal-subtitle {
        font-size: var(--font-size-sm);
        color: #94a3b8;
        margin: 0 0 var(--space-5) 0;
      }

      .defeat-stats,
      .victory-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2);
        margin-bottom: var(--space-6);
      }

      .stat-pill {
        display: flex;
        flex-direction: column;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: var(--space-2);
      }

      .stat-tag {
        font-size: 0.65rem;
        text-transform: uppercase;
        color: var(--text-muted);
        margin-bottom: 2px;
      }

      .stat-num {
        font-family: var(--font-mono);
        font-size: 1.15rem;
        font-weight: 800;
        color: var(--text-primary);

        &.rank-s {
          color: #fbbf24;
          text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
        }
      }

      .pause-options-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .modal-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-weight: 700;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.15s ease;

        &:hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
      }

      .btn-kbd {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 4px;
        color: #38bdf8;
      }

      .resume-btn {
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        color: #ffffff;
        box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
      }

      .opt-btn {
        background: rgba(30, 41, 59, 0.7);
        color: #f1f5f9;

        &:hover {
          background: rgba(51, 65, 85, 0.9);
          border-color: #38bdf8;
        }
      }

      .restart-opt {
        color: #f87171;
        border-color: rgba(248, 113, 113, 0.3);
      }

      .stage-select-box {
        display: flex;
        flex-direction: column;
        gap: 6px;
        text-align: left;
        padding: var(--space-2) 0;

        .stage-select-label {
          font-size: 0.65rem;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        .stage-buttons-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 6px;
        }

        .stage-choice-btn {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 6px;
          font-size: 0.7rem;
          font-weight: 600;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.15s ease;

          &:hover {
            color: #ffffff;
            border-color: #38bdf8;
          }

          &.active {
            background: rgba(2, 132, 199, 0.25);
            border-color: #38bdf8;
            color: #38bdf8;
            font-weight: 700;
          }
        }
      }

      .victory-actions {
        display: flex;
        gap: var(--space-3);
        justify-content: center;
      }

      .restart-btn {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #ffffff;
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
        width: 100%;
        justify-content: center;
      }

      .next-stage-btn {
        flex: 1;
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        color: #ffffff;
        justify-content: center;
      }

      .replay-btn {
        flex: 1;
        background: #334155;
        color: #f1f5f9;
        justify-content: center;
      }
    `,
  ],
})
export class GameComponent implements OnInit, OnDestroy {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly audio = inject(AudioService);
  protected readonly three = inject(ThreeBattlefieldService);
  protected readonly allMaps = ALL_MAPS;

  public readonly isPauseMenuOpen = signal<boolean>(false);
  private sub?: Subscription;

  public readonly isVantageSelected = computed(() => {
    const tile = this.game.selectedTile();
    if (!tile) return false;
    const map = this.game.activeMap();
    const cellType = map.tiles[tile.y]?.[tile.x];
    const hasTower = !!this.game.selectedTower();
    return cellType === 'B' || cellType === 'M' || hasTower;
  });

  public deselectVantage(): void {
    this.game.selectTile(-1, -1);
  }

  ngOnInit(): void {
    this.gamepad.start();
    this.sub = this.gamepad.actions.subscribe((action) => this.handleGamepadAction(action));

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onGlobalKeyDown);
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onGlobalKeyDown);
    }
  }

  protected handleGamepadAction(action: GamepadAction): void {
    // 1. Victory / Game Over modal handling
    if (this.game.isGameOver() || this.game.isVictory()) {
      if (action === 'confirm') {
        if (this.game.isGameOver()) this.restartGame();
        else this.nextStage();
      }
      return;
    }

    // 2. Pause Menu Modal handling
    if (this.isPauseMenuOpen()) {
      if (action === 'cancel' || action === 'toggle-menu') {
        this.isPauseMenuOpen.set(false);
      } else if (action === 'start-wave') {
        this.restartGame();
        this.isPauseMenuOpen.set(false);
      } else if (action === 'toggle-speed') {
        this.audio.toggleMute();
      } else if (action === 'cycle-camera') {
        this.cycleCameraPreset();
      } else if (action === 'confirm') {
        this.isPauseMenuOpen.set(false);
      } else if (action === 'cursor-left') {
        this.cycleMapInPause('prev');
      } else if (action === 'cursor-right') {
        this.cycleMapInPause('next');
      }
      return;
    }

    // 3. Main Gameplay Actions
    switch (action) {
      case 'toggle-menu':
        this.isPauseMenuOpen.set(true);
        break;

      case 'cycle-camera':
        this.cycleCameraPreset();
        break;

      case 'start-wave': {
        const tower = this.game.selectedTower();
        if (tower) {
          // If a tower is inspected, [X] is Dismiss / Sell
          this.game.sellTower(tower.id);
        } else {
          // Otherwise [X] calls the next wave!
          this.game.startNextWave();
        }
        break;
      }

      case 'toggle-speed': {
        const tower = this.game.selectedTower();
        if (tower && tower.classId !== 'barricade' && tower.classId !== 'oracle') {
          // If a tower is inspected, [Y] cycles target priority!
          this.game.cycleTargetPriorityForTower(tower.id);
        } else {
          // Otherwise [Y] cycles game speed!
          this.game.cycleSpeed();
        }
        break;
      }

      case 'prev-class':
        this.game.cycleClass('prev');
        break;

      case 'next-class':
        this.game.cycleClass('next');
        break;

      case 'cursor-up':
        this.game.moveCursor(0, -1);
        break;

      case 'cursor-down':
        this.game.moveCursor(0, 1);
        break;

      case 'cursor-left':
        this.game.moveCursor(-1, 0);
        break;

      case 'cursor-right':
        this.game.moveCursor(1, 0);
        break;

      case 'confirm': {
        let tile = this.game.selectedTile();
        if (!tile) {
          this.game.selectTile(0, 1);
          tile = this.game.selectedTile();
        }
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

      case 'cancel':
        this.game.selectTile(-1, -1);
        break;
    }
  }

  public cycleCameraPreset(): void {
    const modes: CameraPreset[] = ['tactics', 'isometric', 'topdown'];
    const cur = this.three.activeCameraMode();
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    this.three.setCameraPreset(next);
  }

  protected cycleMapInPause(direction: 'next' | 'prev'): void {
    const curIdx = this.allMaps.findIndex((m) => m.id === this.game.activeMap().id);
    const nextIdx =
      direction === 'next'
        ? (curIdx + 1) % this.allMaps.length
        : (curIdx - 1 + this.allMaps.length) % this.allMaps.length;
    this.game.loadMap(this.allMaps[nextIdx]);
  }

  private readonly onGlobalKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.isPauseMenuOpen.set(!this.isPauseMenuOpen());
      e.preventDefault();
      return;
    }

    if (this.isPauseMenuOpen()) return;

    if (e.key === 'c' || e.key === 'C') {
      this.cycleCameraPreset();
      return;
    }

    if (e.key === '[' || e.key === '{') {
      this.game.cycleClass('prev');
      return;
    }

    if (e.key === ']' || e.key === '}') {
      this.game.cycleClass('next');
      return;
    }

    if (e.key === 'x' || e.key === 'X') {
      const tower = this.game.selectedTower();
      if (tower) this.game.sellTower(tower.id);
      else this.game.startNextWave();
      return;
    }

    if (e.key === 'y' || e.key === 'Y') {
      const tower = this.game.selectedTower();
      if (tower && tower.classId !== 'barricade' && tower.classId !== 'oracle') {
        this.game.cycleTargetPriorityForTower(tower.id);
      } else {
        this.game.cycleSpeed();
      }
      return;
    }

    if (e.key === 'm' || e.key === 'M') {
      this.audio.toggleMute();
      return;
    }

    // Hotkeys 1-9 for class recruitment
    const classKeys: Record<string, TowerClassId> = {
      '1': 'blade-warden',
      '2': 'ranger',
      '3': 'elementalist',
      '4': 'chronomancer',
      '5': 'oracle',
      '6': 'rogue',
      '7': 'lancer',
      '8': 'juggernaut',
      '9': 'barricade',
    };

    if (classKeys[e.key]) {
      this.game.setSelectedClass(classKeys[e.key]);
      return;
    }

    if (e.key === ' ' || e.key === 'Spacebar') {
      if (!this.game.waveActive()) {
        this.game.startNextWave();
        e.preventDefault();
      } else {
        this.game.togglePause();
        e.preventDefault();
      }
    }
  };

  protected restartGame(): void {
    this.game.loadMap(this.game.activeMap());
  }

  protected nextStage(): void {
    const curId = this.game.activeMap().id;
    const curIdx = ALL_MAPS.findIndex((m) => m.id === curId);
    const nextMap = ALL_MAPS[(curIdx + 1) % ALL_MAPS.length];
    this.game.loadMap(nextMap);
  }

  protected getRank(): string {
    const crystals = this.game.crystals();
    if (crystals === 20) return 'S-RANK PERFECT';
    if (crystals >= 15) return 'A-RANK';
    if (crystals >= 10) return 'B-RANK';
    return 'C-RANK';
  }
}
