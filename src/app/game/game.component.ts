import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { GameService } from '../core/services/game.service';
import { GamepadAction, GamepadService } from '../core/services/gamepad.service';
import { AudioService } from '../core/services/audio.service';
import { ALL_MAPS } from '../core/models/map.model';
import { TowerClassId } from '../core/models/tower.model';
import { HudComponent } from './hud/hud.component';
import { BattleMapComponent } from './battle-map/battle-map.component';
import { TowerPanelComponent } from './tower-panel/tower-panel.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [HudComponent, BattleMapComponent, TowerPanelComponent],
  template: `
    <div class="game-view" role="main" aria-label="Crystal Wardens Arena">
      <!-- Top HUD -->
      <app-hud />

      <!-- Center Battlefield -->
      <app-battle-map />

      <!-- Bottom Command Dock & Dossier -->
      <app-tower-panel />

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
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
      }

      .game-view {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-2) 0;
      }

      /* Modal Overlays */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(4, 6, 12, 0.85);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        animation: fade-in 0.25s ease-out;
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
        background: linear-gradient(180deg, #111827 0%, #0c1322 100%);
        border: 2px solid;
        border-radius: var(--radius-lg);
        padding: var(--space-6);
        text-align: center;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.8);
        animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes scale-up {
        from {
          transform: scale(0.92);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .defeat-card {
        border-color: rgba(239, 68, 68, 0.6);
        box-shadow: 0 0 32px rgba(239, 68, 68, 0.25);
      }

      .victory-card {
        border-color: rgba(56, 189, 248, 0.6);
        box-shadow: 0 0 32px rgba(56, 189, 248, 0.25);
      }

      .modal-icon {
        font-size: 3.5rem;
        display: block;
        margin-bottom: var(--space-2);
      }

      .modal-heading {
        font-size: 1.5rem;
        font-weight: 800;
        margin: 0 0 var(--space-2) 0;
      }

      .modal-subtitle {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        margin: 0 0 var(--space-6) 0;
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
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: var(--space-2);
      }

      .stat-tag {
        font-size: 0.65rem;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .stat-num {
        font-family: var(--font-mono);
        font-size: var(--font-size-base);
        font-weight: 800;
        color: var(--text-primary);
        margin-top: 2px;
      }

      .rank-s {
        color: #facc15;
        text-shadow: 0 0 8px rgba(250, 204, 21, 0.6);
      }

      .modal-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-3) var(--space-6);
        border-radius: var(--radius-md);
        font-size: var(--font-size-base);
        font-weight: 700;
        cursor: pointer;
        border: none;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;

        &:hover {
          transform: translateY(-2px);
        }
      }

      .restart-btn {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #ffffff;
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
      }

      .victory-actions {
        display: flex;
        gap: var(--space-3);
        justify-content: center;
      }

      .next-stage-btn {
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        color: #ffffff;
        box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
      }

      .replay-btn {
        background: #334155;
        color: #f1f5f9;
        border: 1px solid var(--border-muted);
      }
    `,
  ],
})
export class GameComponent implements OnInit, OnDestroy {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly audio = inject(AudioService);

  private sub?: Subscription;

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
    if (this.game.isGameOver() || this.game.isVictory()) {
      if (action === 'confirm') {
        if (this.game.isGameOver()) this.restartGame();
        else this.nextStage();
      }
      return;
    }

    switch (action) {
      case 'start-wave':
        this.game.startNextWave();
        break;
      case 'toggle-speed':
        this.game.cycleSpeed();
        break;
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
      case 'cancel':
        this.game.selectTile(-1, -1);
        break;
    }
  }

  private readonly onGlobalKeyDown = (e: KeyboardEvent): void => {
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
