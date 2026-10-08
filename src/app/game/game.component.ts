import {
  Component,
  DOCUMENT,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
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
import { StoryDialogueOverlayComponent } from './story-dialogue-overlay/story-dialogue-overlay.component';

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
    StoryDialogueOverlayComponent,
  ],
  template: `
    <div class="game-view" role="main" aria-label="Crystal Wardens Arena">
      <app-hud class="game-hud-block" (openMenu)="isPauseMenuOpen.set(true)" />

      <div class="arena-stage-area">
        <app-battle-map class="battle-map-stage" />

        <!-- Phones: in-flow drawer that shrinks the map. Landscape / desktop: side panel. -->
        <app-tower-panel
          class="tower-command-dock"
          [class.is-visible]="isVantageSelected()"
          (closePanel)="deselectVantage()"
        />
      </div>

      <app-command-bar class="command-bar-block" />

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
                <h2 id="pause-title" class="cw-title">Menu</h2>
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
                <button type="button" class="option-tile" (click)="audio.toggleMute()">
                  <app-icon [name]="audio.muted() ? 'mute' : 'volume'" />
                  <span>{{ audio.muted() ? 'Sound off' : 'Sound on' }}</span>
                  <span class="btn-kbd">Y</span>
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

      /* Mobile first: top bar · battlefield (+ drawer) · command bar */
      .game-view {
        position: relative;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        grid-template-columns: minmax(0, 1fr);
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .arena-stage-area {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
      }

      .battle-map-stage {
        flex: 1;
        min-height: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      /* The drawer lives in the layout flow, so the map shrinks (and the camera
         re-fits) instead of being covered by the panel. */
      .tower-command-dock {
        flex-shrink: 0;
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s var(--ease-out);

        &.is-visible {
          max-height: min(52%, 420px);
          min-height: 0;
        }
      }

      /* Landscape phones, tablets in landscape, desktop: persistent side panel */
      @media (orientation: landscape) and (min-width: 640px) {
        .arena-stage-area {
          flex-direction: row;
        }

        .tower-command-dock,
        .tower-command-dock.is-visible {
          width: 300px;
          max-height: none;
          height: 100%;
          transition: none;
        }
      }

      @media (orientation: landscape) and (min-width: 1100px) {
        .tower-command-dock,
        .tower-command-dock.is-visible {
          width: 360px;
        }
      }

      /* Tall tablets in portrait: the drawer can afford more height */
      @media (orientation: portrait) and (min-width: 600px) {
        .tower-command-dock.is-visible {
          max-height: min(44%, 460px);
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

  public readonly isPauseMenuOpen = signal<boolean>(false);
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
    if (!tile) return false;
    const map = this.game.activeMap();
    const cellType = map.tiles[tile.y]?.[tile.x];
    const hasTower = !!this.game.selectedTower();
    return cellType === 'B' || cellType === 'M' || hasTower;
  });

  constructor() {
    // Lets global styles reveal controller prompts only while a pad is in use
    effect(() => {
      const root = this.document.documentElement;
      if (this.gamepad.lastActiveInput() === 'gamepad') root.dataset['input'] = 'gamepad';
      else delete root.dataset['input'];
    });
  }

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
        } else if (!this.game.waveActive()) {
          // Otherwise [X] calls the next wave when not in combat!
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

  protected openFromMenu(target: 'missions' | 'bestiary'): void {
    this.isPauseMenuOpen.set(false);
    if (target === 'missions') this.game.toggleCampaignModal();
    else this.game.toggleBestiaryModal();
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
    if (e.key === 'Escape') {
      // Escape closes whichever overlay is on top; it only opens the menu from the battlefield
      const overlayOpen =
        this.game.isScoutOpen() ||
        this.game.isCampaignModalOpen() ||
        this.game.isBestiaryModalOpen();
      if (!overlayOpen) this.isPauseMenuOpen.set(!this.isPauseMenuOpen());
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
      else if (!this.game.waveActive()) this.game.startNextWave();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      if (this.game.waveActive() && this.game.canRushWave()) {
        this.game.rushWave();
      }
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
