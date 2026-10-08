import { Component, HostListener, inject, output } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { GamepadService } from '../../core/services/gamepad.service';
import { AudioService } from '../../core/services/audio.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [IconComponent],
  template: `
    <header class="game-hud" role="region" aria-label="Game Status Bar">
      <div class="brand" aria-hidden="true">
        <span class="brand-gem"><app-icon name="crystal" [size]="14" /></span>
        <span class="brand-name">Crystal Wardens</span>
        <span class="brand-map">{{ game.activeMap().name }}</span>
      </div>

      <div class="resources">
        <div
          class="res-chip crystals"
          [class.critical]="game.crystals() <= 5"
          title="Sacred Crystals remaining before defeat"
        >
          <app-icon name="crystal" [size]="16" />
          <span class="res-value">{{ game.crystals() }}</span>
          <span class="res-max">/{{ game.maxCrystals() }}</span>
          <span class="sr-only">crystals remaining</span>
        </div>

        <div class="res-chip gold" title="Gold treasury for placing and upgrading defenders">
          <app-icon name="coin" [size]="16" />
          <span class="res-value">{{ game.gold() }}</span>
          <span class="res-unit">G</span>
          <span class="sr-only">gold</span>
        </div>

        <div class="res-chip score" title="Battle honor score">
          <app-icon name="star" [size]="15" />
          <span class="res-value">{{ game.score() }}</span>
          <span class="sr-only">score</span>
        </div>
      </div>

      <nav class="hud-nav" aria-label="Game menus">
        <button
          type="button"
          class="nav-btn"
          id="campaign-hud-btn"
          (click)="toggleCampaign()"
          title="Campaign Missions & Story Briefing [M]"
          aria-label="Campaign Missions"
        >
          <app-icon name="map" [size]="19" />
          <span class="nav-label">Missions</span>
          <span class="nav-stars">{{ game.campaign.totalStars() }}★</span>
        </button>

        <button
          type="button"
          class="nav-btn"
          id="bestiary-hud-btn"
          (click)="toggleBestiary()"
          title="Monster Bestiary & Counter Strategies [B]"
          aria-label="Monster Bestiary"
        >
          <app-icon name="book" [size]="19" />
          <span class="nav-label">Bestiary</span>
        </button>

        <button
          type="button"
          class="nav-btn wide-only"
          id="mute-btn"
          (click)="audio.toggleMute()"
          [title]="audio.muted() ? 'Unmute Audio' : 'Mute Audio'"
          [attr.aria-label]="audio.muted() ? 'Unmute Audio' : 'Mute Audio'"
        >
          <app-icon [name]="audio.muted() ? 'mute' : 'volume'" [size]="19" />
        </button>

        @if (gamepad.connected()) {
          <span class="pad-dot" [title]="gamepad.controllerName()" role="status">
            <app-icon name="gamepad" [size]="18" />
            <span class="sr-only">Controller connected</span>
          </span>
        }

        <button
          type="button"
          class="nav-btn menu-btn"
          id="menu-hud-btn"
          (click)="openMenu.emit()"
          title="Menu [Esc / Start]"
          aria-label="Open menu"
        >
          <app-icon name="menu" [size]="20" />
        </button>
      </nav>

      <!-- Tactical Scouting Dossier -->
      @if (game.isScoutOpen()) {
        <div
          class="cw-scrim"
          (click)="onBackdropClick($event)"
          (keydown.escape)="$event.stopPropagation(); toggleScout()"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scout-title"
        >
          <div class="cw-sheet scout-sheet">
            <div class="cw-sheet-header">
              <div class="cw-sheet-titles">
                <span class="cw-eyebrow">Scouting report</span>
                <h3 id="scout-title" class="cw-title">
                  Wave {{ game.currentWaveIndex() + 1 }} · {{ game.upcomingWaveDef()?.name }}
                </h3>
              </div>
              <button
                type="button"
                class="cw-icon-btn"
                (click)="toggleScout()"
                title="Close [Esc / S]"
                aria-label="Close scouting report"
              >
                <app-icon name="close" />
              </button>
            </div>

            <div class="cw-sheet-body">
              @if (game.upcomingWaveDef(); as wave) {
                <p class="intel-quote">“{{ wave.intel }}”</p>
                <div class="rec-row">
                  <span class="rec-label">Recommended</span>
                  <span class="rec-value">{{ wave.recommendedClass }}</span>
                </div>
              }

              <h4 class="roster-title">Incoming</h4>
              <ul class="roster-list">
                @for (m of game.waveCompositionSummary(); track m.mobType) {
                  <li class="roster-row" [style.--accent]="m.color">
                    <span class="roster-avatar">
                      <img
                        [src]="'assets/monsters/' + m.mobType + '-portrait.png'"
                        [alt]="m.name"
                        loading="lazy"
                      />
                    </span>
                    <span class="roster-main">
                      <span class="roster-name">
                        {{ m.name }}
                        <span class="roster-move" [class.is-air]="m.isFlying">
                          {{ m.isFlying ? 'Air' : 'Ground' }}
                        </span>
                      </span>
                      <span class="roster-tags">
                        @if (m.armor > 0.3) {
                          <span class="def-tag phys">{{ round(m.armor * 100) }}% armor</span>
                        }
                        @if (m.magicResist > 0.3) {
                          <span class="def-tag magic"
                            >{{ round(m.magicResist * 100) }}% magic resist</span
                          >
                        }
                        @if (m.magicResist < 0) {
                          <span class="def-tag weak">Weak to magic</span>
                        }
                        @if (m.armor <= 0.3 && m.magicResist <= 0.3 && m.magicResist >= 0) {
                          <span class="def-tag">Balanced</span>
                        }
                      </span>
                    </span>
                    <span class="roster-count">×{{ m.count }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>
        </div>
      }
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .game-hud {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        height: 56px;
        padding: 0 var(--space-2) 0 var(--space-3);
        background: linear-gradient(180deg, rgba(14, 20, 34, 0.98), rgba(10, 15, 27, 0.94));
        border-bottom: 1px solid var(--border-subtle);
      }

      /* Brand only appears where there is room for it */
      .brand {
        display: none;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
        margin-right: var(--space-2);
      }

      .brand-gem {
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        color: var(--color-crystal);
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.3);
      }

      .brand-name {
        font-family: var(--font-display);
        font-weight: 800;
        font-size: 0.95rem;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }

      .brand-map {
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-left: var(--space-2);
        border-left: 1px solid var(--border-muted);
      }

      .resources {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .res-chip {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        height: 34px;
        padding: 0 10px;
        border-radius: var(--radius-full);
        background: rgba(148, 163, 184, 0.07);
        border: 1px solid var(--border-subtle);
        font-family: var(--font-tactical);
        white-space: nowrap;

        app-icon {
          align-self: center;
        }

        &.crystals app-icon {
          color: var(--color-crystal);
        }
        &.gold app-icon {
          color: var(--color-gold);
        }
        &.score {
          display: none;

          app-icon {
            color: var(--color-warning);
          }
        }

        &.critical {
          border-color: rgba(248, 113, 113, 0.6);
          background: rgba(239, 68, 68, 0.14);
          animation: critical-pulse 1.2s ease-in-out infinite;

          app-icon,
          .res-value {
            color: var(--color-error);
          }
        }
      }

      @keyframes critical-pulse {
        50% {
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
        }
      }

      .res-value {
        font-size: 1.05rem;
        font-weight: 700;
        line-height: 34px;
        font-variant-numeric: tabular-nums;
      }

      .gold .res-value {
        color: #fde68a;
      }

      .res-max,
      .res-unit {
        font-size: var(--font-size-xs);
        font-weight: 600;
        color: var(--text-muted);
      }

      .hud-nav {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
      }

      .nav-btn {
        position: relative;
        gap: 6px;
        min-width: 44px;
        min-height: 44px;
        padding: 0 10px;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        font-weight: 600;
        transition:
          background 0.15s ease,
          color 0.15s ease;

        &:hover {
          background: rgba(148, 163, 184, 0.1);
          color: var(--text-primary);
        }
      }

      .nav-label {
        display: none;
      }

      .nav-stars {
        position: absolute;
        top: 3px;
        right: 1px;
        padding: 0 4px;
        border-radius: var(--radius-full);
        font-family: var(--font-tactical);
        font-size: 0.625rem;
        font-weight: 700;
        line-height: 14px;
        color: #1a1204;
        background: var(--color-gold);
      }

      .wide-only {
        display: none;
      }

      .menu-btn {
        color: var(--text-primary);
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid var(--border-subtle);
      }

      .pad-dot {
        display: none;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--color-success);
      }

      /* ≥ 480px: a little more breathing room */
      @media (min-width: 480px) {
        .res-chip.score {
          display: inline-flex;
        }
        .pad-dot {
          display: grid;
        }
      }

      /* ≥ 900px: labelled navigation, brand, audio */
      @media (min-width: 900px) {
        .game-hud {
          height: 60px;
          padding: 0 var(--space-4);
          gap: var(--space-3);
        }

        .brand {
          display: flex;
        }

        .wide-only {
          display: inline-flex;
        }

        .nav-label {
          display: inline;
        }

        .nav-stars {
          position: static;
          line-height: 16px;
        }
      }

      /* Short landscape phones: trim the bar height */
      @media (orientation: landscape) and (max-height: 519px) {
        .game-hud {
          height: 48px;
        }
        .res-chip {
          height: 30px;
        }
        .res-value {
          line-height: 30px;
        }
      }

      /* Scouting sheet */
      .intel-quote {
        margin: 0 0 var(--space-3);
        font-style: italic;
        color: var(--text-secondary);
        line-height: 1.5;
      }

      .rec-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3);
        margin-bottom: var(--space-4);
        border-radius: var(--radius-md);
        background: rgba(74, 222, 128, 0.08);
        border: 1px solid rgba(74, 222, 128, 0.25);
      }

      .rec-label {
        font-size: var(--font-size-xs);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
      }

      .rec-value {
        font-weight: 700;
        color: var(--color-success);
        text-align: right;
      }

      .roster-title {
        font-family: var(--font-tactical);
        font-size: var(--font-size-2xs);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-muted);
        margin: 0 0 var(--space-2);
      }

      .roster-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }

      .roster-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2);
        border-radius: var(--radius-md);
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-left: 3px solid var(--accent, var(--border-muted));
      }

      .roster-avatar {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: #0b1220;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .roster-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .roster-name {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-weight: 700;
        font-size: var(--font-size-sm);
      }

      .roster-move {
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 1px 6px;
        border-radius: var(--radius-full);
        color: var(--text-secondary);
        background: rgba(148, 163, 184, 0.12);

        &.is-air {
          color: var(--color-arcane);
          background: rgba(192, 132, 252, 0.14);
        }
      }

      .roster-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .def-tag {
        font-size: var(--font-size-2xs);
        padding: 1px 6px;
        border-radius: 4px;
        color: var(--text-secondary);
        background: rgba(148, 163, 184, 0.08);

        &.phys {
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.12);
        }
        &.magic {
          color: #d8b4fe;
          background: rgba(168, 85, 247, 0.12);
        }
        &.weak {
          color: #fdba74;
          background: rgba(249, 115, 22, 0.12);
        }
      }

      .roster-count {
        font-family: var(--font-tactical);
        font-size: var(--font-size-lg);
        font-weight: 700;
        color: var(--text-primary);
        padding-right: var(--space-1);
      }
    `,
  ],
})
export class HudComponent {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly audio = inject(AudioService);
  protected readonly round = Math.round;

  /** Asks the game shell to open the pause / options menu. */
  public readonly openMenu = output<void>();

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
      if (this.game.isScoutOpen()) this.game.isScoutOpen.set(false);
      if (this.game.isCampaignModalOpen()) this.game.isCampaignModalOpen.set(false);
      if (this.game.isBestiaryModalOpen()) this.game.isBestiaryModalOpen.set(false);
    }
  }

  public toggleScout(): void {
    this.game.toggleScout();
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
}
