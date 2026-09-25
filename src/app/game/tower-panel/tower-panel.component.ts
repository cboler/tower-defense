import { Component, computed, inject, output } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import {
  TOWER_CLASSES,
  TargetPriority,
  TowerClassDefinition,
  TowerClassId,
  TowerInstance,
} from '../../core/models/tower.model';

@Component({
  selector: 'app-tower-panel',
  standalone: true,
  imports: [],
  template: `
    <aside class="tower-command-panel" role="region" aria-label="Defenders & Upgrades Command Dock">
      <!-- Drawer Handle Bar for Mobile Touch Affordance -->
      <div class="drawer-handle-bar" aria-hidden="true">
        <span class="drawer-handle"></span>
      </div>

      <!-- Panel Header Bar with Contextual Info & Close Action -->
      <div class="panel-header-bar">
        <div class="header-title-wrap">
          <span class="panel-badge">
            @if (game.selectedTower()) {
              DEFENDER DOSSIER
            } @else if (game.selectedTile(); as tile) {
              @if (isBuildTile(tile)) {
                VANTAGE PLATFORM ({{ tile.x }}, {{ tile.y }})
              } @else if (isMazeTile(tile)) {
                AETHER MAZE SLOT ({{ tile.x }}, {{ tile.y }})
              } @else {
                TACTICAL TILE
              }
            } @else {
              DEFENDER COMMAND
            }
          </span>
          <h3 class="panel-heading">
            @if (game.selectedTower(); as tower) {
              {{ getDef(tower.classId).name }} (Lv.{{ tower.level }})
            } @else if (game.selectedTile(); as tile) {
              @if (isBuildTile(tile)) {
                Deploy {{ activeClassDef().name }}
              } @else if (isMazeTile(tile)) {
                Erect Aether Barricade
              } @else {
                Field Vantage Point
              }
            } @else {
              Recruit Defender
            }
          </h3>
        </div>

        <button
          type="button"
          class="panel-close-btn"
          id="panel-close-btn"
          (click)="onClose()"
          title="Deselect / Close Command Panel [B]"
          aria-label="Close command panel"
        >
          <span class="close-icon" aria-hidden="true">✕</span>
          <span class="gamepad-hint" aria-hidden="true">[B]</span>
        </button>
      </div>

      <!-- 1. Class Deck / Dock for Recruitment -->
      <section class="class-deck-section" aria-label="Recruit Fantasy Class">
        <div class="deck-header">
          <span class="section-title">RECRUIT DEFENDER</span>
          <span class="deck-hint">LB / RB to cycle • 1-9 to select</span>
        </div>

        <div class="class-cards-scroll">
          @for (c of classRoster; track c.id) {
            <button
              type="button"
              class="class-card"
              [class.is-active]="game.selectedClassId() === c.id"
              [class.is-affordable]="game.gold() >= c.cost"
              (click)="game.setSelectedClass(c.id)"
              [title]="c.name + ' - ' + c.description"
              [attr.aria-label]="'Recruit ' + c.name"
            >
              <div class="card-badge" [style.background-color]="c.color">
                <span class="badge-role">{{ c.badge }}</span>
              </div>
              <div class="card-portrait-wrap">
                @if (c.id === 'barricade') {
                  <span class="card-icon" aria-hidden="true">🛡️</span>
                } @else {
                  <img
                    [src]="'assets/portraits/' + c.id + '.png'"
                    [alt]="c.name"
                    class="card-portrait-img"
                    loading="lazy"
                  />
                }
              </div>
              <span class="card-name">{{ c.name }}</span>
              <div class="card-cost" [class.unaffordable]="game.gold() < c.cost">
                <span class="gold-icon" aria-hidden="true">🪙</span>
                <span class="cost-num">{{ c.cost }}G</span>
              </div>
            </button>
          }
        </div>
      </section>

      <!-- 2. Contextual Inspector / Dossier -->
      <section class="inspector-section" aria-label="Selected Tile & Upgrade Dossier">
        @if (game.selectedTower(); as tower) {
          <!-- Tower Inspection & Upgrade Dossier -->
          <div class="tower-dossier">
            <div class="dossier-main">
              <div class="dossier-avatar" [style.border-color]="getDef(tower.classId).color">
                @if (tower.classId === 'barricade') {
                  <span class="avatar-icon">🛡️</span>
                } @else {
                  <img
                    [src]="'assets/portraits/' + tower.classId + '.png'"
                    [alt]="getDef(tower.classId).name"
                    class="dossier-portrait-img"
                  />
                }
                <span class="avatar-level">Lv.{{ tower.level }}</span>
              </div>

              <div class="dossier-details">
                <div class="name-row">
                  <h3 class="tower-title">{{ getDef(tower.classId).name }}</h3>
                  <span class="level-title">{{ getCurLevel(tower).title }}</span>
                </div>
                <p class="special-perk">{{ getCurLevel(tower).specialDescription }}</p>

                <!-- Stats Grid -->
                <div class="stats-matrix">
                  <div class="stat-cell">
                    <span class="stat-lbl">Damage</span>
                    <span class="stat-val">{{ getCurLevel(tower).damage }}</span>
                  </div>
                  <div class="stat-cell">
                    <span class="stat-lbl">Range</span>
                    <span class="stat-val">{{ getCurLevel(tower).range }} tiles</span>
                  </div>
                  <div class="stat-cell">
                    <span class="stat-lbl">Cadence</span>
                    <span class="stat-val">{{ getCurLevel(tower).cadence }}s</span>
                  </div>
                  <div class="stat-cell">
                    <span class="stat-lbl">Kills</span>
                    <span class="stat-val">{{ tower.kills }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Priority Target Selector (Not applicable to barricade/oracle) -->
            @if (tower.classId !== 'barricade' && tower.classId !== 'oracle') {
              <div class="priority-selector">
                <span class="priority-label">Priority:</span>
                <div class="priority-buttons">
                  @for (p of priorities; track p) {
                    <button
                      type="button"
                      class="priority-btn"
                      [class.active]="tower.targetPriority === p"
                      (click)="game.setTargetPriority(tower.id, p)"
                    >
                      {{ p }}
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Action Buttons: Upgrade & Sell -->
            <div class="dossier-actions">
              @if (hasNextLevel(tower)) {
                <button
                  type="button"
                  class="action-btn upgrade-btn"
                  id="upgrade-tower-btn"
                  [disabled]="game.gold() < getNextLevel(tower)!.upgradeCost"
                  (click)="game.upgradeTower(tower.id)"
                >
                  <span class="btn-text">
                    ⬆️ Upgrade to Lv.{{ tower.level + 1 }} ({{ getNextLevel(tower)!.upgradeCost }}G)
                  </span>
                  <span class="gamepad-hint" aria-hidden="true">[A]</span>
                </button>
              } @else if (tower.classId !== 'barricade') {
                <div class="max-level-badge">★ MASTER RANK REACHED ★</div>
              }

              <button
                type="button"
                class="action-btn sell-btn"
                id="sell-tower-btn"
                (click)="game.sellTower(tower.id)"
              >
                <span>💰 Dismiss (+{{ getRefund(tower) }}G)</span>
              </button>
            </div>
          </div>
        } @else if (game.selectedTile(); as tile) {
          <!-- Empty Tile Selected -> Quick Placement Option -->
          <div class="tile-empty-dossier">
            <div class="tile-info">
              <span class="tile-prompt-icon">📍</span>
              <div class="tile-prompt-text">
                <h4>{{ getTileName(tile) }}</h4>
                <p>{{ getTileDescription(tile) }}</p>
              </div>
            </div>

            <div class="tile-actions">
              @if (isBuildTile(tile)) {
                <button
                  type="button"
                  class="action-btn deploy-btn"
                  id="deploy-tower-btn"
                  [disabled]="game.gold() < activeClassDef().cost"
                  (click)="game.placeTower(tile.x, tile.y, game.selectedClassId())"
                >
                  <span>Deploy {{ activeClassDef().name }} ({{ activeClassDef().cost }}G)</span>
                  <span class="gamepad-hint" aria-hidden="true">[A]</span>
                </button>
              } @else if (isMazeTile(tile)) {
                <button
                  type="button"
                  class="action-btn deploy-btn maze-deploy"
                  id="deploy-barricade-btn"
                  [disabled]="game.gold() < 30"
                  (click)="game.placeTower(tile.x, tile.y, 'barricade')"
                >
                  <span>🛡️ Erect Aether Barricade (30G)</span>
                  <span class="gamepad-hint" aria-hidden="true">[A]</span>
                </button>
              }
            </div>
          </div>
        } @else {
          <!-- Default hint when no tile selected -->
          <div class="panel-idle-hint">
            <span class="hint-icon" aria-hidden="true">💡</span>
            <div class="hint-body">
              <p class="hint-title">Select a Vantage Point on the Map</p>
              <p class="hint-sub">
                Click any tile or navigate with controller D-Pad to recruit champions, erect maze
                barricades, or inspect upgrades.
              </p>
            </div>
          </div>
        }
      </section>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .tower-command-panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: linear-gradient(180deg, #111827 0%, #0c1322 100%);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      }

      .drawer-handle-bar {
        display: none;
        justify-content: center;
        padding: 2px 0 6px;
      }

      .drawer-handle {
        width: 36px;
        height: 4px;
        background: rgba(255, 255, 255, 0.25);
        border-radius: 9999px;
      }

      .panel-header-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: var(--space-2);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .header-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .panel-badge {
        font-family: var(--font-tactical);
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--color-primary);
      }

      .panel-heading {
        margin: 0;
        font-family: var(--font-display);
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .panel-close-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: var(--radius-sm);
        color: #cbd5e1;
        cursor: pointer;
        font-size: 0.75rem;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #f87171;
          color: #f87171;
        }
      }

      /* Class Deck */
      .deck-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-2);
      }

      .section-title {
        font-family: var(--font-mono);
        font-size: var(--font-size-xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--text-muted);
      }

      .deck-hint {
        font-size: 0.7rem;
        color: var(--color-primary);
        font-family: var(--font-mono);
      }

      .class-cards-scroll {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
        gap: var(--space-2);
      }

      .class-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-2);
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(51, 65, 85, 0.8);
          border-color: var(--border-accent);
          transform: translateY(-2px);
        }

        &.is-active {
          border-color: var(--color-primary);
          background: rgba(56, 189, 248, 0.12);
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.4);
        }

        &:not(.is-affordable) {
          opacity: 0.55;
        }
      }

      .card-badge {
        position: absolute;
        top: 3px;
        right: 3px;
        padding: 1px 4px;
        border-radius: var(--radius-sm);
        font-size: 0.55rem;
        font-weight: 700;
        color: #0f172a;
        line-height: 1;
        z-index: 2;
      }

      .card-portrait-wrap {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 4px 0 2px 0;
        border-radius: 8px;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%);

        .card-portrait-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 6px;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
        }

        .card-icon {
          font-size: 1.6rem;
        }
      }

      .card-name {
        font-size: 0.72rem;
        font-weight: 600;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 85px;
      }

      .card-cost {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-family: var(--font-mono);
        font-size: 0.7rem;
        font-weight: 700;
        color: #fde047;
        margin-top: 2px;

        &.unaffordable {
          color: #f87171;
        }
      }

      /* Inspector Section */
      .inspector-section {
        border-top: 1px solid var(--border-subtle);
        padding-top: var(--space-3);
      }

      .tower-dossier {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .dossier-main {
        display: flex;
        gap: var(--space-3);
      }

      .dossier-avatar {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        background: #111827;
        border: 2px solid;
        border-radius: var(--radius-md);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        overflow: hidden;

        .dossier-portrait-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-icon {
          font-size: 2rem;
        }

        .avatar-level {
          position: absolute;
          bottom: 2px;
          right: 2px;
          background: rgba(2, 132, 199, 0.9);
          border: 1px solid #38bdf8;
          border-radius: 4px;
          padding: 1px 4px;
          font-family: var(--font-mono);
          font-size: 0.62rem;
          font-weight: 800;
          color: #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }
      }

      .dossier-details {
        flex: 1;
      }

      .name-row {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }

      .tower-title {
        font-size: var(--font-size-base);
        font-weight: 700;
        margin: 0;
      }

      .level-title {
        font-size: var(--font-size-xs);
        color: #38bdf8;
        font-weight: 600;
      }

      .special-perk {
        font-size: 0.78rem;
        color: var(--text-secondary);
        margin: 2px 0 6px 0;
      }

      .stats-matrix {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-1);
        background: rgba(15, 23, 42, 0.6);
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-subtle);
      }

      .stat-cell {
        display: flex;
        flex-direction: column;
      }

      .stat-lbl {
        font-size: 0.6rem;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .stat-val {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      /* Priority Selector */
      .priority-selector {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--font-size-xs);
      }

      .priority-label {
        color: var(--text-secondary);
      }

      .priority-buttons {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .priority-btn {
        padding: 2px 6px;
        background: #1e293b;
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        font-size: 0.68rem;
        text-transform: capitalize;
        cursor: pointer;

        &.active {
          background: #0284c7;
          border-color: #38bdf8;
          color: #ffffff;
          font-weight: 600;
        }
      }

      /* Dossier Actions */
      .dossier-actions {
        display: flex;
        gap: var(--space-2);
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-md);
        font-weight: 700;
        font-size: var(--font-size-sm);
        cursor: pointer;
        border: none;
        transition: all 0.15s ease;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .upgrade-btn {
        flex: 2;
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);

        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.5);
        }
      }

      .sell-btn {
        flex: 1;
        background: #334155;
        color: #f1f5f9;
        border: 1px solid var(--border-muted);

        &:hover {
          background: #475569;
        }
      }

      .max-level-badge {
        flex: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(56, 189, 248, 0.15);
        border: 1px solid #38bdf8;
        border-radius: var(--radius-md);
        color: #38bdf8;
        font-family: var(--font-mono);
        font-size: var(--font-size-xs);
        font-weight: 700;
        padding: var(--space-2);
      }

      /* Tile Empty Dossier */
      .tile-empty-dossier {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .tile-info {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .tile-prompt-icon {
        font-size: 1.5rem;
      }

      .tile-prompt-text {
        h4 {
          margin: 0;
          font-size: var(--font-size-base);
        }
        p {
          margin: 0;
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
        }
      }

      .deploy-btn {
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);

        &.maze-deploy {
          background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
        }
      }

      .gamepad-hint {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        background: rgba(0, 0, 0, 0.35);
        padding: 1px 5px;
        border-radius: var(--radius-sm);
      }

      /* Idle Hint */
      .panel-idle-hint {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2);
        color: var(--text-muted);

        .hint-icon {
          font-size: 1.4rem;
        }
        .hint-title {
          margin: 0;
          font-weight: 600;
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
        }
        .hint-sub {
          margin: 2px 0 0 0;
          font-size: var(--font-size-xs);
        }
      }

      /* Mobile First (<= 767px, Pixel 9 Pro) */
      @media (max-width: 767px) {
        .drawer-handle-bar {
          display: flex;
        }

        .tower-command-panel {
          padding: 6px 12px 14px;
          gap: 8px;
          max-height: 48dvh;
          overflow-y: auto;
          background: rgba(11, 18, 33, 0.96);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 2px solid var(--color-primary);
          border-radius: 18px 18px 0 0;
          box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.85);
        }

        .class-cards-scroll {
          display: flex;
          overflow-x: auto;
          gap: 6px;
          padding-bottom: 4px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }

        .class-card {
          flex: 0 0 70px;
          scroll-snap-align: start;
          padding: 4px 2px;
        }

        .card-portrait-wrap {
          width: 36px;
          height: 36px;
        }

        .card-name {
          font-size: 0.65rem;
          max-width: 66px;
        }

        .card-cost {
          font-size: 0.65rem;
        }

        .stats-matrix {
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 4px !important;
        }

        .stat-cell {
          padding: 4px 2px !important;
        }

        .stat-val {
          font-size: 0.78rem !important;
        }

        .dossier-actions {
          flex-direction: row !important;
          gap: 6px !important;
        }

        .action-btn {
          min-height: 42px !important;
          padding: 8px 10px !important;
          font-size: 0.78rem !important;
        }
      }

      /* Tablet (768px - 1024px) */
      @media (min-width: 768px) and (max-width: 1024px) {
        .tower-command-panel {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 12px;
          padding: 10px 14px;
          max-height: 250px;
          overflow-y: auto;
        }

        .drawer-handle-bar {
          display: none;
        }

        .panel-header-bar {
          grid-column: 1 / -1;
        }

        .class-cards-scroll {
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }

        .inspector-section {
          border-top: none;
          border-left: 1px solid var(--border-subtle);
          padding-top: 0;
          padding-left: 12px;
        }
      }

      /* Desktop (> 1024px) */
      @media (min-width: 1025px) {
        .tower-command-panel {
          height: 100%;
          max-height: 100%;
          overflow-y: auto;
          padding: 14px;
          gap: 12px;
        }

        .drawer-handle-bar {
          display: none;
        }

        .class-cards-scroll {
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }
      }
    `,
  ],
})
export class TowerPanelComponent {
  public readonly closePanel = output<void>();
  protected readonly game = inject(GameService);
  protected readonly classRoster: TowerClassDefinition[] = Object.values(TOWER_CLASSES);

