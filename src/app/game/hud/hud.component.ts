import { Component, HostListener, computed, inject, signal } from '@angular/core';
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

      <!-- Center: Wave Status, Countdown & Call Wave / Scouting -->
      <div class="hud-group wave-center">
        <!-- Interactive Wave Intel Box -->
        <div
          class="wave-info"
          (click)="toggleScout()"
          (keydown.enter)="toggleScout()"
          (keydown.space)="toggleScout()"
          role="button"
          tabindex="0"
          title="Click to view Tactical Scouting Dossier [S]"
        >
          @if (primaryMobType(); as mobType) {
            <div class="wave-mob-preview" [title]="'Next incoming enemy: ' + mobType">
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
              @if (game.upcomingWaveDef(); as wDef) {
                <span
                  class="threat-tag"
                  [class]="'tag-' + wDef.threatBadge.toLowerCase().replace(' ', '-')"
                >
                  {{ wDef.threatBadge }}
                </span>
              }
              <span class="wave-name">{{ game.currentWaveDef()?.name }}</span>
            </div>
            <div class="wave-intel-row">
              <p class="wave-intel">{{ game.currentWaveDef()?.intel }}</p>
              <button
                type="button"
                class="scout-chip-btn"
                (click)="$event.stopPropagation(); toggleScout()"
                title="Open Tactical Scouting Intel Dossier [S]"
              >
                🔍 Scout [S]
              </button>
            </div>
          </div>
        </div>

        <!-- Wave Call & Countdown Controls -->
        <div class="wave-actions">
          @if (game.isCountdownActive()) {
            <!-- Inter-Wave Preparation Timer -->
            <div
              class="countdown-pill"
              [class.urgent]="game.secondsRemaining() <= 5 && !game.isPaused()"
              [class.paused]="game.isPaused()"
              [title]="
                game.isPaused()
                  ? !game.hasUserEngaged()
                    ? 'Game Paused: Deploy your first defender or press ▶ Play to begin'
                    : 'Game Paused: Press ▶ Play to resume'
                  : 'Time until wave auto-deploys'
              "
            >
              <div
                class="countdown-fill"
                [style.width.%]="(game.countdownRemainingMs() / game.countdownDurationMs) * 100"
              ></div>
              <span class="countdown-icon" aria-hidden="true">{{
                game.isPaused() ? '⏸️' : '⏱️'
              }}</span>
              <span class="countdown-sec">{{
                game.isPaused() && !game.hasUserEngaged() ? 'PAUSED' : game.secondsRemaining() + 's'
              }}</span>
            </div>

            <button
              type="button"
              class="call-wave-btn has-bonus"
              id="call-wave-btn"
              (click)="onCallWaveClick($event)"
              [title]="
                'Dispatch wave immediately for +' +
                game.earlyCallBonusGold() +
                'G Early Call Bonus!'
              "
              [attr.aria-label]="
                'Call Wave ' +
                (game.currentWaveIndex() + 1) +
                ' with ' +
                game.earlyCallBonusGold() +
                ' Gold bonus'
              "
            >
              <span class="btn-glow" aria-hidden="true"></span>
              <span class="btn-icon">⚔️</span>
              <span class="btn-text">Call Wave (+{{ game.earlyCallBonusGold() }}G)</span>
              <span class="gamepad-hint" aria-hidden="true">[X]</span>
            </button>
          } @else if (game.waveActive()) {
            <div class="wave-combat-block">
              <div class="wave-in-progress" role="status">
                <span class="pulsing-beacon" aria-hidden="true"></span>
                <span class="progress-text">In Combat</span>
              </div>
              @if (game.currentWaveIndex() < game.totalWaves() - 1) {
                <button
                  type="button"
                  class="rush-wave-btn"
                  id="rush-wave-btn"
                  (click)="game.rushWave()"
                  [disabled]="!game.canRushWave()"
                  [title]="
                    game.canRushWave()
                      ? 'Rush next wave for +' + game.earlyCallBonusGold() + 'G Bravery Bonus! [R]'
                      : 'Rush locked: vanguard engaging...'
                  "
                  [attr.aria-label]="
                    'Rush next wave for ' + game.earlyCallBonusGold() + ' Gold bonus'
                  "
                >
                  <span class="rush-icon">⚡</span>
                  <span class="rush-text">Rush (+{{ game.earlyCallBonusGold() }}G)</span>
                  <span class="gamepad-hint" aria-hidden="true">[R]</span>
                </button>
              }
            </div>
          } @else if (!game.isGameOver() && !game.isVictory()) {
            <button
              type="button"
              class="call-wave-btn"
              id="call-wave-btn"
              (click)="onCallWaveClick($event)"
              [attr.aria-label]="'Call Wave ' + (game.currentWaveIndex() + 1)"
            >
              <span class="btn-glow" aria-hidden="true"></span>
              <span class="btn-icon">⚔️</span>
              <span class="btn-text">Call Wave</span>
              <span class="gamepad-hint" aria-hidden="true">[X]</span>
            </button>
          }
        </div>
      </div>

      <!-- Right: Speed, Controls, Map & Controller -->
      <div class="hud-group controls">
        <!-- Campaign Missions Button -->
        <button
          type="button"
          class="hud-chip-btn campaign-btn"
          id="campaign-hud-btn"
          (click)="toggleCampaign()"
          title="Campaign Missions & Story Briefing [M]"
          aria-label="Campaign Missions"
        >
          <span class="chip-icon">🗺️</span>
          <span class="chip-txt">Missions</span>
          <span class="star-badge-mini">{{ game.campaign.totalStars() }}★</span>
          <span class="gamepad-hint" aria-hidden="true">[M]</span>
        </button>

        <!-- Monster Bestiary Codex Button -->
        <button
          type="button"
          class="hud-chip-btn bestiary-btn"
          id="bestiary-hud-btn"
          (click)="toggleBestiary()"
          title="Monster Bestiary & Counter Strategies [B]"
          aria-label="Monster Bestiary"
        >
          <span class="chip-icon">📖</span>
          <span class="chip-txt">Bestiary</span>
          <span class="gamepad-hint" aria-hidden="true">[B]</span>
        </button>

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
          class="hud-icon-btn pause-btn"
          id="pause-btn"
          [class.initial-attention]="game.isPaused() && !game.hasUserEngaged()"
          (click)="game.togglePause()"
          [title]="
            game.isPaused()
              ? !game.hasUserEngaged()
                ? 'Start Battle / Play [Space]'
                : 'Resume Game [Space]'
              : 'Pause Game [Space]'
          "
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

      <!-- Tactical Scouting Dossier Modal -->
      @if (isScoutOpen()) {
        <div
          class="scout-backdrop"
          (click)="onBackdropClick($event)"
          (keydown.escape)="toggleScout()"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scout-title"
        >
          <div class="scout-dossier">
            <div class="scout-header">
              <div class="scout-title-wrap">
                <span class="scout-badge">TACTICAL SCOUTING DOSSIER</span>
                <h3 id="scout-title" class="scout-heading">
                  Wave {{ game.currentWaveIndex() + 1 }} • {{ game.upcomingWaveDef()?.name }}
                </h3>
              </div>
              <button
                type="button"
                class="scout-close-btn"
                (click)="toggleScout()"
                title="Close Scouting Dossier [Esc / S]"
              >
                ✕
              </button>
            </div>

            @if (game.upcomingWaveDef(); as wave) {
              <div class="scout-intel-banner">
                <p class="intel-quote">"{{ wave.intel }}"</p>
                <div class="rec-counter">
                  <span class="rec-label">Recommended Defense:</span>
                  <span class="rec-value">{{ wave.recommendedClass }}</span>
                </div>
              </div>
            }

            <div class="scout-roster">
              <span class="roster-title">INCOMING MONSTER VANGUARDS</span>
              <div class="roster-grid">
                @for (m of game.waveCompositionSummary(); track m.mobType) {
                  <div class="roster-card" [style.border-color]="m.color">
                    <div class="roster-avatar-wrap">
                      <img
                        [src]="'assets/monsters/' + m.mobType + '-portrait.png'"
                        [alt]="m.name"
                        class="roster-avatar-img"
                      />
                      <span class="roster-count-badge">×{{ m.count }}</span>
                    </div>
                    <div class="roster-info">
                      <div class="roster-name-row">
                        <span class="roster-name">{{ m.name }}</span>
                        <span class="roster-flight-badge" [class.is-air]="m.isFlying">
                          {{ m.isFlying ? '✈️ Airborne' : '🚶 Ground' }}
                        </span>
                      </div>
                      <div class="roster-defense-tags">
                        @if (m.armor > 0.3) {
                          <span class="def-tag phys-shield"
                            >🛡️ {{ round(m.armor * 100) }}% Phys Armor</span
                          >
                        }
                        @if (m.magicResist > 0.3) {
                          <span class="def-tag magic-shield"
                            >🔮 {{ round(m.magicResist * 100) }}% Magic Resist</span
                          >
                        }
                        @if (m.magicResist < 0) {
                          <span class="def-tag magic-weak">🔥 Magic Vulnerable</span>
                        }
                        @if (m.armor <= 0.3 && m.magicResist <= 0.3 && m.magicResist >= 0) {
                          <span class="def-tag standard">⚔️ Balanced Defense</span>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <div class="scout-footer">
              <span class="scout-hint">Hotkey [S] toggles scouting dossier</span>
              <button type="button" class="scout-action-btn" (click)="toggleScout()">
                Return to Arena
              </button>
            </div>
          </div>
        </div>
      }
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
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
      }

      .chip-value {
        font-size: var(--font-size-sm);
        font-weight: 700;
        font-family: var(--font-mono);
      }

      /* Wave Center */
      .wave-center {
        flex: 1;
        justify-content: center;
        gap: var(--space-3);
      }

      .wave-info {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: 4px 10px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: rgba(51, 65, 85, 0.6);
          border-color: rgba(56, 189, 248, 0.4);
        }
      }

      .wave-title-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .wave-badge {
        font-size: 0.68rem;
        font-weight: 700;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.15);
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        letter-spacing: 0.05em;
      }

      .threat-tag {
        font-size: 0.65rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;

        &.tag-infantry {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.4);
        }
        &.tag-sprinters {
          background: rgba(234, 179, 8, 0.2);
          color: #facc15;
          border: 1px solid rgba(234, 179, 8, 0.4);
        }
        &.tag-swarm {
          background: rgba(148, 163, 184, 0.2);
          color: #cbd5e1;
          border: 1px solid rgba(148, 163, 184, 0.4);
        }
        &.tag-armored {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.4);
        }
        &.tag-aerial {
          background: rgba(168, 85, 247, 0.2);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.4);
        }
        &.tag-magic-immune {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.4);
        }
        &.tag-mixed {
          background: rgba(249, 115, 22, 0.2);
          color: #fb923c;
          border: 1px solid rgba(249, 115, 22, 0.4);
        }
        &.tag-boss {
          background: rgba(132, 204, 22, 0.25);
          color: #a3e635;
          border: 1px solid rgba(132, 204, 22, 0.6);
          font-weight: 800;
        }
        &.tag-apex-boss {
          background: rgba(236, 72, 153, 0.25);
          color: #f472b6;
          border: 1px solid rgba(236, 72, 153, 0.6);
          font-weight: 800;
          animation: pulse-danger 1.2s infinite alternate;
        }
      }

      .wave-name {
        font-size: var(--font-size-sm);
        font-weight: 700;
        color: var(--text-primary);
      }

      .wave-intel-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .wave-intel {
        margin: 2px 0 0 0;
        font-size: 0.72rem;
        color: var(--text-secondary);
        max-width: 320px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .scout-chip-btn {
        background: rgba(56, 189, 248, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.3);
        color: #7dd3fc;
        font-size: 0.65rem;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(56, 189, 248, 0.3);
          color: #ffffff;
        }
      }

      /* Wave Actions & Countdown */
      .wave-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .countdown-pill {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: var(--radius-md);
        overflow: hidden;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 700;
        color: #38bdf8;

        &.urgent {
          border-color: #f97316;
          color: #fb923c;
          animation: pulse-danger 0.8s infinite alternate;
        }

        &.paused {
          border-color: rgba(148, 163, 184, 0.4);
          color: #94a3b8;
          background: rgba(15, 23, 42, 0.9);
        }

        .countdown-fill {
          position: absolute;
          left: 0;
          bottom: 0;
          top: 0;
          background: rgba(56, 189, 248, 0.18);
          z-index: 0;
          transition: width 0.1s linear;
        }

        .countdown-icon,
        .countdown-sec {
          position: relative;
          z-index: 1;
        }
      }

      /* Call Wave Button */
      .call-wave-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        color: #ffffff;
        font-weight: 700;
        font-size: var(--font-size-sm);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-md);
        box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
        cursor: pointer;
        transition: all 0.2s ease;

        &.has-bonus {
          background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 70%, #d97706 100%);
          border-color: rgba(251, 191, 36, 0.5);
          box-shadow: 0 4px 16px rgba(217, 119, 6, 0.4);
        }

        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.6);
        }

        &:active {
          transform: translateY(1px);
        }
      }

      .wave-combat-block {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
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

      .rush-wave-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: var(--space-2) var(--space-3);
        background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
        color: #ffffff;
        font-size: var(--font-size-xs);
        font-weight: 700;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-md);
        box-shadow: 0 4px 12px rgba(234, 88, 12, 0.4);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(234, 88, 12, 0.6);
        }

        &:disabled {
          opacity: 0.45;
          filter: grayscale(0.6);
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
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
      .hud-chip-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: var(--radius-md);
        color: #f1f5f9;
        font-size: var(--font-size-xs);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          transform: translateY(-1px);
        }

        &.campaign-btn {
          border-color: rgba(56, 189, 248, 0.4);
          background: rgba(2, 132, 199, 0.15);
          &:hover {
            background: rgba(2, 132, 199, 0.3);
            border-color: #38bdf8;
          }
        }

        &.bestiary-btn {
          border-color: rgba(168, 85, 247, 0.4);
          background: rgba(147, 51, 234, 0.15);
          &:hover {
            background: rgba(147, 51, 234, 0.3);
            border-color: #c084fc;
          }
        }
      }

      .star-badge-mini {
        font-family: var(--font-mono);
        font-size: 0.6rem;
        font-weight: 800;
        color: #facc15;
        background: rgba(250, 204, 21, 0.15);
        padding: 1px 4px;
        border-radius: 4px;
      }

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

        &.initial-attention {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
          animation: pulse-attention 1.8s infinite ease-in-out;
        }

        @keyframes pulse-attention {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 16px rgba(56, 189, 248, 0.7);
          }
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

      /* Tactical Scouting Dossier Modal Overlay */
      .scout-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(8, 12, 20, 0.78);
        backdrop-filter: blur(8px);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
      }

      .scout-dossier {
        width: 100%;
        max-width: 620px;
        background: linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%);
        border: 2px solid rgba(56, 189, 248, 0.5);
        border-radius: var(--radius-lg);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
        padding: var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        animation: scout-appear 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes scout-appear {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .scout-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: var(--space-2);
      }

      .scout-badge {
        font-size: 0.65rem;
        font-weight: 800;
        color: #38bdf8;
        letter-spacing: 0.08em;
      }

      .scout-heading {
        margin: 2px 0 0 0;
        font-size: var(--font-size-lg);
        font-weight: 800;
        color: #ffffff;
      }

      .scout-close-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: var(--text-muted);
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          color: #ffffff;
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.2);
        }
      }

      .scout-intel-banner {
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        display: flex;
        flex-direction: column;
        gap: 6px;

        .intel-quote {
          margin: 0;
          font-size: 0.8rem;
          color: #e2e8f0;
          font-style: italic;
        }

        .rec-counter {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;

          .rec-label {
            color: #94a3b8;
          }

          .rec-value {
            color: #38bdf8;
            font-weight: 700;
          }
        }
      }

      .scout-roster {
        display: flex;
        flex-direction: column;
        gap: 6px;

        .roster-title {
          font-size: 0.68rem;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.06em;
        }

        .roster-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 8px;
          max-height: 260px;
          overflow-y: auto;
        }
      }

      .roster-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: var(--radius-md);
      }

      .roster-avatar-wrap {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 6px;
        overflow: hidden;
        background: #020617;
        flex-shrink: 0;

        .roster-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .roster-count-badge {
          position: absolute;
          right: 2px;
          bottom: 2px;
          background: rgba(0, 0, 0, 0.75);
          color: #fbbf24;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 4px;
        }
      }

      .roster-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex: 1;

        .roster-name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }

        .roster-name {
          font-size: 0.8rem;
          font-weight: 700;
          color: #ffffff;
        }

        .roster-flight-badge {
          font-size: 0.65rem;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(100, 116, 139, 0.2);
          color: #94a3b8;

          &.is-air {
            background: rgba(168, 85, 247, 0.25);
            color: #d8b4fe;
            font-weight: 700;
          }
        }
      }

      .roster-defense-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;

        .def-tag {
          font-size: 0.62rem;
          font-weight: 600;
          padding: 1px 5px;
          border-radius: 3px;

          &.phys-shield {
            background: rgba(59, 130, 246, 0.25);
            color: #93c5fd;
          }
          &.magic-shield {
            background: rgba(239, 68, 68, 0.25);
            color: #fca5a5;
          }
          &.magic-weak {
            background: rgba(249, 115, 22, 0.25);
            color: #fdba74;
          }
          &.standard {
            background: rgba(148, 163, 184, 0.2);
            color: #cbd5e1;
          }
        }
      }

      .scout-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: var(--space-2);

        .scout-hint {
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .scout-action-btn {
          background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
          color: #ffffff;
          font-weight: 700;
          font-size: var(--font-size-xs);
          padding: 6px 14px;
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
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
        }

        .hud-group.controls {
          grid-column: 2 / 3;
          grid-row: 1;
          display: flex;
          justify-content: flex-end;
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
            padding: 2px 6px;
          }

          .wave-mob-preview {
            width: 28px;
            height: 28px;
            border-radius: 4px;
          }

          .wave-title-row {
            justify-content: flex-start;
            gap: 4px;
          }

          .wave-badge {
            font-size: 0.62rem;
            padding: 1px 4px;
          }

          .threat-tag {
            font-size: 0.6rem;
            padding: 1px 4px;
          }

          .wave-name {
            font-size: 0.72rem;
          }

          .wave-intel {
            display: none;
          }

          .scout-chip-btn {
            font-size: 0.6rem;
            padding: 1px 4px;
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

          .countdown-pill {
            padding: 2px 6px;
            font-size: 0.68rem;
          }

          .rush-wave-btn {
            padding: 4px 8px;
            font-size: 0.68rem;
          }

          .wave-in-progress {
            padding: 4px 8px;
            font-size: 0.7rem;
            white-space: nowrap;
            flex-shrink: 0;
          }
        }
      }
    `,
  ],
})
export class HudComponent {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly audio = inject(AudioService);
  protected readonly allMaps = ALL_MAPS;
  protected readonly round = Math.round;

  public readonly isScoutOpen = signal<boolean>(false);

  protected readonly primaryMobType = computed(() => {
    const wave = this.game.currentWaveDef();
    return wave?.groups[0]?.mobType || 'skulker';
  });

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 's' || event.key === 'S') {
      if (!this.game.isGameOver() && !this.game.isVictory()) {
        this.toggleScout();
      }
    } else if (event.key === 'm' || event.key === 'M') {
      if (!this.game.isGameOver() && !this.game.isVictory()) {
        this.toggleCampaign();
      }
    } else if (event.key === 'b' || event.key === 'B') {
      if (!this.game.isGameOver() && !this.game.isVictory()) {
        this.toggleBestiary();
      }
    } else if (event.key === 'Escape') {
      if (this.isScoutOpen()) this.isScoutOpen.set(false);
      if (this.game.isCampaignModalOpen()) this.game.isCampaignModalOpen.set(false);
      if (this.game.isBestiaryModalOpen()) this.game.isBestiaryModalOpen.set(false);
    }
  }

  public toggleScout(): void {
    this.isScoutOpen.update((v) => !v);
    this.audio.playSelect();
  }

  public toggleCampaign(): void {
    this.game.toggleCampaignModal();
  }

  public toggleBestiary(): void {
    this.game.toggleBestiaryModal();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.toggleScout();
    }
  }

  protected onCallWaveClick(event: MouseEvent): void {
    (event.currentTarget as HTMLElement)?.blur();
    this.game.startNextWave();
  }

  protected onSelectMap(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const targetMap = this.allMaps.find((m) => m.id === select.value);
    if (targetMap) {
      this.game.loadMap(targetMap);
    }
  }
}
