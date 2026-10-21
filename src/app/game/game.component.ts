import {
  Component,
  afterRenderEffect,
  DOCUMENT,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { GameService } from '../core/services/game.service';
import { GamepadAction, GamepadService } from '../core/services/gamepad.service';
import { AudioService } from '../core/services/audio.service';
import { ALL_MAPS } from '../core/models/map.model';
import { TowerClassId } from '../core/models/tower.model';
import { HudComponent } from './hud/hud.component';
import { BattleMapComponent } from './battle-map/battle-map.component';
import { TowerPanelComponent } from './tower-panel/tower-panel.component';
import { CommandBarComponent } from './command-bar/command-bar.component';
import { IconComponent } from './icon/icon.component';
import { CameraPreset, ThreeBattlefieldService } from './battle-map/three-battlefield.service';
import { CampaignModalComponent } from './campaign-modal/campaign-modal.component';
import { BestiaryModalComponent } from './bestiary-modal/bestiary-modal.component';
import { AboutModalComponent } from './about-modal/about-modal.component';
import { StoryDialogueOverlayComponent } from './story-dialogue-overlay/story-dialogue-overlay.component';
import { BossBarComponent } from './boss-bar/boss-bar.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [
    HudComponent,
    BattleMapComponent,
    TowerPanelComponent,
    CommandBarComponent,
    IconComponent,
    CampaignModalComponent,
    BestiaryModalComponent,
    AboutModalComponent,
    StoryDialogueOverlayComponent,
    BossBarComponent,
  ],
  template: `
    <div class="game-view" role="main" aria-label="Crystal Wardens Arena">
      <app-hud class="game-hud-block" (openMenu)="isPauseMenuOpen.set(true)" />

      <div class="arena-stage-area">
        <app-battle-map class="battle-map-stage" />
        <app-boss-bar />
      </div>

      <app-command-bar class="command-bar-block" />

      @if (isVantageSelected()) {
        <div
          class="cw-scrim command-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Defender command menu"
          tabindex="-1"
          (click)="onCommandBackdrop($event)"
          (keydown.escape)="$event.stopPropagation(); deselectVantage()"
        >
          <app-tower-panel class="tower-command-dock is-visible" (closePanel)="deselectVantage()" />
        </div>
      }

      <!-- Defeat -->
      @if (game.isGameOver()) {
        <div class="cw-scrim" role="dialog" aria-modal="true" aria-labelledby="defeat-title">
          <div class="cw-sheet result-sheet defeat">
            <div class="cw-sheet-body result-body">
              <span class="result-emblem" aria-hidden="true">
                <app-icon name="crystal" [size]="34" />
              </span>
              <span class="cw-eyebrow">Defeat</span>
              <h2 id="defeat-title" class="cw-title result-title">The crystals have shattered</h2>
              <p class="result-sub">The hordes overran the sanctuary. Regroup and try again.</p>

              <dl class="result-stats">
                <div>
                  <dt>Waves</dt>
                  <dd>{{ game.currentWaveIndex() }}/{{ game.totalWaves() }}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>{{ game.score() }}</dd>
                </div>
                <div>
                  <dt>Defenders</dt>
                  <dd>{{ game.towers().length }}</dd>
                </div>
              </dl>
            </div>
            <div class="cw-sheet-footer">
              <button
                type="button"
                class="cw-btn primary block"
                id="defeat-restart-btn"
                (click)="restartGame()"
              >
                <app-icon name="refresh" [size]="18" />
                Try again
                <span class="btn-kbd">A</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Victory -->
      @if (game.isVictory()) {
        <div class="cw-scrim" role="dialog" aria-modal="true" aria-labelledby="victory-title">
          <div class="cw-sheet result-sheet victory">
            <div class="cw-sheet-body result-body">
              <span class="result-emblem" aria-hidden="true">
                <app-icon name="star" [size]="34" />
              </span>
              <span class="cw-eyebrow">Victory · {{ getRank() }}</span>
              <h2 id="victory-title" class="cw-title result-title">Sanctuary protected</h2>
              <p class="result-sub">All {{ game.totalWaves() }} waves defeated.</p>

              <dl class="result-stats">
                <div>
                  <dt>Crystals</dt>
                  <dd>{{ game.crystals() }}/{{ game.maxCrystals() }}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>{{ game.score() }}</dd>
                </div>
                <div>
                  <dt>Rank</dt>
                  <dd class="rank">{{ getRank().split('-')[0] }}</dd>
                </div>
              </dl>

              <ul class="score-breakdown">
                <li>
                  <span>Crystals preserved ({{ game.crystals() }} × 1,000)</span>
                  <b>+{{ game.crystals() * 1000 }}</b>
                </li>
                <li>
                  <span>Treasury surplus ({{ game.gold() }} × 10)</span>
                  <b>+{{ game.gold() * 10 }}</b>
                </li>
              </ul>

              @if (game.activeMission().victoryEpilogue; as epilogue) {
                <figure class="epilogue">
                  <img [src]="epilogue.avatar" [alt]="epilogue.speaker" />
                  <blockquote>
                    @for (line of epilogue.lines; track line) {
                      <p>{{ line }}</p>
                    }
                    <figcaption>— {{ epilogue.speaker }}</figcaption>
                  </blockquote>
                </figure>
              }
            </div>
            <div class="cw-sheet-footer">
              <button type="button" class="cw-btn" id="victory-replay-btn" (click)="restartGame()">
                <app-icon name="refresh" [size]="18" />
                Replay
              </button>
              <button
                type="button"
                class="cw-btn primary action-grow"
                id="victory-next-btn"
                (click)="nextStage()"
              >
                Next stage
                <app-icon name="chevron" [size]="18" />
                <span class="btn-kbd">A</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Pause / options menu -->
      @if (isPauseMenuOpen()) {
        <div
          class="cw-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
          tabindex="-1"
          (click)="onPauseBackdrop($event)"
          (keydown.escape)="$event.stopPropagation(); isPauseMenuOpen.set(false)"
        >
          <div class="cw-sheet pause-sheet">
            <div class="cw-sheet-header">
              <div class="cw-sheet-titles">
                <span class="cw-eyebrow">{{ game.activeMap().name }}</span>
                <h2 id="pause-title" class="cw-title">Battle council</h2>
              </div>
              <button
                type="button"
                class="cw-icon-btn"
                (click)="isPauseMenuOpen.set(false)"
                aria-label="Close menu"
              >
                <app-icon name="close" />
              </button>
            </div>

            <div class="cw-sheet-body pause-body">
              <button
                type="button"
                class="cw-btn primary block"
                id="pause-resume-btn"
                (click)="isPauseMenuOpen.set(false)"
              >
                <app-icon name="play" [size]="18" />
                Resume battle
                <span class="btn-kbd">B</span>
              </button>

              <div class="option-grid">
                <button type="button" class="option-tile" (click)="openFromMenu('missions')">
                  <app-icon name="map" />
                  <span>Missions</span>
                </button>
                <button type="button" class="option-tile" (click)="openFromMenu('bestiary')">
                  <app-icon name="book" />
                  <span>Bestiary</span>
                </button>
                <button type="button" class="option-tile" (click)="cycleCameraPreset()">
                  <app-icon name="camera" />
                  <span>Camera: {{ cameraLabel() }}</span>
                  <span class="btn-kbd">View</span>
                </button>
                <button type="button" class="option-tile" (click)="three.toggleLook()">
                  <app-icon name="sparkle" />
                  <span>Look: {{ three.look() === 'hd2d' ? 'HD-2D' : 'Miniatures' }}</span>
                  <span class="btn-kbd">V</span>
                </button>
                <button type="button" class="option-tile" (click)="audio.toggleMute()">
                  <app-icon [name]="audio.muted() ? 'mute' : 'volume'" />
                  <span>{{ audio.muted() ? 'Sound off' : 'Sound on' }}</span>
                  <span class="btn-kbd">Y</span>
                </button>
                <button type="button" class="option-tile" (click)="openFromMenu('about')">
                  <app-icon name="info" />
                  <span>About</span>
                </button>
              </div>

              <section class="stage-select-box" aria-labelledby="stage-select-label">
                <h3 id="stage-select-label" class="option-label">
                  Stage <span class="btn-kbd">◄ ►</span>
                </h3>
                <div class="stage-buttons-row">
                  @for (m of allMaps; track m.id) {
                    <button
                      type="button"
                      class="stage-choice-btn"
                      [class.active]="game.activeMap().id === m.id"
                      [attr.aria-pressed]="game.activeMap().id === m.id"
                      (click)="game.loadMap(m); isPauseMenuOpen.set(false)"
                    >
                      <span class="stage-name">{{ m.name }}</span>
                      <span class="stage-diff">{{ m.difficulty }}</span>
                    </button>
                  }
                </div>
              </section>

              <button
                type="button"
                class="cw-btn danger block"
                (click)="restartGame(); isPauseMenuOpen.set(false)"
              >
                <app-icon name="refresh" [size]="18" />
                Restart stage
                <span class="btn-kbd">X</span>
              </button>
            </div>
          </div>
        </div>
      }

      @if (game.isCampaignModalOpen()) {
        <app-campaign-modal (closeModal)="game.isCampaignModalOpen.set(false)" />
      }

      @if (game.isBestiaryModalOpen()) {
        <app-bestiary-modal (closeModal)="game.isBestiaryModalOpen.set(false)" />
      }

      @if (isAboutOpen()) {
        <app-about-modal (closeModal)="isAboutOpen.set(false)" />
      }

      <app-story-dialogue-overlay />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }

      .game-view {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #080f19;
      }
      .arena-stage-area {
        position: absolute;
        inset: 0;
        padding: 74px 0 84px;
        display: flex;
        min-height: 0;
      }
      .battle-map-stage {
        flex: 1;
        min-height: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .game-hud-block {
        position: absolute;
        top: 12px;
        left: 16px;
        right: 16px;
        z-index: 10;
      }
      .command-bar-block {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        width: min(720px, calc(100% - 32px));
        z-index: 10;
      }
      .tower-command-dock {
        display: flex;
        width: min(660px, 100%);
        max-height: min(760px, 86dvh);
        min-height: 0;
        overflow: hidden;
        border: 1px solid #b49356;
        border-radius: 6px;
        box-shadow:
          0 24px 80px #000b,
          0 0 0 4px #121a24;
      }
      .command-scrim {
        align-items: center;
        padding: 20px;
      }
      @media (max-width: 599px) {
        .game-hud-block {
          top: 6px;
          left: 6px;
          right: 6px;
        }
        .command-bar-block {
          bottom: 6px;
          width: calc(100% - 12px);
        }
        .arena-stage-area {
          padding-top: 62px;
          padding-bottom: 78px;
        }
        .command-scrim {
          align-items: flex-end;
          padding: 6px;
        }
        .tower-command-dock {
          max-height: min(720px, 90dvh);
        }
      }
      @media (orientation: landscape) and (max-height: 519px) {
        .game-hud-block {
          top: 4px;
          left: 8px;
          right: 8px;
        }
        .command-bar-block {
          bottom: 4px;
        }
        .arena-stage-area {
          padding-top: 52px;
          padding-bottom: 64px;
        }
        .tower-command-dock {
          width: min(760px, 100%);
          height: calc(100dvh - 24px);
          max-height: calc(100dvh - 24px);
        }
        .command-scrim {
          padding: 12px;
        }
      }

      /* Result dialogs */
      .result-body {
        text-align: center;
      }

      .result-emblem {
        display: inline-grid;
        place-items: center;
        width: 64px;
        height: 64px;
        margin-bottom: var(--space-2);
        border-radius: 50%;
        color: var(--tone);
        background: color-mix(in srgb, var(--tone) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--tone) 45%, transparent);
      }

      .result-sheet.defeat {
        --tone: var(--color-error);
      }

      .result-sheet.victory {
        --tone: var(--color-gold);
      }

      .result-sheet .cw-eyebrow {
        color: var(--tone);
      }

      .result-title {
        font-size: var(--font-size-2xl);
      }

      .result-sub {
        margin: var(--space-2) 0 var(--space-4);
        font-size: var(--font-size-sm);
      }

      .result-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2);
        margin: 0 0 var(--space-4);

        div {
          padding: var(--space-2);
          border-radius: var(--radius-md);
          background: rgba(148, 163, 184, 0.06);
          border: 1px solid var(--border-subtle);
        }

        dt {
          font-size: var(--font-size-2xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }

        dd {
          margin: 0;
          font-family: var(--font-tactical);
          font-size: var(--font-size-xl);
          font-weight: 700;
        }

        .rank {
          color: var(--color-gold);
        }
      }

      .score-breakdown {
        list-style: none;
        margin: 0 0 var(--space-4);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background: rgba(245, 196, 81, 0.05);
        border: 1px solid rgba(245, 196, 81, 0.2);
        text-align: left;

        li {
          display: flex;
          justify-content: space-between;
          gap: var(--space-2);
          padding: 3px 0;
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
        }

        b {
          font-family: var(--font-tactical);
          color: var(--color-gold);
        }
      }

      .epilogue {
        display: flex;
        gap: var(--space-3);
        margin: 0;
        padding: var(--space-3);
        border-radius: var(--radius-md);
        background: rgba(56, 189, 248, 0.05);
        border-left: 3px solid var(--color-primary);
        text-align: left;

        img {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-sm);
          object-fit: cover;
          flex-shrink: 0;
        }

        blockquote {
          margin: 0;
        }

        p {
          margin: 0 0 4px;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          line-height: 1.45;
        }

        figcaption {
          font-size: var(--font-size-xs);
          color: var(--color-primary);
        }
      }

      .action-grow {
        flex: 1;
      }

      .btn-kbd {
        align-items: center;
        padding: 0 5px;
        border-radius: 5px;
        font-family: var(--font-tactical);
        font-size: 0.6875rem;
        line-height: 18px;
        font-weight: 700;
        color: inherit;
        background: rgba(0, 0, 0, 0.25);
      }

      /* Pause menu */
      .pause-body {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .option-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
      }

      .option-tile {
        flex-direction: column;
        gap: 6px;
        min-height: 76px;
        padding: var(--space-2);
        border-radius: var(--radius-md);
        background: rgba(148, 163, 184, 0.06);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        font-size: var(--font-size-sm);
        font-weight: 600;
        text-align: center;

        app-icon {
          color: var(--color-primary);
        }

        &:hover {
          background: rgba(148, 163, 184, 0.12);
          border-color: var(--border-muted);
        }
      }

      .option-label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin: 0 0 var(--space-2);
        font-family: var(--font-tactical);
        font-size: var(--font-size-2xs);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .stage-buttons-row {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 6px;
      }

      .stage-choice-btn {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: 52px;
        padding: 6px 10px;
        border-radius: var(--radius-md);
        background: rgba(148, 163, 184, 0.05);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        text-align: left;

        &:hover {
          border-color: var(--border-muted);
        }

        &.active {
          border-color: var(--color-primary);
          background: rgba(56, 189, 248, 0.12);
        }
      }

      .stage-name {
        font-size: var(--font-size-sm);
        font-weight: 600;
        line-height: 1.2;
      }

      .stage-diff {
        font-size: var(--font-size-2xs);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
      }

      @media (min-width: 480px) {
        .option-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }
    `,
  ],
})
export class GameComponent implements OnInit, OnDestroy {
  protected readonly game = inject(GameService);
  protected readonly gamepad = inject(GamepadService);
  protected readonly audio = inject(AudioService);
  protected readonly three = inject(ThreeBattlefieldService);
  private readonly document = inject(DOCUMENT);
  protected readonly allMaps = ALL_MAPS;

