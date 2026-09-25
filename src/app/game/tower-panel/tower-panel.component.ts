import { Component, computed, inject } from '@angular/core';
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
            >
              <div class="card-badge" [style.background-color]="c.color">
                <span class="badge-role">{{ c.badge }}</span>
              </div>
              <span class="card-icon" aria-hidden="true">{{ c.icon }}</span>
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
                <span class="avatar-icon">{{ getDef(tower.classId).icon }}</span>
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
      .tower-command-panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-4);
        background: linear-gradient(180deg, #111827 0%, #0c1322 100%);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
      }

      .card-icon {
        font-size: 1.4rem;
        margin: 4px 0 2px 0;
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
        width: 68px;
        height: 68px;
        background: #1e293b;
        border: 2px solid;
        border-radius: var(--radius-md);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);

        .avatar-icon {
          font-size: 1.8rem;
        }
        .avatar-level {
          position: absolute;
          bottom: 2px;
          font-family: var(--font-mono);
          font-size: 0.65rem;
          font-weight: 800;
          color: #38bdf8;
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
    `,
  ],
})
export class TowerPanelComponent {
  protected readonly game = inject(GameService);
  protected readonly classRoster: TowerClassDefinition[] = Object.values(TOWER_CLASSES);
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
