import { Component, computed, inject, output, signal } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import {
  ADVANCED_TOWER_CLASSES,
  BASE_TOWER_CLASSES,
  JOB_UNLOCK_RULES,
  JobUnlockRule,
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

      <!-- Scrollable Middle Section (Zero-Friction Scroll Area) -->
      <div class="panel-scroll-content">
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
                  @if (tower.classId === 'rogue') {
                    <div class="stat-cell">
                      <span class="stat-lbl">Plunder</span>
                      <span class="stat-val highlight-gold"
                        >x{{ getCurLevel(tower).killGoldMultiplier ?? 1.5 }}</span
                      >
                    </div>
                    <div class="stat-cell">
                      <span class="stat-lbl">Aura</span>
                      <span class="stat-val">{{ getCurLevel(tower).range }} tiles</span>
                    </div>
                    <div class="stat-cell">
                      <span class="stat-lbl">Pickpocket</span>
                      <span class="stat-val">+{{ getCurLevel(tower).pickpocketGold ?? 2 }}G</span>
                    </div>
                    <div class="stat-cell">
                      <span class="stat-lbl">Plundered</span>
                      <span class="stat-val highlight-gold">{{ tower.goldGenerated }}G</span>
                    </div>
                  } @else if (tower.classId === 'oracle') {
                    <div class="stat-cell">
                      <span class="stat-lbl">Haste</span>
                      <span class="stat-val"
                        >+{{ round((getCurLevel(tower).buffSpeedPercent ?? 0.25) * 100) }}%</span
                      >
                    </div>
                    <div class="stat-cell">
                      <span class="stat-lbl">Power</span>
                      <span class="stat-val"
                        >+{{ round((getCurLevel(tower).buffDamagePercent ?? 0.15) * 100) }}%</span
                      >
                    </div>
                    <div class="stat-cell">
                      <span class="stat-lbl">Halo</span>
                      <span class="stat-val">{{ getCurLevel(tower).range }} tiles</span>
                    </div>
                    <div class="stat-cell">
                      <span class="stat-lbl">Role</span>
                      <span class="stat-val">Buffer</span>
                    </div>
                  } @else {
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
                  }
                </div>
              </div>
            </div>

            <!-- Priority Target Selector (Not applicable to barricade/oracle/rogue) -->
            @if (
              tower.classId !== 'barricade' &&
              tower.classId !== 'oracle' &&
              tower.classId !== 'rogue'
            ) {
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
            } @else if (tower.classId === 'rogue') {
              <div class="passive-role-pill">
                <span class="role-icon">💰</span>
                <span class="role-desc"
                  >Passive Plunder Aura • Multiplies all Gold earned from enemies slain in
                  radius</span
                >
              </div>
            } @else if (tower.classId === 'oracle') {
              <div class="passive-role-pill">
                <span class="role-icon">✨</span>
                <span class="role-desc"
                  >Passive Haste Halo • Grants nearby towers bonus attack speed & damage</span
                >
              </div>
            }

            <!-- Upgrade Forecast & Stat Differential Preview (Crystal Defenders Inspector) -->
            @if (getNextLevel(tower); as nextLvl) {
              <div class="upgrade-forecast-box">
                <div class="forecast-header">
                  <span class="forecast-badge"
                    >UPGRADE FORECAST (Lv.{{ tower.level }} ➔ Lv.{{ tower.level + 1 }})</span
                  >
                  <span
                    class="forecast-cost"
                    [class.unaffordable]="game.gold() < nextLvl.upgradeCost"
                  >
                    🪙 {{ nextLvl.upgradeCost }}G
                  </span>
                </div>

                <div class="forecast-diff-grid">
                  @if (tower.classId === 'rogue') {
                    <div class="forecast-cell">
                      <span class="cell-label">Plunder</span>
                      <span class="cell-val">
                        x{{ getCurLevel(tower).killGoldMultiplier ?? 1.5 }} ➔
                        <strong class="stat-boost"
                          >x{{ nextLvl.killGoldMultiplier ?? 1.75 }}</strong
                        >
                      </span>
                    </div>
                    <div class="forecast-cell">
                      <span class="cell-label">Pickpocket</span>
                      <span class="cell-val">
                        +{{ getCurLevel(tower).pickpocketGold ?? 2 }}G ➔
                        <strong class="stat-boost">+{{ nextLvl.pickpocketGold ?? 3 }}G</strong>
                      </span>
                    </div>
                    <div class="forecast-cell">
                      <span class="cell-label">Aura Radius</span>
                      <span class="cell-val">
                        {{ getCurLevel(tower).range }} ➔
                        <strong class="stat-boost">{{ nextLvl.range }} tiles</strong>
                      </span>
                    </div>
                  } @else if (tower.classId === 'oracle') {
                    <div class="forecast-cell">
                      <span class="cell-label">Haste Halo</span>
                      <span class="cell-val">
                        +{{ round((getCurLevel(tower).buffSpeedPercent ?? 0.25) * 100) }}% ➔
                        <strong class="stat-boost"
                          >+{{ round((nextLvl.buffSpeedPercent ?? 0.32) * 100) }}%</strong
                        >
                      </span>
                    </div>
                    <div class="forecast-cell">
                      <span class="cell-label">Power Halo</span>
                      <span class="cell-val">
                        +{{ round((getCurLevel(tower).buffDamagePercent ?? 0.15) * 100) }}% ➔
                        <strong class="stat-boost"
                          >+{{ round((nextLvl.buffDamagePercent ?? 0.2) * 100) }}%</strong
                        >
                      </span>
                    </div>
                    <div class="forecast-cell">
                      <span class="cell-label">Halo Radius</span>
                      <span class="cell-val">
                        {{ getCurLevel(tower).range }} ➔
                        <strong class="stat-boost">{{ nextLvl.range }} tiles</strong>
                      </span>
                    </div>
                  } @else {
                    <div class="forecast-cell">
                      <span class="cell-label">Damage</span>
                      <span class="cell-val">
                        {{ getCurLevel(tower).damage }} ➔
                        <strong class="stat-boost"
                          >{{ nextLvl.damage }} (+{{
                            nextLvl.damage - getCurLevel(tower).damage
                          }})</strong
                        >
                      </span>
                    </div>
                    <div class="forecast-cell">
                      <span class="cell-label">Range</span>
                      <span class="cell-val">
                        {{ getCurLevel(tower).range }} ➔
                        <strong class="stat-boost"
                          >{{ nextLvl.range }} (+{{
                            round((nextLvl.range - getCurLevel(tower).range) * 10) / 10
                          }})</strong
                        >
                      </span>
                    </div>
                    <div class="forecast-cell">
                      <span class="cell-label">Cadence</span>
                      <span class="cell-val">
                        {{ getCurLevel(tower).cadence }}s ➔
                        <strong class="stat-boost"
                          >{{ nextLvl.cadence }}s ({{
                            round((nextLvl.cadence - getCurLevel(tower).cadence) * 100) / 100
                          }}s)</strong
                        >
                      </span>
                    </div>
                  }
                </div>

                <p class="forecast-perk">{{ nextLvl.specialDescription }}</p>
              </div>
            }
          </div>
        } @else {
          <!-- Class Deck Section: Tabbed Roster with Base Wardens & Advanced FFT Jobs -->
          <section class="class-deck-section" aria-label="Recruit Fantasy Class">
            <!-- Segmented Roster Tabs -->
            <div class="deck-tabs-nav" role="tablist" aria-label="Champion Category">
              <button
                type="button"
                role="tab"
                class="deck-tab-btn"
                [class.is-active]="activeTab() === 'base'"
                (click)="activeTab.set('base')"
              >
                <span>⚔️ Base Wardens ({{ baseClasses.length }})</span>
              </button>
              <button
                type="button"
                role="tab"
                class="deck-tab-btn"
                [class.is-active]="activeTab() === 'advanced'"
                (click)="activeTab.set('advanced')"
              >
                <span>✨ Advanced Jobs ({{ advancedClasses.length }})</span>
                @if (unlockedAdvancedCount() > 0) {
                  <span class="unlocked-counter-pill">{{ unlockedAdvancedCount() }} Unlocked</span>
                }
              </button>
            </div>

            <div class="deck-meta-bar">
              <span class="section-title">
                {{ activeTab() === 'base' ? 'CHAMPION RECRUITMENT' : 'ADVANCED HYBRID AWAKENINGS' }}
              </span>
              <span class="deck-hint">Click twice or press [A] to deploy</span>
            </div>

            <!-- Class Cards Grid -->
            <div class="class-cards-scroll">
              @for (c of displayedClasses(); track c.id) {
                <button
                  type="button"
                  class="class-card"
                  [class.is-active]="game.selectedClassId() === c.id"
                  [class.is-affordable]="game.gold() >= c.cost"
                  [class.is-locked]="!isClassUnlocked(c.id)"
                  (click)="onClassCardClick(c)"
                  [title]="c.name + ' - ' + c.description"
                  [attr.aria-label]="(isClassUnlocked(c.id) ? 'Recruit ' : 'Locked ') + c.name"
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

                    @if (!isClassUnlocked(c.id)) {
                      <div class="card-locked-veil" aria-hidden="true">
                        <span class="lock-glyph">🔒</span>
                      </div>
                    }
                  </div>

                  <span class="card-name">{{ c.name }}</span>

                  @if (!isClassUnlocked(c.id)) {
                    <div class="card-unlock-pill">
                      <span>LOCKED</span>
                    </div>
                  } @else {
                    <div class="card-cost" [class.unaffordable]="game.gold() < c.cost">
                      <span class="gold-icon" aria-hidden="true">🪙</span>
                      <span class="cost-num">{{ c.cost }}G</span>
                    </div>
                  }
                </button>
              }
            </div>

            <!-- Advanced Job Unlock Codex (FFT PS1 Class Unlock System) -->
            @if (activeTab() === 'advanced') {
              <div class="job-codex-box">
                <div class="codex-header">
                  <span class="codex-badge">TACTICS CLASS AWAKENING SYSTEM</span>
                  <p class="codex-sub">
                    Inspired by Final Fantasy Tactics (PS1): Base champions must attain Veteran Rank
                    (Lv. 2) to awaken advanced hybrid jobs.
                  </p>
                </div>

                <div class="codex-rules-grid">
                  @for (rule of jobUnlockRulesList; track rule.targetClassId) {
                    <div
                      class="codex-rule-card"
                      [class.is-unlocked]="isClassUnlocked(rule.targetClassId)"
                    >
                      <div class="rule-top">
                        <span class="rule-icon">{{ rule.icon }}</span>
                        <div class="rule-title-wrap">
                          <strong class="rule-title">{{ rule.name }}</strong>
                          <span class="rule-badge">{{ rule.badge }}</span>
                        </div>
                        <span
                          class="rule-status-pill"
                          [class.unlocked]="isClassUnlocked(rule.targetClassId)"
                        >
                          {{ isClassUnlocked(rule.targetClassId) ? '✨ UNLOCKED' : '🔒 LOCKED' }}
                        </span>
                      </div>

                      <div class="rule-prereqs-row">
                        @for (req of getRuleProgress(rule); track req.reqName) {
                          <span class="prereq-chip" [class.is-met]="req.met">
                            {{ req.met ? '✔️' : '⏳' }} {{ req.reqName }} Lv.{{ req.neededLevel }}
                            <small class="chip-curr"
                              >({{ req.met ? 'Done' : 'Lv.' + req.currentLevel }})</small
                            >
                          </span>
                        }
                      </div>

                      <p class="rule-lore">{{ rule.lore }}</p>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Tactical Tile Context Prompt -->
            @if (game.selectedTile(); as tile) {
              <div class="tile-context-strip">
                <span class="strip-icon">📍</span>
                <div class="strip-text">
                  <span class="strip-name">{{ getTileName(tile) }}</span>
                  <span class="strip-desc">{{ getTileDescription(tile) }}</span>
                </div>
              </div>
            }
          </section>
        }
      </div>

      <!-- 3. STICKY BOTTOM ACTION DOCK (ALWAYS VISIBLE - NEVER REQUIRES SCROLLING) -->
      <footer class="panel-sticky-actions" aria-label="Action Execution Dock">
        @if (game.selectedTower(); as tower) {
          <!-- Tower Upgrade & Sell Actions -->
          <div class="dock-actions-row">
            @if (hasNextLevel(tower)) {
              <button
                type="button"
                class="dock-action-btn upgrade-cta-btn"
                id="upgrade-tower-btn"
                [disabled]="game.gold() < getNextLevel(tower)!.upgradeCost"
                (click)="game.upgradeTower(tower.id)"
              >
                <div class="cta-left">
                  <span class="cta-icon">⬆️</span>
                  <span class="cta-label">Upgrade to Lv.{{ tower.level + 1 }}</span>
                </div>
                <div class="cta-right">
                  <span class="cta-cost">🪙 {{ getNextLevel(tower)!.upgradeCost }}G</span>
                  <span class="gamepad-pill" aria-hidden="true">[A]</span>
                </div>
              </button>
            } @else if (tower.classId !== 'barricade') {
              <div class="dock-max-pill">★ MASTER RANK REACHED ★</div>
            }

            <button
              type="button"
              class="dock-action-btn dismiss-cta-btn"
              id="sell-tower-btn"
              (click)="game.sellTower(tower.id)"
              title="Dismiss champion from vantage point and recoup 70% gold"
            >
              <span>💰 Dismiss (+{{ getRefund(tower) }}G)</span>
            </button>
          </div>
        } @else if (game.selectedTile(); as tile) {
          <!-- Tile Placement Actions -->
          @if (isBuildTile(tile)) {
            <button
              type="button"
              class="dock-action-btn deploy-cta-btn"
              id="deploy-tower-btn"
              [disabled]="
                game.gold() < activeClassDef().cost || !isClassUnlocked(game.selectedClassId())
              "
              (click)="deploySelectedClass()"
            >
              <div class="cta-left">
                <span class="cta-avatar-icon" [style.background-color]="activeClassDef().color">
                  {{ activeClassDef().icon }}
                </span>
                <div class="cta-details">
                  <span class="cta-title">
                    @if (!isClassUnlocked(game.selectedClassId())) {
                      🔒 {{ activeClassDef().name }} (Locked)
                    } @else {
                      Deploy {{ activeClassDef().name }}
                    }
                  </span>
                  <span class="cta-role">{{ activeClassDef().badge }}</span>
                </div>
              </div>
              <div class="cta-right">
                <span class="cta-cost">🪙 {{ activeClassDef().cost }}G</span>
                <span class="gamepad-pill" aria-hidden="true">[A]</span>
              </div>
            </button>
          } @else if (isMazeTile(tile)) {
            <button
              type="button"
              class="dock-action-btn maze-cta-btn"
              id="deploy-barricade-btn"
              [disabled]="game.gold() < 30"
              (click)="game.placeTower(tile.x, tile.y, 'barricade')"
            >
              <div class="cta-left">
                <span class="cta-icon">🛡️</span>
                <span class="cta-title">Erect Aether Barricade</span>
              </div>
              <div class="cta-right">
                <span class="cta-cost">🪙 30G</span>
                <span class="gamepad-pill" aria-hidden="true">[A]</span>
              </div>
            </button>
          } @else {
            <div class="dock-notice-pill">
              <span class="notice-icon">⚠️</span>
              <span class="notice-text"
                >Monster pathway or chasm. Select a green Vantage Platform on the map to
                deploy.</span
              >
            </div>
          }
        } @else {
          <!-- Idle Prompt -->
          <div class="dock-idle-pill">
            <span class="idle-icon">💡</span>
            <span class="idle-text"
              >Select a Vantage Platform on the map or use D-Pad to deploy
              {{ activeClassDef().name }}</span
            >
          </div>
        }
      </footer>
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
        height: 100%;
        max-height: 100%;
        overflow: hidden; /* Scrollable content inside, header and action dock pinned */
        background: linear-gradient(180deg, #111827 0%, #0c1322 100%);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      }

      .drawer-handle-bar {
        display: none;
        justify-content: center;
        padding: 4px 0;
      }

      .drawer-handle {
        width: 36px;
        height: 4px;
        background: rgba(255, 255, 255, 0.25);
        border-radius: 9999px;
      }

      /* Fixed Header */
      .panel-header-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(15, 23, 42, 0.6);
        flex-shrink: 0;
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

      /* Scrollable Middle Area */
      .panel-scroll-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        scrollbar-width: thin;
        scrollbar-color: rgba(56, 189, 248, 0.3) transparent;

        &::-webkit-scrollbar {
          width: 5px;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.3);
          border-radius: 4px;
        }
      }

      /* Roster Tabs */
      .deck-tabs-nav {
        display: flex;
        gap: 6px;
        background: rgba(15, 23, 42, 0.8);
        padding: 4px;
        border-radius: var(--radius-md);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .deck-tab-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 10px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        font-family: var(--font-tactical);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: all 0.15s ease;

        &.is-active {
          background: rgba(30, 41, 59, 0.9);
          border-color: rgba(56, 189, 248, 0.35);
          color: var(--color-primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        &:hover:not(.is-active) {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.04);
        }
      }

      .unlocked-counter-pill {
        padding: 1px 6px;
        background: #10b981;
        color: #ffffff;
        font-size: 0.62rem;
        font-weight: 800;
        border-radius: 9999px;
      }

      .deck-meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
      }

      .section-title {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--text-muted);
      }

      .deck-hint {
        font-size: 0.68rem;
        color: var(--color-primary);
        font-family: var(--font-mono);
      }

      /* Cards Grid */
      .class-cards-scroll {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      .class-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8px;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
        overflow: hidden;

        &:hover {
          background: rgba(51, 65, 85, 0.8);
          border-color: var(--color-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.2);
        }

        &.is-active {
          border-color: var(--color-primary);
          background: rgba(56, 189, 248, 0.15);
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
        }

        &.is-locked {
          opacity: 0.7;
          border-color: rgba(239, 68, 68, 0.25);
          filter: grayscale(0.35);

          &:hover {
            opacity: 0.95;
            border-color: rgba(239, 68, 68, 0.6);
          }
        }
      }

      .card-badge {
        position: absolute;
        top: 4px;
        left: 4px;
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 0.58rem;
        font-weight: 700;
        text-transform: uppercase;
        color: #000;
        line-height: 1;
        letter-spacing: 0.04em;
        z-index: 2;
      }

      .card-portrait-wrap {
        position: relative;
        width: 58px;
        height: 58px;
        margin: 6px 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      .card-portrait-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .card-icon {
        font-size: 1.8rem;
      }

      .card-locked-veil {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .lock-glyph {
        font-size: 1.4rem;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
      }

      .card-name {
        font-family: var(--font-display);
        font-size: 0.78rem;
        font-weight: 700;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .card-cost {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 700;
        color: #fbbf24;

        &.unaffordable {
          color: #ef4444;
        }
      }

      .card-unlock-pill {
        padding: 1px 6px;
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #f87171;
        font-size: 0.62rem;
        font-weight: 700;
        border-radius: 4px;
      }

      /* Advanced Job Codex */
      .job-codex-box {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: var(--radius-md);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .codex-header {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .codex-badge {
        font-family: var(--font-tactical);
        font-size: 0.68rem;
        font-weight: 800;
        color: #c084fc;
        letter-spacing: 0.05em;
      }

      .codex-sub {
        margin: 0;
        font-size: 0.68rem;
        color: var(--text-muted);
        line-height: 1.3;
      }

      .codex-rules-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .codex-rule-card {
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: var(--radius-sm);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;

        &.is-unlocked {
          border-color: rgba(16, 185, 129, 0.4);
          background: rgba(16, 185, 129, 0.08);
        }
      }

      .rule-top {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rule-icon {
        font-size: 1.1rem;
      }

      .rule-title-wrap {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .rule-title {
        font-size: 0.8rem;
        color: #ffffff;
      }

      .rule-badge {
        font-size: 0.65rem;
        color: var(--text-muted);
      }

      .rule-status-pill {
        font-size: 0.62rem;
        font-weight: 700;
        color: #f87171;
        padding: 2px 6px;
        background: rgba(239, 68, 68, 0.15);
        border-radius: 4px;

        &.unlocked {
          color: #34d399;
          background: rgba(16, 185, 129, 0.2);
        }
      }

      .rule-prereqs-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .prereq-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 6px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        font-size: 0.65rem;
        color: #94a3b8;

        &.is-met {
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.4);
        }

        .chip-curr {
          color: #64748b;
        }
      }

      .rule-lore {
        margin: 0;
        font-size: 0.65rem;
        color: #94a3b8;
        line-height: 1.3;
      }

      /* Context Tile Strip */
      .tile-context-strip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: var(--radius-sm);
      }

      .strip-icon {
        font-size: 1rem;
      }

      .strip-text {
        display: flex;
        flex-direction: column;
      }

      .strip-name {
        font-size: 0.78rem;
        font-weight: 700;
        color: #e2e8f0;
      }

      .strip-desc {
        font-size: 0.68rem;
        color: var(--text-muted);
      }

      /* Tower Dossier */
      .tower-dossier {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .dossier-main {
        display: flex;
        gap: var(--space-3);
        align-items: flex-start;
      }

      .dossier-avatar {
        position: relative;
        width: 64px;
        height: 64px;
        border-radius: var(--radius-md);
        border: 2px solid;
        background: rgba(15, 23, 42, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
      }

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
        bottom: 0;
        right: 0;
        padding: 1px 4px;
        background: rgba(0, 0, 0, 0.8);
        border-top-left-radius: 4px;
        font-family: var(--font-mono);
        font-size: 0.65rem;
        font-weight: 700;
        color: #38bdf8;
      }

      .dossier-details {
        flex: 1;
        min-width: 0;
      }

      .name-row {
        display: flex;
        align-items: baseline;
        gap: 6px;
        flex-wrap: wrap;
      }

      .tower-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 0.95rem;
        color: var(--text-primary);
      }

      .level-title {
        font-size: 0.72rem;
        color: var(--color-primary);
        font-weight: 600;
      }

      .special-perk {
        margin: 3px 0 6px;
        font-size: 0.72rem;
        color: var(--text-muted);
        line-height: 1.3;
      }

      .stats-matrix {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4px;
      }

      .stat-cell {
        display: flex;
        justify-content: space-between;
        padding: 3px 6px;
        background: rgba(15, 23, 42, 0.6);
        border-radius: 3px;
        font-size: 0.7rem;
      }

      .stat-lbl {
        color: var(--text-muted);
      }

      .stat-val {
        font-family: var(--font-mono);
        font-weight: 700;
        color: var(--text-primary);

        &.highlight-gold {
          color: #fbbf24;
        }
      }

      .priority-selector {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px;
        background: rgba(15, 23, 42, 0.6);
        border-radius: var(--radius-sm);
      }

      .priority-label {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .priority-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        flex: 1;
      }

      .priority-btn {
        padding: 2px 7px;
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        color: #cbd5e1;
        font-size: 0.65rem;
        font-weight: 600;
        cursor: pointer;
        text-transform: capitalize;
        transition: all 0.15s ease;

        &:hover {
          border-color: var(--color-primary);
          color: #ffffff;
        }

        &.active {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: #000000;
          font-weight: 700;
        }
      }

      .passive-role-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: rgba(56, 189, 248, 0.1);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: var(--radius-sm);
        font-size: 0.7rem;
        color: #7dd3fc;
      }

      .upgrade-forecast-box {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: var(--radius-md);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .forecast-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .forecast-badge {
        font-family: var(--font-tactical);
        font-size: 0.65rem;
        font-weight: 700;
        color: var(--color-primary);
      }

      .forecast-cost {
        font-family: var(--font-mono);
        font-size: 0.72rem;
        font-weight: 700;
        color: #fbbf24;

        &.unaffordable {
          color: #ef4444;
        }
      }

      .forecast-diff-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
      }

      .forecast-cell {
        display: flex;
        flex-direction: column;
        padding: 3px;
        background: rgba(30, 41, 59, 0.4);
        border-radius: 3px;
        font-size: 0.65rem;
      }

      .cell-label {
        color: var(--text-muted);
      }

      .stat-boost {
        color: #34d399;
      }

      .forecast-perk {
        margin: 0;
        font-size: 0.68rem;
        color: #7dd3fc;
      }

      /* 3. STICKY BOTTOM ACTION DOCK */
      .panel-sticky-actions {
        position: sticky;
        bottom: 0;
        z-index: 30;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 14px;
        background: linear-gradient(180deg, rgba(17, 24, 39, 0.96) 0%, rgba(10, 15, 29, 0.99) 100%);
        border-top: 1px solid rgba(56, 189, 248, 0.25);
        box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        flex-shrink: 0;
      }

      .dock-actions-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .dock-action-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 9px 14px;
        border-radius: var(--radius-md);
        font-family: var(--font-display);
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .cta-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cta-avatar-icon {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
      }

      .cta-details {
        display: flex;
        flex-direction: column;
        text-align: left;
      }

      .cta-title {
        font-size: 0.86rem;
        font-weight: 700;
      }

      .cta-role {
        font-size: 0.65rem;
        color: rgba(255, 255, 255, 0.7);
        font-weight: 600;
      }

      .cta-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cta-cost {
        font-family: var(--font-mono);
        font-weight: 800;
        font-size: 0.88rem;
        color: #fde047;
      }

      .gamepad-pill {
        display: inline-flex;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        font-family: var(--font-mono);
        font-size: 0.65rem;
        font-weight: 700;
        color: #ffffff;
      }

      .deploy-cta-btn {
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        border: 1px solid #38bdf8;
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);

        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          box-shadow: 0 6px 20px rgba(14, 165, 233, 0.6);
          transform: translateY(-1px);
        }

        &:disabled {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(255, 255, 255, 0.1);
          color: #64748b;
          cursor: not-allowed;
          box-shadow: none;

          .cta-cost {
            color: #94a3b8;
          }
        }
      }

      .upgrade-cta-btn {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        border: 1px solid #34d399;
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4);

        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
          transform: translateY(-1px);
        }

        &:disabled {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(255, 255, 255, 0.1);
          color: #64748b;
          cursor: not-allowed;
          box-shadow: none;
        }
      }

      .maze-cta-btn {
        background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
        border: 1px solid #a78bfa;
        color: #ffffff;

        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          transform: translateY(-1px);
        }

        &:disabled {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(255, 255, 255, 0.1);
          color: #64748b;
          cursor: not-allowed;
        }
      }

      .dismiss-cta-btn {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #fca5a5;
        font-size: 0.78rem;
        padding: 6px 12px;
        justify-content: center;

        &:hover {
          background: rgba(239, 68, 68, 0.3);
          border-color: #ef4444;
          color: #ffffff;
        }
      }

      .dock-max-pill {
        text-align: center;
        padding: 6px;
        background: rgba(56, 189, 248, 0.1);
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: var(--radius-sm);
        font-family: var(--font-tactical);
        font-size: 0.72rem;
        font-weight: 700;
        color: #38bdf8;
      }

      .dock-notice-pill,
      .dock-idle-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        background: rgba(30, 41, 59, 0.5);
        border-radius: var(--radius-sm);
        font-size: 0.72rem;
        color: var(--text-muted);
      }

      .dock-notice-pill {
        color: #fdba74;
        background: rgba(249, 115, 22, 0.1);
        border: 1px solid rgba(249, 115, 22, 0.25);
      }

      /* Mobile Drawer Media Query */
      @media (max-width: 767px) {
        .drawer-handle-bar {
          display: flex;
        }

        .class-cards-scroll {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
})
export class TowerPanelComponent {
  public readonly closePanel = output<void>();
  protected readonly game = inject(GameService);
  protected readonly round = Math.round;