  public readonly isPauseMenuOpen = this.game.isOptionsMenuOpen;
  /** About Crystal Wardens: credits and a link to the original game. */
  public readonly isAboutOpen = this.game.isAboutModalOpen;
  private sub?: Subscription;

  private static readonly CAMERA_LABELS: Record<CameraPreset, string> = {
    tactics: 'Tactics',
    isometric: 'Corner',
    topdown: 'Overhead',
  };

  protected readonly cameraLabel = computed(
    () => GameComponent.CAMERA_LABELS[this.three.activeCameraMode()],
  );

  public readonly isVantageSelected = computed(() => {
    const tile = this.game.selectedTile();
    if (!tile || !this.game.isCommandMenuOpen()) return false;
    const map = this.game.activeMap();
    const cellType = map.tiles[tile.y]?.[tile.x];
    const hasTower = !!this.game.selectedTower();
    return cellType === 'B' || cellType === 'M' || hasTower;
  });

  constructor() {
    afterRenderEffect(() => {
      this.game.isCommandMenuOpen();
      this.isPauseMenuOpen();
      this.game.isScoutOpen();
      this.game.isBestiaryModalOpen();
      this.game.isCampaignModalOpen();
      this.isAboutOpen();
      this.game.isGameOver();
      this.game.isVictory();
      const dialog = this.activeDialog();
      if (dialog === this.lastDialog) return;
      if (dialog) {
        if (!this.lastDialog) this.returnFocus = this.document.activeElement as HTMLElement;
        (
          dialog.querySelector<HTMLElement>(
            '#deploy-tower-btn:not(:disabled), #upgrade-tower-btn:not(:disabled)',
          ) ??
          dialog.querySelector<HTMLElement>('button:not(:disabled), [href]') ??
          dialog
        ).focus({ preventScroll: true });
      } else {
        const target = this.returnFocus?.isConnected
          ? this.returnFocus
          : this.document.getElementById('battlefield-map');
        target?.focus({ preventScroll: true });
      }
      this.lastDialog = dialog;
    });
    // Lets global styles reveal controller prompts only while a pad is in use
    effect(() => {
      const root = this.document.documentElement;
      if (this.gamepad.lastActiveInput() === 'gamepad') root.dataset['input'] = 'gamepad';
      else delete root.dataset['input'];
    });
  }