  public onClose(): void {
    this.closePanel.emit();
    this.game.selectTile(-1, -1);
  }
  protected readonly priorities: TargetPriority[] = [
    'first',
    'last',
    'strongest',
    'weakest',
    'closest',
    'flying',
  ];

  protected readonly activeClassDef = computed(() => {
    return TOWER_CLASSES[this.game.selectedClassId()];
  });

  protected getDef(classId: TowerClassId): TowerClassDefinition {
    return TOWER_CLASSES[classId];
  }

  protected getCurLevel(tower: TowerInstance) {
    const def = TOWER_CLASSES[tower.classId];
    return def.levels[tower.level - 1];
  }

  protected hasNextLevel(tower: TowerInstance): boolean {
    const def = TOWER_CLASSES[tower.classId];
    return tower.level < def.levels.length;
  }

  protected getNextLevel(tower: TowerInstance) {
    const def = TOWER_CLASSES[tower.classId];
    return tower.level < def.levels.length ? def.levels[tower.level] : null;
  }

  protected getRefund(tower: TowerInstance): number {
    return Math.floor(tower.totalInvested * 0.7);
  }

  protected isBuildTile(tile: { x: number; y: number }): boolean {
    return this.game.activeMap().tiles[tile.y]?.[tile.x] === 'B';
  }

