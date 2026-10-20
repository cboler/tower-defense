import { Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { MOB_TYPES } from '../../core/models/mob.model';

/** What the bar says while each damage stage holds. */
const STAGE_STATES = ['Intact', 'Armor cracked', 'Arm torn away', 'Crawling'];

/**
 * A super boss's health across the top of the board, notched where its armour breaks, in place
 * of the small bar the rank and file carry over their heads.
 */
@Component({
  selector: 'app-boss-bar',
  standalone: true,
  template: `
    @if (boss(); as b) {
      <div class="boss-bar" role="status" [attr.aria-label]="b.name + ' health ' + b.percent + '%'">
        <div class="boss-head">
          <img class="boss-face" [src]="'assets/monsters/' + b.id + '-portrait.png'" alt="" />
          <span class="boss-name">{{ b.name }}</span>
          <span class="boss-state" [class.is-dire]="b.stage >= 3">{{ b.state }}</span>
        </div>
        <div class="boss-gauge">
          <div class="boss-fill" [style.width.%]="b.percent"></div>
          @for (notch of b.notches; track notch) {
            <span class="boss-notch" [style.left.%]="notch"></span>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        width: min(420px, calc(100% - 32px));
        pointer-events: none;
        z-index: 5;
      }

      .boss-bar {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 10px 8px;
        border-radius: var(--radius-md);
        background: color-mix(in srgb, #0b0f1a 82%, transparent);
        border: 1px solid color-mix(in srgb, #fb923c 45%, transparent);
        box-shadow: var(--shadow-raised);
      }

      .boss-head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .boss-face {
        width: 22px;
        height: 22px;
        border-radius: var(--radius-sm);
        border: 1px solid #c2410c;
        flex: none;
      }

      .boss-name {
        font-family: var(--font-display);
        font-size: var(--font-size-sm);
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #fed7aa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .boss-state {
        margin-left: auto;
        font-size: var(--font-size-xs);
        color: var(--text-secondary);
        white-space: nowrap;

        &.is-dire {
          color: #f87171;
        }
      }

      .boss-gauge {
        position: relative;
        height: 10px;
        border-radius: 3px;
        overflow: hidden;
        background: #1e1b24;
        border: 1px solid #3a2f2a;
      }

      .boss-fill {
        height: 100%;
        background: linear-gradient(180deg, #fb923c, #c2410c);
        transition: width 0.25s var(--ease-out);
      }

      .boss-notch {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        margin-left: -1px;
        background: #0b0f1a;
      }
    `,
  ],
})
export class BossBarComponent {
  private readonly game = inject(GameService);

  protected readonly boss = computed(() => {
    const mob = this.game.mobs().find((m) => !m.isDead && MOB_TYPES[m.typeId].damageStages);
    if (!mob) return null;
    const stage = mob.damageStage ?? 0;
    return {
      id: mob.typeId,
      name: mob.name,
      stage,
      state: STAGE_STATES[Math.min(stage, STAGE_STATES.length - 1)],
      percent: Math.max(0, Math.round((mob.hp / mob.maxHp) * 100)),
      notches: (MOB_TYPES[mob.typeId].damageStages ?? []).map((s) => s.at * 100),
    };
  });
}
