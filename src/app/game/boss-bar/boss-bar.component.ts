import { Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { MOB_TYPES } from '../../core/models/mob.model';

/** What the bar says while each damage stage holds. */
const STAGE_STATES = ['Intact', 'Armor cracked', 'Arm torn away', 'Crawling'];

/**
 * Super bosses (the Iron Colossus) get a top-of-board health bar with armour-break notches;
 * ordinary bosses keep only the health bar over their heads.
 */
@Component({
  selector: 'app-boss-bar',
  standalone: true,
  template: `
    @for (b of bosses(); track b.mobId) {
      <button
        type="button"
        class="boss-bar"
        (click)="game.selectMob(b.mobId)"
        [attr.aria-label]="'Inspect ' + b.name + ', health ' + b.hp + ' of ' + b.maxHp"
      >
        <div class="boss-head">
          <img class="boss-face" [src]="'assets/monsters/' + b.id + '-portrait.png'" alt="" />
          <span class="boss-name">{{ b.name }}</span>
          <span class="boss-state" [class.is-dire]="b.stage >= 3">{{ b.state }}</span>
          <span class="boss-hp">{{ b.hp }} / {{ b.maxHp }}</span>
        </div>
        <div class="boss-gauge">
          <div class="boss-fill" [style.width.%]="b.percent"></div>
          @for (notch of b.notches; track notch) {
            <span class="boss-notch" [style.left.%]="notch"></span>
          }
        </div>
      </button>
    }
  `,
  styles: [
    `
      :host {
        position: absolute;
        top: 82px;
        left: 50%;
        transform: translateX(-50%);
        width: min(420px, calc(100% - 32px));
        display: grid;
        gap: 6px;
        z-index: 5;
      }

      .boss-bar {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        padding: 6px 10px 8px;
        border-radius: var(--radius-md);
        background: color-mix(in srgb, #0b0f1a 82%, transparent);
        border: 1px solid color-mix(in srgb, #fb923c 45%, transparent);
        box-shadow: var(--shadow-raised);
        width: 100%;
        text-align: left;
        cursor: pointer;
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

      .boss-hp {
        margin-left: auto;
        font: 700 var(--font-size-xs) var(--font-tactical);
        color: #ffedd5;
        white-space: nowrap;
      }

      @media (max-width: 599px) {
        :host {
          top: 70px;
          left: 12px;
          transform: none;
          width: min(420px, calc(100% - 72px));
        }
      }
      @media (max-width: 440px) {
        .boss-state {
          display: none;
        }
        .boss-name {
          font-size: var(--font-size-xs);
        }
      }
      @media (orientation: landscape) and (max-height: 519px) {
        :host {
          top: 58px;
        }
      }

      .boss-gauge {
        position: relative;
        width: 100%;
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
  protected readonly game = inject(GameService);

  protected readonly bosses = computed(() =>
    this.game
      .mobs()
      .filter((m) => !m.isDead && !m.hasEscaped && MOB_TYPES[m.typeId].damageStages)
      .map((mob) => {
        const stage = mob.damageStage ?? 0;
        return {
          mobId: mob.id,
          id: mob.typeId,
          name: mob.name,
          hp: Math.max(0, Math.ceil(mob.hp)),
          maxHp: mob.maxHp,
          stage,
          state: MOB_TYPES[mob.typeId].damageStages
            ? STAGE_STATES[Math.min(stage, STAGE_STATES.length - 1)]
            : MOB_TYPES[mob.typeId].badge,
          percent: Math.max(0, Math.min(100, (mob.hp / mob.maxHp) * 100)),
          notches: (MOB_TYPES[mob.typeId].damageStages ?? []).map((s) => s.at * 100),
        };
      }),
  );
}