  public deselectVantage(): void {
    this.game.isCommandMenuOpen.set(false);
    this.document.getElementById('battlefield-map')?.focus({ preventScroll: true });
  }

  protected onCommandBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.deselectVantage();
  }

  private activeDialog(): HTMLElement | undefined {
    return Array.from(
      this.document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
    ).at(-1);
  }

  private lastDialog?: HTMLElement;
  private returnFocus?: HTMLElement;

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
    delete this.document.documentElement.dataset['input'];
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

    // 2. The About sheet: the controller moves between its link and buttons; nothing reaches
    // the battle behind it
    if (this.isAboutOpen()) {
      if (action === 'cancel' || action === 'toggle-menu') this.isAboutOpen.set(false);
      return;
    }

    // 3. Pause Menu Modal handling
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

    if (
      this.game.isBestiaryModalOpen() ||
      this.game.isCampaignModalOpen() ||
      this.game.isScoutOpen()
    ) {
      if (action === 'cancel' || action === 'toggle-menu') {
        this.game.isBestiaryModalOpen.set(false);
        this.game.isCampaignModalOpen.set(false);
        this.game.isScoutOpen.set(false);
      }
      return;
    }
    if (this.game.isCommandMenuOpen()) {
      if (action === 'cancel' || action === 'toggle-menu') {
        this.deselectVantage();
        return;
      }
      if (action === 'prev-class') {
        this.game.cycleClass('prev');
        return;
      }
      if (action === 'next-class') {
        this.game.cycleClass('next');
        return;
      }
      const tower = this.game.selectedTower();
      if (tower && action === 'start-wave') this.game.sellTower(tower.id);
      if (tower && action === 'toggle-speed') this.game.cycleTargetPriorityForTower(tower.id);
      return;
    }

    // 4. Main Gameplay Actions
    switch (action) {
      case 'toggle-menu':
        this.isPauseMenuOpen.set(true);
        break;

      case 'cycle-camera':
        this.cycleCameraPreset();
        break;

      case 'start-wave':
        if (!this.game.waveActive()) this.game.startNextWave();
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
        this.moveCursorOnScreen(0, -1);
        break;

      case 'cursor-down':
        this.moveCursorOnScreen(0, 1);
        break;

      case 'cursor-left':
        this.moveCursorOnScreen(-1, 0);
        break;

      case 'cursor-right':
        this.moveCursorOnScreen(1, 0);
        break;

      case 'confirm': {
        const tile = this.game.selectedTile() ?? { x: 0, y: 0 };
        if (!this.game.inspectEnemyAt(tile.x, tile.y)) this.game.openTileMenu(tile.x, tile.y);
        break;
      }

      case 'cancel':
        this.game.selectTile(-1, -1);
        break;
    }
  }

  /** D-pad and arrow input follow the screen, even when the board is rotated for portrait. */
  private moveCursorOnScreen(dx: number, dy: number): void {
    const [gx, gy] = this.three.screenDeltaToGrid(dx, dy);
    this.game.moveCursor(gx, gy);
  }

  public cycleCameraPreset(): void {
    const modes: CameraPreset[] = ['tactics', 'isometric', 'topdown'];
    const cur = this.three.activeCameraMode();
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    this.three.setCameraPreset(next);
  }

  protected openFromMenu(target: 'missions' | 'bestiary' | 'about'): void {
    this.isPauseMenuOpen.set(false);
    if (target === 'missions') this.game.toggleCampaignModal();
    else if (target === 'bestiary') this.game.toggleBestiaryModal();
    else this.isAboutOpen.set(true);
  }

  protected onPauseBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.isPauseMenuOpen.set(false);
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
    const dialog = this.activeDialog();
    if (dialog && e.key === 'Tab') {
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'),
      ).filter((el) => el.getClientRects().length > 0 && !el.closest('[inert], [hidden]'));
      const first = controls[0],
        last = controls.at(-1);
      if (
        e.shiftKey &&
        (this.document.activeElement === first || !dialog.contains(this.document.activeElement))
      ) {
        last?.focus();
        e.preventDefault();
      } else if (
        !e.shiftKey &&
        (this.document.activeElement === last || !dialog.contains(this.document.activeElement))
      ) {
        first?.focus();
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (this.isAboutOpen()) this.isAboutOpen.set(false);
      else if (this.game.isBestiaryModalOpen()) this.game.isBestiaryModalOpen.set(false);
      else if (this.game.isCampaignModalOpen()) this.game.isCampaignModalOpen.set(false);
      else if (this.game.isScoutOpen()) this.game.isScoutOpen.set(false);
      else if (this.game.isCommandMenuOpen()) this.deselectVantage();
      else this.isPauseMenuOpen.set(!this.isPauseMenuOpen());
      e.preventDefault();
      return;
    }
    if (dialog) {
      if (this.game.isCommandMenuOpen()) {
        if (e.key === '[' || e.key === ']') this.game.cycleClass(e.key === '[' ? 'prev' : 'next');
        const tower = this.game.selectedTower();
        if (tower && e.key.toLowerCase() === 'x') this.game.sellTower(tower.id);
        if (tower && e.key.toLowerCase() === 'y') this.game.cycleTargetPriorityForTower(tower.id);
      }
      return;
    }
    if (e.key === 'e' || e.key === 'E') {
      const mob = this.game.mobs().find((m) => !m.isDead && !m.hasEscaped);
      if (mob) this.game.selectMob(mob.id);
      return;
    }

    if (e.key === 'c' || e.key === 'C') {
      this.cycleCameraPreset();
      return;
    }

    if (e.key === 'v' || e.key === 'V') {
      this.three.toggleLook();
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
      if (!this.game.waveActive()) this.game.startNextWave();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      if (this.game.waveActive() && this.game.canRushWave()) {
        this.game.rushWave();
      }
      return;
    }

    if (e.key === 'y' || e.key === 'Y') {
      this.game.cycleSpeed();
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
      const tile = this.game.selectedTile();
      if (tile) this.game.openTileMenu(tile.x, tile.y);
      return;
    }

    if (e.key === ' ' || e.key === 'Spacebar') {
      if (this.game.isPaused()) {
        this.game.togglePause();
        e.preventDefault();
      } else if (!this.game.waveActive()) {
        this.game.startNextWave();
        e.preventDefault();
      } else {
        this.game.togglePause();
        e.preventDefault();
      }
    }
  };

  protected restartGame(): void {
    this.game.loadMission(this.game.activeMission());
  }

  protected nextStage(): void {
    const all = this.game.campaign.missions();
    const curId = this.game.activeMission().id;
    const curIdx = all.findIndex((m) => m.id === curId);
    const nextMission = all[(curIdx + 1) % all.length];
    this.game.loadMission(nextMission);
  }

  protected getRank(): string {
    const crystals = this.game.crystals();
    if (crystals === 20) return 'S-RANK PERFECT';
    if (crystals >= 15) return 'A-RANK';
    if (crystals >= 10) return 'B-RANK';
    return 'C-RANK';
  }
}
