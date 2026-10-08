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
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-tower-panel',
  standalone: true,
  imports: [IconComponent],
  template: `
    <aside class="tower-command-panel" role="region" aria-label="Defenders & Upgrades Command Dock">
      <div class="drawer-handle-bar" aria-hidden="true">
        <span class="drawer-handle"></span>
      </div>

      <!-- Header: what is selected -->
      <header class="panel-header">
        @if (game.selectedTower(); as tower) {
          <span class="head-avatar" [style.--accent]="getDef(tower.classId).color">
            @if (tower.classId === 'barricade') {
              <app-icon name="shield" [size]="22" />
            } @else {
              <img
                [src]="'assets/portraits/' + tower.classId + '.png'"
                [alt]="getDef(tower.classId).name"
              />
            }
            <span class="head-level">{{ tower.level }}</span>
          </span>
          <div class="head-titles">
            <span class="cw-eyebrow">{{ getCurLevel(tower).title }}</span>
            <h3 class="head-title">{{ getDef(tower.classId).name }}</h3>
          </div>
        } @else {
          <div class="head-titles">
            <span class="cw-eyebrow">{{ eyebrow() }}</span>
            <h3 class="head-title">{{ heading() }}</h3>
          </div>
        }

        <button
          type="button"
          class="cw-icon-btn panel-close-btn"
          id="panel-close-btn"
          (click)="onClose()"
          title="Deselect [B / Esc]"
          aria-label="Close command panel"
        >
          <app-icon name="close" [size]="18" />
        </button>
      </header>

      <!-- Body -->
      <div class="panel-scroll-content">
        @if (game.selectedTower(); as tower) {
          <div class="tower-dossier">
            @if (tower.classId !== 'barricade') {
              <p class="perk">{{ getCurLevel(tower).specialDescription }}</p>

              @let xpNeeded = game.rules.xpToNextLevel(tower);
              <div
                class="xp-track"
                role="progressbar"
                [attr.aria-label]="'Experience toward level ' + (tower.level + 1)"
                aria-valuemin="0"
                [attr.aria-valuemax]="xpNeeded ?? 1"
                [attr.aria-valuenow]="xpNeeded === null ? 1 : round(tower.xp)"
              >
                <div class="xp-head">
                  <span class="xp-lbl">Experience</span>
                  @if (xpNeeded !== null) {
                    <span class="xp-val">{{ round(tower.xp) }} / {{ xpNeeded }}</span>
                  } @else {
                    <span class="xp-val xp-max">Mastered</span>
                  }
                </div>
                <div class="xp-bar">
                  <div
                    class="xp-fill"
                    [style.width.%]="xpNeeded === null ? 100 : (tower.xp / xpNeeded) * 100"
                  ></div>
                </div>
              </div>

              <dl class="stats-matrix">
                @if (tower.classId === 'rogue') {
                  <div class="stat-cell">
                    <dt>Plunder</dt>
                    <dd class="gold">×{{ getCurLevel(tower).killGoldMultiplier ?? 1.5 }}</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Aura</dt>
                    <dd>{{ getCurLevel(tower).range }}</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Pickpocket</dt>
                    <dd>+{{ getCurLevel(tower).pickpocketGold ?? 2 }}G</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Earned</dt>
                    <dd class="gold">{{ tower.goldGenerated }}G</dd>
                  </div>
                } @else if (tower.classId === 'oracle') {
                  <div class="stat-cell">
                    <dt>Haste</dt>
                    <dd>+{{ round((getCurLevel(tower).buffSpeedPercent ?? 0.25) * 100) }}%</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Power</dt>
                    <dd>+{{ round((getCurLevel(tower).buffDamagePercent ?? 0.15) * 100) }}%</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Halo</dt>
                    <dd>{{ getCurLevel(tower).range }}</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Role</dt>
                    <dd>Support</dd>
                  </div>
                } @else {
                  <div class="stat-cell">
                    <dt>Damage</dt>
                    <dd>{{ getCurLevel(tower).damage }}</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Range</dt>
                    <dd>{{ getCurLevel(tower).range }}</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Cadence</dt>
                    <dd>{{ getCurLevel(tower).cadence }}s</dd>
                  </div>
                  <div class="stat-cell">
                    <dt>Kills</dt>
                    <dd>{{ tower.kills }}</dd>
                  </div>
                }
              </dl>
            } @else {
              <p class="perk">
                Blocks the maze slot and forces ground monsters onto a longer route. Flyers ignore
                it.
              </p>
            }

            @if (
              tower.classId !== 'barricade' &&
              tower.classId !== 'oracle' &&
              tower.classId !== 'rogue'
            ) {
              <div class="priority-selector">
                <span class="section-label"> Target priority <span class="key-hint">Y</span> </span>
                <div class="priority-buttons" role="radiogroup" aria-label="Target priority">
                  @for (p of priorities; track p) {
                    <button
                      type="button"
                      class="priority-btn"
                      role="radio"
                      [attr.aria-checked]="tower.targetPriority === p"
                      [class.active]="tower.targetPriority === p"
                      (click)="game.setTargetPriority(tower.id, p)"
                    >
                      {{ p }}
                    </button>
                  }
                </div>
              </div>
            }

            @if (getNextLevel(tower); as nextLvl) {
              <section class="forecast" aria-label="Next level preview">
                <span class="section-label">Next: level {{ tower.level + 1 }}</span>
                <ul class="diff-list">
                  @if (tower.classId === 'rogue') {
                    <li>
                      <span>Plunder</span>
                      <span
                        >×{{ getCurLevel(tower).killGoldMultiplier ?? 1.5 }}
                        <b>→ ×{{ nextLvl.killGoldMultiplier ?? 1.75 }}</b></span
                      >
                    </li>
                    <li>
                      <span>Pickpocket</span>
                      <span
                        >+{{ getCurLevel(tower).pickpocketGold ?? 2 }}G
                        <b>→ +{{ nextLvl.pickpocketGold ?? 3 }}G</b></span
                      >
                    </li>
                    <li>
                      <span>Aura</span>
                      <span
                        >{{ getCurLevel(tower).range }} <b>→ {{ nextLvl.range }}</b></span
                      >
                    </li>
                  } @else if (tower.classId === 'oracle') {
                    <li>
                      <span>Haste</span>
                      <span
                        >+{{ round((getCurLevel(tower).buffSpeedPercent ?? 0.25) * 100) }}%
                        <b>→ +{{ round((nextLvl.buffSpeedPercent ?? 0.32) * 100) }}%</b></span
                      >
                    </li>
                    <li>
                      <span>Power</span>
                      <span
                        >+{{ round((getCurLevel(tower).buffDamagePercent ?? 0.15) * 100) }}%
                        <b>→ +{{ round((nextLvl.buffDamagePercent ?? 0.2) * 100) }}%</b></span
                      >
                    </li>
                    <li>
                      <span>Halo</span>
                      <span
                        >{{ getCurLevel(tower).range }} <b>→ {{ nextLvl.range }}</b></span
                      >
                    </li>
                  } @else {
                    <li>
                      <span>Damage</span>
                      <span
                        >{{ getCurLevel(tower).damage }} <b>→ {{ nextLvl.damage }}</b></span
                      >
                    </li>
                    <li>
                      <span>Range</span>
                      <span
                        >{{ getCurLevel(tower).range }} <b>→ {{ nextLvl.range }}</b></span
                      >
                    </li>
                    <li>
                      <span>Cadence</span>
                      <span
                        >{{ getCurLevel(tower).cadence }}s <b>→ {{ nextLvl.cadence }}s</b></span
                      >
                    </li>
                  }
                </ul>
                <p class="forecast-perk">{{ nextLvl.specialDescription }}</p>
              </section>
            }
          </div>
        } @else if (game.selectedTile() && isMazeTile(game.selectedTile()!)) {
          <div class="maze-brief">
            <span class="maze-icon"><app-icon name="shield" [size]="26" /></span>
            <p>
              Raise an Aether Barricade to bend the ground route through your defenders. At least
              one path to the sanctuary always stays open.
            </p>
          </div>
        } @else {
          <section class="class-deck-section" aria-label="Recruit Fantasy Class">
            <div class="deck-tabs" role="tablist" aria-label="Champion Category">
              <button
                type="button"
                role="tab"
                class="deck-tab"
                [attr.aria-selected]="activeTab() === 'base'"
                [class.is-active]="activeTab() === 'base'"
                (click)="activeTab.set('base')"
              >
                Wardens
              </button>
              <button
                type="button"
                role="tab"
                class="deck-tab"
                [attr.aria-selected]="activeTab() === 'advanced'"
                [class.is-active]="activeTab() === 'advanced'"
                (click)="activeTab.set('advanced')"
              >
                Advanced
                <span class="tab-count"
                  >{{ unlockedAdvancedCount() }}/{{ advancedClasses.length }}</span
                >
              </button>
            </div>

            <div class="class-cards-scroll" role="listbox" aria-label="Choose a defender">
              @for (c of displayedClasses(); track c.id) {
                <button
                  type="button"
                  class="class-card"
                  role="option"
                  [attr.aria-selected]="game.selectedClassId() === c.id"
                  [style.--accent]="c.color"
                  [class.is-active]="game.selectedClassId() === c.id"
                  [class.is-unaffordable]="game.gold() < c.cost"
                  [class.is-locked]="!isClassUnlocked(c.id)"
                  (click)="onClassCardClick(c)"
                  [title]="c.name + ' — ' + c.description"
                  [attr.aria-label]="(isClassUnlocked(c.id) ? 'Recruit ' : 'Locked ') + c.name"
                >
                  <span class="card-portrait">
                    @if (c.id === 'barricade') {
                      <app-icon name="shield" [size]="26" />
                    } @else {
                      <img [src]="'assets/portraits/' + c.id + '.png'" alt="" loading="lazy" />
                    }
                    @if (!isClassUnlocked(c.id)) {
                      <span class="card-lock"><app-icon name="lock" [size]="16" /></span>
                    }
                  </span>
                  <span class="card-name">{{ c.name }}</span>
                  <span class="card-cost">
                    @if (isClassUnlocked(c.id)) {
                      {{ c.cost }}G
                    } @else {
                      Locked
                    }
                  </span>
                </button>
              }
            </div>

            <!-- Selected class summary -->
            @let sel = activeClassDef();
            <div class="class-summary" [style.--accent]="sel.color">
              <div class="summary-top">
                <span class="summary-badge">{{ sel.badge }}</span>
                <span class="summary-targets">
                  @if (sel.targetsGround) {
                    <span>Ground</span>
                  }
                  @if (sel.targetsAir) {
                    <span>Air</span>
                  }
                </span>
              </div>
              <p class="summary-desc">{{ sel.description }}</p>
              @if (sel.id !== 'barricade' && sel.levels[0].damage > 0) {
                <dl class="summary-stats">
                  <div>
                    <dt>Dmg</dt>
                    <dd>{{ sel.levels[0].damage }}</dd>
                  </div>
                  <div>
                    <dt>Range</dt>
                    <dd>{{ sel.levels[0].range }}</dd>
                  </div>
                  <div>
                    <dt>Rate</dt>
                    <dd>{{ sel.levels[0].cadence }}s</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd class="cap">{{ sel.damageType }}</dd>
                  </div>
                </dl>
              }
            </div>

            @if (activeTab() === 'advanced') {
              <details class="job-codex-box">
                <summary>How advanced jobs unlock</summary>
                <p class="codex-sub">
                  Raise base champions to the listed level to awaken a hybrid job.
                </p>
                <ul class="codex-rules">
                  @for (rule of jobUnlockRulesList; track rule.targetClassId) {
                    <li
                      class="codex-rule"
                      [class.is-unlocked]="isClassUnlocked(rule.targetClassId)"
                    >
                      <div class="rule-top">
                        <span class="rule-icon" aria-hidden="true">{{ rule.icon }}</span>
                        <strong class="rule-title">{{ rule.name }}</strong>
                        <span class="rule-status">
                          {{ isClassUnlocked(rule.targetClassId) ? 'Unlocked' : 'Locked' }}
                        </span>
                      </div>
                      <div class="rule-prereqs">
                        @for (req of getRuleProgress(rule); track req.reqName) {
                          <span class="prereq-chip" [class.is-met]="req.met">
                            {{ req.reqName }} Lv.{{ req.neededLevel }}
                            <small>{{ req.met ? '✓' : '(Lv.' + req.currentLevel + ')' }}</small>
                          </span>
                        }
                      </div>
                    </li>
                  }
                </ul>
              </details>
            }
          </section>
        }
      </div>

      <!-- Sticky actions -->
      <footer class="panel-sticky-actions" aria-label="Actions">
        @if (game.selectedTower(); as tower) {
          @if (getNextLevel(tower); as nextLvl) {
            <button
              type="button"
              class="cw-btn gold action-main"
              id="upgrade-tower-btn"
              [disabled]="game.gold() < nextLvl.upgradeCost"
              (click)="game.upgradeTower(tower.id)"
            >
              <app-icon name="upgrade" [size]="18" />
              <span>Upgrade</span>
              <span class="btn-cost">{{ nextLvl.upgradeCost }}G</span>
              <span class="gamepad-pill" aria-hidden="true">A</span>
            </button>
          } @else if (tower.classId !== 'barricade') {
            <div class="max-pill">★ Master rank</div>
          }
          <button
            type="button"
            class="cw-btn danger"
            [class.action-main]="tower.classId === 'barricade'"
            id="sell-tower-btn"
            (click)="game.sellTower(tower.id)"
            title="Dismiss and recoup 70% of gold invested [X]"
          >
            <span>Sell</span>
            <span class="btn-cost">+{{ getRefund(tower) }}G</span>
          </button>
        } @else if (game.selectedTile(); as tile) {
          @if (isBuildTile(tile)) {
            <button
              type="button"
              class="cw-btn primary action-main"
              id="deploy-tower-btn"
              [disabled]="
                game.gold() < activeClassDef().cost || !isClassUnlocked(game.selectedClassId())
              "
              (click)="deploySelectedClass()"
            >
              @if (!isClassUnlocked(game.selectedClassId())) {
                <app-icon name="lock" [size]="16" />
                <span>{{ activeClassDef().name }} is locked</span>
              } @else {
                <span>Deploy {{ activeClassDef().name }}</span>
                <span class="btn-cost">{{ activeClassDef().cost }}G</span>
              }
              <span class="gamepad-pill" aria-hidden="true">A</span>
            </button>
          } @else if (isMazeTile(tile)) {
            <button
              type="button"
              class="cw-btn primary action-main"
              id="deploy-barricade-btn"
              [disabled]="game.gold() < 30"
              (click)="game.placeTower(tile.x, tile.y, 'barricade')"
            >
              <app-icon name="shield" [size]="18" />
              <span>Raise Barricade</span>
              <span class="btn-cost">30G</span>
              <span class="gamepad-pill" aria-hidden="true">A</span>
            </button>
          } @else {
            <p class="dock-hint">{{ getTileDescription(tile) }}</p>
          }
        } @else {
          <p class="dock-hint">Tap a glowing platform on the map to deploy.</p>
        }
      </footer>
    </aside>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .tower-command-panel {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        background: linear-gradient(180deg, var(--bg-surface-elevated), var(--bg-surface) 120px);
        border-top: 1px solid var(--border-muted);
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        box-shadow: var(--shadow-sheet);
        overflow: hidden;
      }

      .drawer-handle-bar {
        display: flex;
        justify-content: center;
        padding-top: 6px;
        flex-shrink: 0;
      }

      .drawer-handle {
        width: 36px;
        height: 4px;
        border-radius: var(--radius-full);
        background: var(--border-muted);
      }

      /* Header */
      .panel-header {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: 6px var(--space-2) 6px var(--space-4);
        flex-shrink: 0;
      }

      .head-avatar {
        position: relative;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: var(--radius-md);
        border: 2px solid var(--accent, var(--border-muted));
        background: #0b1220;
        color: var(--color-primary);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 8px;
        }
      }

      .head-level {
        position: absolute;
        right: -6px;
        bottom: -6px;
        min-width: 20px;
        height: 20px;
        padding: 0 4px;
        display: grid;
        place-items: center;
        border-radius: var(--radius-full);
        font-family: var(--font-tactical);
        font-size: var(--font-size-2xs);
        font-weight: 700;
        color: #1a1204;
        background: var(--color-gold);
        border: 2px solid var(--bg-surface-elevated);
      }

      .head-titles {
        flex: 1;
        min-width: 0;
      }

      .head-title {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Body */
      .panel-scroll-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0 var(--space-4) var(--space-3);
      }

      .section-label {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        font-family: var(--font-tactical);
        font-size: var(--font-size-2xs);
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .key-hint {
        align-items: center;
        padding: 0 4px;
        border-radius: 4px;
        line-height: 16px;
        color: var(--color-primary);
        background: rgba(56, 189, 248, 0.12);
        letter-spacing: 0;
      }

      .perk {
        margin: 0 0 var(--space-3);
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        line-height: 1.45;
      }

      .xp-track {
        margin-bottom: var(--space-3);
      }

      .xp-head {
        display: flex;
        justify-content: space-between;
        font-size: var(--font-size-2xs);
        margin-bottom: 4px;
      }

      .xp-lbl {
        font-family: var(--font-tactical);
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .xp-val {
        font-family: var(--font-tactical);
        font-weight: 700;
        color: var(--color-arcane);
      }

      .xp-max {
        color: var(--color-gold);
      }

      .xp-bar {
        height: 6px;
        border-radius: var(--radius-full);
        background: rgba(148, 163, 184, 0.12);
        overflow: hidden;
      }

      .xp-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #8b5cf6, #c084fc);
        transition: width 0.3s ease;
      }

      .stats-matrix {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin: 0 0 var(--space-3);
      }

      .stat-cell {
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        background: rgba(148, 163, 184, 0.06);
        border: 1px solid var(--border-subtle);

        dt {
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }

        dd {
          margin: 0;
          font-family: var(--font-tactical);
          font-size: var(--font-size-base);
          font-weight: 700;

          &.gold {
            color: var(--color-gold);
          }
        }
      }

      .priority-selector {
        margin-bottom: var(--space-3);
      }

      .priority-buttons {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        margin: 0 calc(var(--space-4) * -1);
        padding: 0 var(--space-4);
      }

      .priority-btn {
        flex-shrink: 0;
        min-height: 36px;
        min-width: 0;
        padding: 0 12px;
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        font-weight: 600;
        text-transform: capitalize;
        color: var(--text-secondary);
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid var(--border-subtle);

        &.active {
          color: #fff;
          background: rgba(56, 189, 248, 0.2);
          border-color: var(--color-primary);
        }
      }

      .forecast {
        padding: var(--space-3);
        border-radius: var(--radius-md);
        background: rgba(245, 196, 81, 0.05);
        border: 1px solid rgba(245, 196, 81, 0.2);
      }

      .diff-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 4px;

        li {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
        }

        span:last-child {
          font-family: var(--font-tactical);
        }

        b {
          color: var(--color-success);
        }
      }

      .forecast-perk {
        margin: var(--space-2) 0 0;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        line-height: 1.4;
      }

      .maze-brief {
        display: flex;
        gap: var(--space-3);
        align-items: flex-start;

        p {
          margin: 0;
          font-size: var(--font-size-sm);
          line-height: 1.5;
        }
      }

      .maze-icon {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: var(--radius-md);
        color: var(--color-primary);
        background: rgba(56, 189, 248, 0.1);
        border: 1px solid rgba(56, 189, 248, 0.3);
      }

      /* Recruit deck */
      .deck-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 3px;
        margin-bottom: var(--space-2);
        border-radius: var(--radius-md);
        background: rgba(148, 163, 184, 0.08);
      }

      .deck-tab {
        gap: 6px;
        min-height: 34px;
        padding: 0 var(--space-2);
        border-radius: 8px;
        font-size: var(--font-size-xs);
        font-weight: 700;
        color: var(--text-secondary);
        background: transparent;

        &.is-active {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        }
      }

      .tab-count {
        font-family: var(--font-tactical);
        font-size: 0.625rem;
        padding: 0 5px;
        border-radius: var(--radius-full);
        color: var(--color-arcane);
        background: rgba(192, 132, 252, 0.14);
      }

      /* Phones: a single swipeable row keeps the map visible */
      .class-cards-scroll {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 76px;
        gap: 6px;
        overflow-x: auto;
        scroll-snap-type: x proximity;
        scroll-padding-inline: var(--space-4);
        scrollbar-width: none;
        margin: 0 calc(var(--space-4) * -1) var(--space-2);
        padding: 2px var(--space-4) 4px;
      }

      .class-card {
        position: relative;
        flex-direction: column;
        gap: 3px;
        min-height: 0;
        min-width: 0;
        padding: 6px 4px;
        border-radius: var(--radius-md);
        background: rgba(148, 163, 184, 0.06);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        scroll-snap-align: start;
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          transform 0.1s ease;

        &:active {
          transform: scale(0.97);
        }

        &.is-active {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 16%, transparent);
          box-shadow: 0 0 0 1px var(--accent);
        }

        &.is-locked .card-portrait img {
          filter: grayscale(1) brightness(0.5);
        }
      }

      .card-portrait {
        position: relative;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 8px;
        overflow: hidden;
        background: #0b1220;
        color: var(--color-primary);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .card-lock {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--text-secondary);
      }

      .card-name {
        width: 100%;
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1.15;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-cost {
        font-family: var(--font-tactical);
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-gold);

        .is-unaffordable & {
          color: var(--color-error);
        }

        .is-locked & {
          color: var(--text-muted);
        }
      }

      .class-summary {
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background: rgba(148, 163, 184, 0.05);
        border: 1px solid var(--border-subtle);
        border-left: 3px solid var(--accent);
      }

      .summary-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }

      .summary-badge {
        font-family: var(--font-tactical);
        font-size: var(--font-size-2xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .summary-targets {
        display: flex;
        gap: 4px;

        span {
          font-size: 0.625rem;
          font-weight: 700;
          padding: 0 6px;
          border-radius: var(--radius-full);
          color: var(--text-secondary);
          background: rgba(148, 163, 184, 0.1);
        }
      }

      .summary-desc {
        margin: 4px 0 0;
        font-size: var(--font-size-xs);
        line-height: 1.45;
        color: var(--text-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .summary-stats {
        display: flex;
        gap: var(--space-4);
        margin: 6px 0 0;

        dt {
          font-size: 0.625rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }

        dd {
          margin: 0;
          font-family: var(--font-tactical);
          font-weight: 700;
          font-size: var(--font-size-sm);

          &.cap {
            text-transform: capitalize;
          }
        }
      }

      .job-codex-box {
        margin-top: var(--space-2);
        border-radius: var(--radius-md);
        border: 1px solid rgba(192, 132, 252, 0.25);
        background: rgba(192, 132, 252, 0.05);

        summary {
          cursor: pointer;
          padding: var(--space-2) var(--space-3);
          font-size: var(--font-size-xs);
          font-weight: 700;
          color: var(--color-arcane);
          min-height: 40px;
          display: flex;
          align-items: center;
        }
      }

      .codex-sub {
        margin: 0;
        padding: 0 var(--space-3) var(--space-2);
        font-size: var(--font-size-xs);
      }

      .codex-rules {
        list-style: none;
        margin: 0;
        padding: 0 var(--space-2) var(--space-2);
        display: grid;
        gap: 6px;
      }

      .codex-rule {
        padding: var(--space-2);
        border-radius: var(--radius-sm);
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);

        &.is-unlocked {
          border-color: rgba(74, 222, 128, 0.35);
        }
      }

      .rule-top {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--font-size-sm);
      }

      .rule-title {
        flex: 1;
      }

      .rule-status {
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-muted);

        .is-unlocked & {
          color: var(--color-success);
        }
      }

      .rule-prereqs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }

      .prereq-chip {
        font-size: var(--font-size-2xs);
        padding: 1px 6px;
        border-radius: 4px;
        color: var(--text-secondary);
        background: rgba(148, 163, 184, 0.08);

        &.is-met {
          color: var(--color-success);
          background: rgba(74, 222, 128, 0.1);
        }
      }

      /* Footer actions */
      .panel-sticky-actions {
        display: flex;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4) var(--space-3);
        border-top: 1px solid var(--border-subtle);
        background: rgba(7, 10, 18, 0.5);
        flex-shrink: 0;
      }

      .action-main {
        flex: 1;
        min-width: 0;
      }

      .btn-cost {
        font-family: var(--font-tactical);
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 5px;
        background: rgba(0, 0, 0, 0.22);
      }

      .gamepad-pill {
        align-items: center;
        padding: 0 5px;
        border-radius: 5px;
        font-family: var(--font-tactical);
        font-size: 0.6875rem;
        line-height: 18px;
        background: rgba(0, 0, 0, 0.25);
      }

      .max-pill {
        flex: 1;
        display: grid;
        place-items: center;
        min-height: 48px;
        border-radius: var(--radius-md);
        font-family: var(--font-tactical);
        font-size: var(--font-size-xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-gold);
        border: 1px dashed rgba(245, 196, 81, 0.45);
      }

      .dock-hint {
        flex: 1;
        margin: 0;
        min-height: 48px;
        display: flex;
        align-items: center;
        font-size: var(--font-size-sm);
        color: var(--text-muted);
      }

      /* Side-panel layouts (landscape / desktop): no drawer chrome, roomier grid */
      @media (orientation: landscape) and (min-width: 640px) {
        .tower-command-panel {
          border-top: none;
          border-left: 1px solid var(--border-subtle);
          border-radius: 0;
          box-shadow: none;
          background: var(--bg-surface);
        }

        .drawer-handle-bar {
          display: none;
        }

        .panel-header {
          padding-top: var(--space-3);
        }

        .class-cards-scroll {
          grid-auto-flow: row;
          grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
          grid-auto-columns: unset;
          overflow: visible;
          margin: 0 0 var(--space-2);
          padding: 2px 0 0;
        }

        .summary-desc {
          -webkit-line-clamp: unset;
        }
      }

      @media (orientation: landscape) and (max-height: 519px) {
        .panel-header {
          padding-top: var(--space-2);
        }
        .head-avatar {
          width: 36px;
          height: 36px;
        }
        .head-title {
          font-size: var(--font-size-base);
        }
        .panel-sticky-actions {
          padding: var(--space-2) var(--space-3);
        }
        .cw-btn {
          min-height: 44px;
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

  protected readonly eyebrow = computed(() => {
    const tile = this.game.selectedTile();
    if (!tile) return 'Recruit';
    if (this.isBuildTile(tile)) return `Platform ${tile.x}, ${tile.y}`;
    if (this.isMazeTile(tile)) return `Maze slot ${tile.x}, ${tile.y}`;
    return this.getTileName(tile);
  });

  protected readonly heading = computed(() => {
    const tile = this.game.selectedTile();
    if (tile && this.isMazeTile(tile)) return 'Aether Barricade';
    return this.activeClassDef().name;
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
    if (code === 'P') return 'Monsters tread here. Pick a glowing platform to deploy.';
    return 'Impassable terrain. Pick a glowing platform to deploy.';
  }
}
