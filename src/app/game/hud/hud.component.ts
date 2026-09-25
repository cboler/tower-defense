import { Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { GamepadService } from '../../core/services/gamepad.service';
import { AudioService } from '../../core/services/audio.service';
import { ALL_MAPS } from '../../core/models/map.model';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [],
  template: `
    <header class="game-hud" role="region" aria-label="Game Status Bar">
      <!-- Left: Resources & Vitality -->
      <div class="hud-group resources">
        <div
          class="stat-chip crystals"
          [class.critical]="game.crystals() <= 5"
          title="Sacred Crystals remaining before defeat"
        >
          <span class="chip-icon" aria-hidden="true">💎</span>
          <div class="chip-content">
            <span class="chip-label">Crystals</span>
            <span class="chip-value">{{ game.crystals() }} / {{ game.maxCrystals() }}</span>
          </div>
        </div>

        <div class="stat-chip gold" title="Gold treasury for placing and upgrading defenders">
          <span class="chip-icon" aria-hidden="true">🪙</span>
          <div class="chip-content">
            <span class="chip-label">Treasury</span>
            <span class="chip-value">{{ game.gold() }} G</span>
          </div>
        </div>

        <div class="stat-chip score" title="Battle honor score">
          <span class="chip-icon" aria-hidden="true">⭐</span>
          <div class="chip-content">
            <span class="chip-label">Score</span>
            <span class="chip-value">{{ game.score() }}</span>
          </div>
        </div>
      </div>

      <!-- Center: Wave Status & Call Wave -->
      <div class="hud-group wave-center">
        <div class="wave-info">
          @if (primaryMobType(); as mobType) {
            <div class="wave-mob-preview" [title]="'Next incoming enemy type: ' + mobType">
              <img
                [src]="'assets/monsters/' + mobType + '-portrait.png'"
                [alt]="mobType"
                class="wave-mob-portrait"
                loading="lazy"
              />
            </div>
          }
          <div class="wave-text-content">
            <div class="wave-title-row">
              <span class="wave-badge"
                >WAVE {{ game.currentWaveIndex() + 1 }} / {{ game.totalWaves() }}</span
              >
              <span class="wave-name">{{ game.currentWaveDef()?.name }}</span>
            </div>
            <p class="wave-intel">{{ game.currentWaveDef()?.intel }}</p>
          </div>
        </div>

        @if (!game.waveActive() && !game.isGameOver() && !game.isVictory()) {
          <button
            type="button"
            class="call-wave-btn"
            id="call-wave-btn"
            (click)="game.startNextWave()"
            [attr.aria-label]="'Call Wave ' + (game.currentWaveIndex() + 1)"
          >
            <span class="btn-glow" aria-hidden="true"></span>
            <span class="btn-icon">⚔️</span>
            <span class="btn-text">Call Wave</span>
            <span class="gamepad-hint" aria-hidden="true">[X]</span>
          </button>
        } @else if (game.waveActive()) {
          <div class="wave-in-progress" role="status">
            <span class="pulsing-beacon" aria-hidden="true"></span>
            <span class="progress-text">Combat in Progress</span>
          </div>
        }
      </div>

      <!-- Right: Speed, Controls, Map & Controller -->
      <div class="hud-group controls">
        <!-- Stage Selector -->
        <div class="map-selector">
          <label for="map-select" class="sr-only">Choose Map</label>
          <select
            id="map-select"
            class="select-map-dropdown"
            [value]="game.activeMap().id"
            (change)="onSelectMap($event)"
          >
            @for (m of allMaps; track m.id) {
              <option [value]="m.id">{{ m.name }} ({{ m.difficulty }})</option>
            }
          </select>
        </div>

        <!-- Speed Toggle -->
        <button
          type="button"
          class="hud-icon-btn speed-btn"
          id="speed-btn"
          (click)="game.cycleSpeed()"
          [title]="'Game Speed ' + game.gameSpeed() + 'x (Hotkey: Y / Space)'"
          aria-label="Toggle game speed"
        >
          <span class="speed-label">{{ game.gameSpeed() }}x</span>
          <span class="gamepad-hint" aria-hidden="true">[Y]</span>
        </button>

        <!-- Pause Toggle -->
        <button
          type="button"
          class="hud-icon-btn"
          id="pause-btn"
          (click)="game.togglePause()"
          [title]="game.isPaused() ? 'Resume Game' : 'Pause Game'"
          [attr.aria-label]="game.isPaused() ? 'Resume Game' : 'Pause Game'"
        >
          {{ game.isPaused() ? '▶️' : '⏸️' }}
        </button>

        <!-- Mute Audio Toggle -->
        <button
          type="button"
          class="hud-icon-btn"
          id="mute-btn"
          (click)="audio.toggleMute()"
          [title]="audio.muted() ? 'Unmute Audio' : 'Mute Audio'"
          [attr.aria-label]="audio.muted() ? 'Unmute Audio' : 'Mute Audio'"
        >
          {{ audio.muted() ? '🔇' : '🔊' }}
        </button>

        <!-- Gamepad Status Pill -->
        <div
          class="controller-pill"
          [class.connected]="gamepad.connected()"
          [title]="
            gamepad.connected()
              ? gamepad.controllerName()
              : 'Connect a gamepad for full controller support'
          "
        >
          <span class="controller-icon" aria-hidden="true">🎮</span>
          <span class="controller-label">
            {{ gamepad.connected() ? 'Pad Connected' : 'Gamepad Ready' }}
          </span>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .game-hud {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        background: linear-gradient(180deg, #111827 0%, rgba(15, 23, 42, 0.95) 100%);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(12px);
      }

      .hud-group {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
      }

      /* Stat Chips */
      .stat-chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-3);
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-md);
        transition: all 0.2s ease;

        &.crystals {
          border-color: rgba(168, 85, 247, 0.4);
          background: rgba(168, 85, 247, 0.1);
          .chip-value {
            color: #d8b4fe;
            text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
          }
        }

        &.crystals.critical {
          border-color: var(--color-error);
          background: rgba(239, 68, 68, 0.2);
          animation: pulse-danger 1s infinite alternate;
          .chip-value {
            color: #fca5a5;
          }
        }

        &.gold {
          border-color: rgba(234, 179, 8, 0.4);
          background: rgba(234, 179, 8, 0.1);
          .chip-value {
            color: #fde047;
            text-shadow: 0 0 10px rgba(234, 179, 8, 0.4);
          }
        }

        &.score {
          border-color: rgba(56, 189, 248, 0.4);
          background: rgba(56, 189, 248, 0.1);
          .chip-value {
            color: #7dd3fc;
          }
        }
      }

      @keyframes pulse-danger {
        from {
          box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);
        }
        to {
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.9);
        }
      }

      .chip-icon {
        font-size: 1.25rem;
      }

      .chip-content {
        display: flex;
        flex-direction: column;
      }

      .chip-label {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        line-height: 1;
      }

      .chip-value {
        font-family: var(--font-mono);
        font-size: var(--font-size-sm);
        font-weight: 700;
        line-height: 1.2;
      }

      /* Center Wave */
      .wave-center {
        flex: 1;
        justify-content: center;
        min-width: 260px;
      }

      .wave-info {
        text-align: center;
      }

      .wave-title-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
      }

      .wave-badge {
        font-family: var(--font-mono);
        font-size: var(--font-size-xs);
        font-weight: 700;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.15);
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(56, 189, 248, 0.3);
      }

      .wave-name {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--text-primary);
      }

      .wave-intel {
        margin: 2px 0 0 0;
        font-size: 0.72rem;
        color: var(--text-secondary);
        max-width: 380px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Call Wave Button */
      .call-wave-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        color: #ffffff;
        font-weight: 700;
        font-size: var(--font-size-sm);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-md);
        box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.6);
        }

        &:active {
          transform: translateY(1px);
        }
      }

      .wave-in-progress {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: var(--radius-md);
        font-size: var(--font-size-xs);
        font-weight: 600;
        color: #34d399;
      }

      .pulsing-beacon {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #34d399;
        animation: pulse-beacon 1.2s infinite ease-in-out;
      }

      @keyframes pulse-beacon {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.6);
          opacity: 0.4;
        }
      }

      .gamepad-hint {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        background: rgba(0, 0, 0, 0.35);
        padding: 1px 5px;
        border-radius: var(--radius-sm);
        color: #e2e8f0;
      }

      /* Controls */
      .select-map-dropdown {
        background: var(--bg-surface-elevated);
        color: var(--text-primary);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-md);
        padding: var(--space-1) var(--space-2);
        font-size: var(--font-size-xs);
        cursor: pointer;
      }

      .hud-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-width: 38px;
        height: 38px;
        background: var(--bg-surface-elevated);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-size: var(--font-size-sm);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: var(--bg-surface-hover);
          border-color: var(--border-accent);
        }

        &.speed-btn {
          font-weight: 700;
          color: #38bdf8;
          min-width: 58px;
        }
      }

      /* Controller Pill */
      .controller-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: var(--space-1) var(--space-3);
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        color: var(--text-muted);

        &.connected {
          border-color: rgba(52, 211, 153, 0.5);
          background: rgba(52, 211, 153, 0.1);
          color: #34d399;
          font-weight: 600;
        }
      }

      @media (max-width: 767px) {
        .game-hud {
          display: grid;
          grid-template-columns: 1fr auto;
          grid-template-rows: auto auto;
          gap: 4px 8px;
          padding: 6px 10px;
          border-radius: 0 0 12px 12px;
          border-top: none;
        }

        .hud-group.resources {
          grid-column: 1 / 2;
          grid-row: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
        }

        .stat-chip {
          padding: 2px 6px;
          gap: 4px;
          .chip-icon {
            font-size: 0.95rem;
          }
          .chip-label {
            display: none;
          }
          .chip-value {
            font-size: 0.75rem;
          }
        }

        .hud-group.controls {
          grid-column: 2 / 3;
          grid-row: 1;
          display: flex;
          align-items: center;
          gap: 4px;
          justify-content: flex-end;
          flex-wrap: nowrap;

          .map-selector {
            display: none;
          }

          .controller-pill {
            display: none;
          }

          .hud-icon-btn {
            min-width: 32px;
            height: 32px;
            font-size: 0.8rem;
            padding: 0 4px;

            &.speed-btn {
              min-width: 44px;
              font-size: 0.72rem;
              .gamepad-hint {
                display: none;
              }
            }
          }
        }

        .hud-group.wave-center {
          grid-column: 1 / -1;
          grid-row: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-width: 0;
          gap: 8px;
          width: 100%;

          .wave-info {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            text-align: left;
          }

          .wave-mob-preview {
            width: 28px;
            height: 28px;
            border-radius: 4px;
          }

          .wave-title-row {
            justify-content: flex-start;
            gap: 6px;
          }

          .wave-badge {
            font-size: 0.65rem;
            padding: 1px 4px;
          }

          .wave-name {
            font-size: 0.75rem;
          }

          .wave-intel {
            display: none;
          }

          .call-wave-btn {
            padding: 4px 10px;
            font-size: 0.75rem;
            gap: 4px;
            min-height: 32px;
            white-space: nowrap;
            flex-shrink: 0;

            .gamepad-hint {
              font-size: 0.6rem;
            }
          }

          .wave-in-progress {
            padding: 4px 8px;
            font-size: 0.7rem;
            white-space: nowrap;
            flex-shrink: 0;
          }
        }
      }
      .wave-mob-preview {
        width: 38px;
        height: 38px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;

        .wave-mob-portrait {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
        }
      }

      .wave-text-content {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
    `,
  ],
})
export class HudComponent {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly audio = inject(AudioService);
  protected readonly allMaps = ALL_MAPS;

  protected readonly primaryMobType = computed(() => {
    const wave = this.game.currentWaveDef();
    return wave?.groups[0]?.mobType || 'skulker';
  });

  protected onSelectMap(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const targetMap = this.allMaps.find((m) => m.id === select.value);
    if (targetMap) {
      this.game.loadMap(targetMap);
    }
  }
}