  protected readonly activeTab = signal<'base' | 'advanced'>('base');
  protected readonly baseClasses = BASE_TOWER_CLASSES;
  protected readonly advancedClasses = ADVANCED_TOWER_CLASSES;
  protected readonly jobUnlockRulesList = Object.values(JOB_UNLOCK_RULES);

  protected readonly displayedClasses = computed(() => {
    return this.activeTab() === 'base' ? this.baseClasses : this.advancedClasses;
  });

  protected readonly unlockedAdvancedCount = computed(() => {
    return this.advancedClasses.filter((c) => this.game.isClassUnlocked(c.id)).length;
  });

  protected readonly activeClassDef = computed(() => {
    return TOWER_CLASSES[this.game.selectedClassId()];
  });

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

  protected isClassUnlocked(classId: TowerClassId): boolean {
    return this.game.isClassUnlocked(classId);
  }

  protected onClassCardClick(c: TowerClassDefinition): void {
    const tile = this.game.selectedTile();
    // Quick deploy if already selected and affordable and build tile
    if (
      this.game.selectedClassId() === c.id &&
      tile &&
      this.isBuildTile(tile) &&
      this.game.gold() >= c.cost &&
      this.isClassUnlocked(c.id)
    ) {
      this.deploySelectedClass();
    } else {
      this.game.setSelectedClass(c.id);
    }
  }

  protected deploySelectedClass(): void {
    const tile = this.game.selectedTile();
    if (!tile || !this.isBuildTile(tile)) return;
    this.game.placeTower(tile.x, tile.y, this.game.selectedClassId());
  }

  protected getRuleProgress(rule: JobUnlockRule) {
    const towers = this.game.towers();
    return rule.prerequisites.map((req) => {
      const highestTower = towers
        .filter((t) => t.classId === req.classId)
        .sort((a, b) => b.level - a.level)[0];
      const currentLevel = highestTower ? highestTower.level : 0;
      const def = TOWER_CLASSES[req.classId];
      return {
        reqName: def.badge,
        neededLevel: req.minLevel,
        currentLevel,
        met: currentLevel >= req.minLevel,
      };
    });
  }

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
