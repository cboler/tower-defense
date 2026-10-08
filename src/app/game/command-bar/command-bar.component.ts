import { Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { IconComponent } from '../icon/icon.component';

/**
 * Bottom-of-screen wave controls: pause, speed, wave intel and the primary
 * Call Wave / Rush action — all inside the thumb zone on phones.
 */
@Component({
  selector: 'app-command-bar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="command-bar" role="toolbar" aria-label="Wave controls">
      <button
        type="button"
        class="ctrl-btn pause-btn"
        id="pause-btn"
        [class.attention]="game.isPaused() && !game.hasUserEngaged()"
        [class.is-paused]="game.isPaused()"
        (click)="game.togglePause()"
        [title]="
          game.isPaused()
            ? !game.hasUserEngaged()
              ? 'Start Battle [Space]'
              : 'Resume Game [Space]'
            : 'Pause Game [Space]'
        "
        [attr.aria-label]="game.isPaused() ? 'Resume Game' : 'Pause Game'"
      >
        <app-icon [name]="game.isPaused() ? 'play' : 'pause'" [size]="20" />
      </button>

      <button
        type="button"
        class="ctrl-btn speed-btn"
        id="speed-btn"
        [class.fast]="game.gameSpeed() > 1"
        (click)="game.cycleSpeed()"
        [title]="'Game Speed ' + game.gameSpeed() + 'x [Y]'"
        [attr.aria-label]="'Game speed ' + game.gameSpeed() + 'x'"
      >
        <span class="speed-label">{{ game.gameSpeed() }}×</span>
      </button>

      <button
        type="button"
        class="wave-info"
        id="wave-intel-btn"
        (click)="game.toggleScout()"
        title="Scouting report [S]"
        [attr.aria-label]="
          'Wave ' +
          (game.currentWaveIndex() + 1) +
          ' of ' +
          game.totalWaves() +
          '. Open scouting report'
        "
      >
        @if (primaryMobType(); as mobType) {
          <img
            class="wave-portrait"
            [src]="'assets/monsters/' + mobType + '-portrait.png'"
            alt=""
            loading="lazy"
          />
        }
        <span class="wave-text">
          <span class="wave-line">
            <span class="wave-num"
              >Wave {{ game.currentWaveIndex() + 1 }}<small>/{{ game.totalWaves() }}</small></span
            >
            @if (game.upcomingWaveDef(); as wDef) {
              <span class="threat" [attr.data-threat]="threatKey()">{{ wDef.threatBadge }}</span>
            }
          </span>
          <span class="wave-sub">
            @if (game.waveActive()) {
              <span class="beacon" aria-hidden="true"></span> In combat
            } @else if (game.isPaused() && !game.hasUserEngaged()) {
              Paused · press play
            } @else {
              {{ game.currentWaveDef()?.name }}
            }
          </span>
        </span>
        <app-icon class="scout-icon" name="search" [size]="16" />
      </button>

      <div class="primary-slot">
        @if (game.isCountdownActive()) {
          <button
            type="button"
            class="primary-btn call"
            id="call-wave-btn"
            [class.urgent]="game.secondsRemaining() <= 5 && !game.isPaused()"
            (click)="onCallWaveClick($event)"
            [title]="'Call the wave now for +' + game.earlyCallBonusGold() + 'G [X]'"
            [attr.aria-label]="
              'Call Wave ' +
              (game.currentWaveIndex() + 1) +
              ' with ' +
              game.earlyCallBonusGold() +
              ' Gold bonus'
            "
          >
            <span
              class="timer-fill"
              aria-hidden="true"
              [style.transform]="
                'scaleX(' + game.countdownRemainingMs() / game.countdownDurationMs + ')'
              "
            ></span>
            <app-icon name="swords" [size]="18" />
            <span class="primary-text">
              <span class="primary-label">Call Wave</span>
              <span class="primary-meta">
                +{{ game.earlyCallBonusGold() }}G
                @if (game.hasUserEngaged()) {
                  · {{ game.secondsRemaining() }}s
                }
              </span>
            </span>
            <span class="gamepad-hint" aria-hidden="true">X</span>
          </button>
        } @else if (game.waveActive()) {
          @if (game.currentWaveIndex() < game.totalWaves() - 1) {
            <button
              type="button"
              class="primary-btn rush"
              id="rush-wave-btn"
              (click)="game.rushWave()"
              [disabled]="!game.canRushWave()"
              [title]="
                game.canRushWave()
                  ? 'Rush next wave for +' + game.earlyCallBonusGold() + 'G [R]'
                  : 'Rush unlocks once the vanguard engages'
              "
              [attr.aria-label]="'Rush next wave for ' + game.earlyCallBonusGold() + ' Gold bonus'"
            >
              <app-icon name="bolt" [size]="18" />
              <span class="primary-text">
                <span class="primary-label">Rush</span>
                <span class="primary-meta">+{{ game.earlyCallBonusGold() }}G</span>
              </span>
              <span class="gamepad-hint" aria-hidden="true">R</span>
            </button>
          } @else {
            <div class="final-wave" role="status">Final wave</div>
          }
        } @else if (!game.isGameOver() && !game.isVictory()) {
          <button
            type="button"
            class="primary-btn call"
            id="call-wave-btn"
            (click)="onCallWaveClick($event)"
            [attr.aria-label]="'Call Wave ' + (game.currentWaveIndex() + 1)"
          >
            <app-icon name="swords" [size]="18" />
            <span class="primary-text">
              <span class="primary-label">Call Wave</span>
            </span>
            <span class="gamepad-hint" aria-hidden="true">X</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .command-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px var(--space-2);
        background: linear-gradient(0deg, rgba(14, 20, 34, 0.98), rgba(10, 15, 27, 0.94));
        border-top: 1px solid var(--border-subtle);
      }

      .ctrl-btn {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        padding: 0;
        border-radius: var(--radius-md);
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        transition:
          background 0.15s ease,
          border-color 0.15s ease;

        &:hover {
          background: rgba(148, 163, 184, 0.16);
        }
      }

      .pause-btn.is-paused {
        color: var(--color-success);
      }

      .pause-btn.attention {
        border-color: rgba(74, 222, 128, 0.7);
        background: rgba(74, 222, 128, 0.14);
        animation: attention 1.6s ease-in-out infinite;
      }

      @keyframes attention {
        50% {
          box-shadow: 0 0 0 5px rgba(74, 222, 128, 0.18);
        }
      }

      .speed-label {
        font-family: var(--font-tactical);
        font-weight: 700;
        font-size: 1rem;
      }

      .speed-btn.fast {
        color: var(--color-warning);
        border-color: rgba(251, 191, 36, 0.4);
      }

      .wave-info {
        flex: 1;
        min-width: 0;
        height: 48px;
        justify-content: flex-start;
        gap: var(--space-2);
        padding: 0 var(--space-2);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-primary);
        text-align: left;
        font-weight: 500;

        &:hover {
          background: rgba(148, 163, 184, 0.08);
        }
      }

      .wave-portrait {
        display: none;
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        border: 1px solid var(--border-muted);
        flex-shrink: 0;
      }

      .wave-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.2;
      }

      .wave-line {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .wave-num {
        font-family: var(--font-tactical);
        font-weight: 700;
        font-size: var(--font-size-sm);
        white-space: nowrap;

        small {
          font-size: var(--font-size-2xs);
          color: var(--text-muted);
        }
      }

      .threat {
        font-family: var(--font-tactical);
        font-size: 0.625rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 0 5px;
        border-radius: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--threat, #cbd5e1);
        background: color-mix(in srgb, var(--threat, #94a3b8) 16%, transparent);

        &[data-threat='infantry'] {
          --threat: #4ade80;
        }
        &[data-threat='sprinters'] {
          --threat: #facc15;
        }
        &[data-threat='armored'] {
          --threat: #60a5fa;
        }
        &[data-threat='aerial'] {
          --threat: #c084fc;
        }
        &[data-threat='magic-immune'] {
          --threat: #f87171;
        }
        &[data-threat='mixed'] {
          --threat: #fb923c;
        }
        &[data-threat='boss'] {
          --threat: #a3e635;
        }
        &[data-threat='apex-boss'] {
          --threat: #f472b6;
        }
      }

      .wave-sub {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: var(--font-size-xs);
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .beacon {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-error);
        box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.6);
        animation: beacon 1.2s ease-out infinite;
      }

      @keyframes beacon {
        to {
          box-shadow: 0 0 0 7px rgba(248, 113, 113, 0);
        }
      }

      .scout-icon {
        display: none;
        margin-left: auto;
        color: var(--text-muted);
      }

      .primary-slot {
        flex-shrink: 0;
      }

      .primary-btn {
        position: relative;
        overflow: hidden;
        gap: var(--space-2);
        height: 48px;
        min-width: 116px;
        padding: 0 var(--space-3);
        border-radius: var(--radius-md);
        color: #fff;
        transition:
          filter 0.15s ease,
          transform 0.1s ease;

        &:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        &:active:not(:disabled) {
          transform: scale(0.97);
        }

        > app-icon,
        > .primary-text,
        > .gamepad-hint {
          position: relative;
        }

        &.call {
          background: linear-gradient(180deg, #2b9be0, var(--color-primary-strong));
          border: 1px solid rgba(125, 211, 252, 0.55);
          box-shadow:
            0 6px 18px rgba(2, 132, 199, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        &.call.urgent {
          animation: urgent 0.9s ease-in-out infinite;
        }

        &.rush {
          color: #1a1204;
          background: linear-gradient(180deg, #f8d26b, #d9a21b);
          border: 1px solid rgba(253, 230, 138, 0.7);

          &:disabled {
            opacity: 0.4;
            filter: grayscale(0.6);
          }
        }
      }

      @keyframes urgent {
        50% {
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.3);
        }
      }

      .timer-fill {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.75);
        transform-origin: left center;
        transition: transform 0.25s linear;
      }

      .primary-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        line-height: 1.1;
      }

      .primary-label {
        font-size: var(--font-size-sm);
        font-weight: 800;
        white-space: nowrap;
      }

      .primary-meta {
        font-family: var(--font-tactical);
        font-size: var(--font-size-2xs);
        font-weight: 700;
        opacity: 0.85;
        white-space: nowrap;
      }

      .gamepad-hint {
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 4px;
        border-radius: 5px;
        font-family: var(--font-tactical);
        font-size: 0.6875rem;
        font-weight: 700;
        background: rgba(0, 0, 0, 0.25);
      }

      .final-wave {
        display: grid;
        place-items: center;
        height: 48px;
        padding: 0 var(--space-4);
        border-radius: var(--radius-md);
        font-family: var(--font-tactical);
        font-size: var(--font-size-xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #f472b6;
        border: 1px dashed rgba(244, 114, 182, 0.5);
      }

      @media (min-width: 420px) {
        .wave-portrait {
          display: block;
        }
      }

      @media (min-width: 560px) {
        .command-bar {
          gap: var(--space-2);
          padding: 8px var(--space-3);
        }
        .scout-icon {
          display: inline-flex;
        }
        .primary-btn {
          min-width: 150px;
          padding: 0 var(--space-4);
        }
      }

      @media (orientation: landscape) and (max-height: 519px) {
        .command-bar {
          padding: 6px var(--space-2);
        }
        .ctrl-btn,
        .wave-info,
        .primary-btn,
        .final-wave {
          height: 44px;
        }
        .ctrl-btn {
          width: 44px;
        }
      }
    `,
  ],
})
export class CommandBarComponent {
  protected readonly game = inject(GameService);

  protected readonly primaryMobType = computed(() => {
    const wave = this.game.currentWaveDef();
    return wave?.groups[0]?.mobType || 'skulker';
  });

  protected readonly threatKey = computed(
    () => this.game.upcomingWaveDef()?.threatBadge.toLowerCase().replace(' ', '-') ?? '',
  );

  protected onCallWaveClick(event: MouseEvent): void {
    (event.currentTarget as HTMLElement)?.blur();
    this.game.startNextWave();
  }
}