  protected isMazeTile(tile: { x: number; y: number }): boolean {
    return this.game.activeMap().tiles[tile.y]?.[tile.x] === 'M';
  }

  protected getTileName(tile: { x: number; y: number }): string {
    const code = this.game.activeMap().tiles[tile.y]?.[tile.x];
    if (code === 'B') return `Vantage Platform (${tile.x}, ${tile.y})`;
    if (code === 'M') return `Maze Slot (${tile.x}, ${tile.y})`;
    if (code === 'P') return `Monster Pathway (${tile.x}, ${tile.y})`;
    if (code === 'S') return `Spawn Portal (${tile.x}, ${tile.y})`;
    if (code === 'C') return `Crystal Sanctuary (${tile.x}, ${tile.y})`;
    return `Chasm (${tile.x}, ${tile.y})`;
  }

  protected getTileDescription(tile: { x: number; y: number }): string {
    const code = this.game.activeMap().tiles[tile.y]?.[tile.x];
    if (code === 'B') return 'Clear high-ground vantage. Ready for champion deployment.';
    if (code === 'M') return 'Choke-point corridor. Erect an Aether Barricade to weave monsters.';
    if (code === 'P') return 'Monsters tread here. Defenders cannot be placed on active road.';
    return 'Impassable terrain.';
  }
}
