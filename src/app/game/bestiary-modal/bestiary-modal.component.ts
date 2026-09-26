import { Component, computed, inject, output, signal } from '@angular/core';
import { MOB_TYPES, MobTypeDefinition, MobTypeId } from '../../core/models/mob.model';
import { AudioService } from '../../core/services/audio.service';

interface MonsterTacticalEntry {
  mobType: MobTypeDefinition;
  counterAdvice: string;
  threatLevel: 'Low' | 'Medium' | 'High' | 'Crucial Boss';
  lore: string;
}

const BESTIARY_DATA: Record<
  MobTypeId,
  { counterAdvice: string; threatLevel: MonsterTacticalEntry['threatLevel']; lore: string }
> = {
  skulker: {
    threatLevel: 'Low',
    counterAdvice:
      'Deploy rapid melee Blade Wardens on frontline turns. Vulnerable to all damage types.',
    lore: 'Lowly subterranean scavengers that travel in dense packs. While physically frail, their overwhelming numbers can slip through unfortified lanes.',
  },
  swiftbeak: {
    threatLevel: 'Medium',
    counterAdvice:
      'Celerity runner that cuts Chronomancer slow duration in half! Group physical defenders to burst down quickly.',
    lore: 'A fiercely fast avian biped roaming the highlands. Possesses supernatural equilibrium that shrugs off temporal and frost impediments.',
  },
  'prismatic-ooze': {
    threatLevel: 'Medium',
    counterAdvice:
      'Spongy slime with 50% Magic Resistance. Avoid wasting Elementalist fireballs; employ Blade Wardens and Rangers.',
    lore: 'An amorphous protoplasm that refracts magical energies into harmless light. Only cold steel and piercing arrows can sever its core.',
  },
  'pyre-core': {
    threatLevel: 'High',
    counterAdvice:
      'Volatile fire elemental that enrages (+50% speed!) below 40% HP. Finish swiftly with concentrated focus fire.',
    lore: 'A sentient cinder from the planet core. When mortally wounded, its containment fractures, unleashing a desperate blazing sprint.',
  },
  'dread-gaze': {
    threatLevel: 'High',
    counterAdvice:
      'Levitating gaze beast that glides over barricades and chasms. Intercept with Rangers (+50% anti-air bonus) and Lancers.',
    lore: 'An ominous floating eye spawned from the void. Ground barricades cannot deter its aerial flight as it glides straight toward the font.',
  },
  bonewalker: {
    threatLevel: 'High',
    counterAdvice:
      'Armored skeleton shrugging off 50% physical damage. Obliterate with Elementalist explosions which bypass physical armor completely.',
    lore: 'The cursed remains of ancient temple wardens. Their bleached bone plating deflects swords and arrows with resounding clangs.',
  },
  'bramble-golem': {
    threatLevel: 'High',
    counterAdvice:
      'Colossal stone titan with 75% physical armor! Physical attacks do almost nothing; Elementalist magic fire is mandatory!',
    lore: 'A lumbering juggernaut of moss and granite. Ordinary weapons shatter against its hide; only pure arcane thermal cataclysms can melt it down.',
  },
  'sky-sovereign': {
    threatLevel: 'Crucial Boss',
    counterAdvice:
      'Apex dragon boss possessing massive vitality. Steals 5 Sacred Crystals on breach! Maximize Ranger Sky Piercers and Lancer spears.',
    lore: 'The ancient apex wyrm of the Dragonpeak Caldera. Its wingbeats shake the foundation of the sanctuary, devouring entire crystal veins in one bite.',
  },
};

@Component({
  selector: 'app-bestiary-modal',
  standalone: true,
  imports: [],
  template: `
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bestiary-title"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onClose()"
      tabindex="-1"
    >
      <div class="bestiary-modal-card" role="document">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-titles">
            <span class="header-pretitle">TACTICAL CODEX • FIEND COMPENDIUM</span>
            <h2 id="bestiary-title" class="header-title">Monster Bestiary</h2>
          </div>
          <button
            type="button"
            class="close-btn"
            id="close-bestiary-btn"
            (click)="onClose()"
            title="Close Codex [Esc]"
            aria-label="Close Bestiary Codex"
          >
            ✕
          </button>
        </div>

        <!-- Body Grid -->
        <div class="bestiary-grid">
          <!-- Left: Monster Roster Rail -->
          <div class="roster-rail" role="tablist" aria-label="Monster Roster">
            @for (item of roster; track item.id) {
              @let isSelected = selectedMobId() === item.id;
              <button
                type="button"
                role="tab"
                class="roster-item-card"
                [class.selected]="isSelected"
                [attr.aria-selected]="isSelected"
                (click)="onSelectMob(item.id)"
              >
                <div class="roster-portrait-wrap" [style.border-color]="item.color">
                  <img
                    [src]="'assets/monsters/' + item.id + '-portrait.png'"
                    [alt]="item.name"
                    class="roster-img"
                    loading="lazy"
                  />
                </div>
                <div class="roster-info">
                  <div class="name-row">
                    <span class="mob-name">{{ item.name }}</span>
                    @if (item.isFlying) {
                      <span class="air-badge" title="Flying Unit">🕊️ AIR</span>
                    }
                  </div>
                  <span class="mob-badge">{{ item.badge }}</span>
                </div>
              </button>
            }
          </div>

          <!-- Right: Detailed Tactical Dossier -->
          <div class="dossier-panel" role="tabpanel">
            @if (activeMobEntry(); as entry) {
              @let def = entry.mobType;

              <!-- Top Profile Banner -->
              <div class="dossier-top">
                <div class="dossier-portrait-large" [style.border-color]="def.color">
                  <img
                    [src]="'assets/monsters/' + def.id + '-portrait.png'"
                    [alt]="def.name"
                    class="portrait-large-img"
                  />
                  @if (def.isFlying) {
                    <span class="fly-tag">AIRBORNE</span>
                  } @else {
                    <span class="ground-tag">GROUND</span>
                  }
                </div>

                <div class="dossier-titles">
                  <div class="title-status-line">
                    <h3 class="active-mob-name">{{ def.name }}</h3>
                    <span
                      class="threat-pill"
                      [class]="'threat-' + entry.threatLevel.toLowerCase().replace(' ', '-')"
                    >
                      {{ entry.threatLevel }}
                    </span>
                  </div>
                  <span class="active-mob-badge">{{ def.badge }}</span>
                  <p class="special-trait-line">
                    <strong>Special Trait:</strong> {{ def.specialTrait }}
                  </p>
                </div>
              </div>

              <!-- Stats Matrix -->
              <div class="stats-overview-grid">
                <div class="stat-card">
                  <span class="stat-lbl">BASE VITALITY</span>
                  <span class="stat-val">{{ def.baseHp }} HP</span>
                </div>
                <div class="stat-card">
                  <span class="stat-lbl">MOVE SPEED</span>
                  <span class="stat-val">{{ def.baseSpeed }} tiles/s</span>
                </div>
                <div class="stat-card">
                  <span class="stat-lbl">PHYSICAL ARMOR</span>
                  <span class="stat-val" [class.highlight-stat]="def.armor > 0">
                    {{ def.armor * 100 }}%
                  </span>
                </div>
                <div class="stat-card">
                  <span class="stat-lbl">MAGIC RESIST</span>
                  <span class="stat-val" [class.highlight-stat]="def.magicResist > 0">
                    {{ def.magicResist * 100 }}%
                  </span>
                </div>
                <div class="stat-card">
                  <span class="stat-lbl">CRYSTAL LOSS</span>
                  <span class="stat-val danger-val">-{{ def.crystalLoss }} Crystals</span>
                </div>
                <div class="stat-card">
                  <span class="stat-lbl">BASE BOUNTY</span>
                  <span class="stat-val gold-val">+{{ def.goldReward }}G</span>
                </div>
              </div>

              <!-- Tactical Counter Advice Box -->
              <div class="strategy-advice-card">
                <div class="advice-header">
                  <span class="advice-icon">🛡️</span>
                  <h4 class="advice-title">TACTICAL COUNTER STRATEGY</h4>
                </div>
                <p class="advice-body">{{ entry.counterAdvice }}</p>
              </div>

              <!-- Lore Section -->
              <div class="lore-box">
                <h5 class="lore-title">CHRONICLES LORE</h5>
                <p class="lore-body">{{ entry.lore }}</p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(4, 6, 14, 0.88);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        animation: fade-in 0.2s ease-out;
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .bestiary-modal-card {
        width: 100%;
        max-width: 860px;
        max-height: 90dvh;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, #111e38 0%, #091122 100%);
        border: 2px solid rgba(168, 85, 247, 0.4);
        border-radius: var(--radius-lg);
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.95),
          0 0 32px rgba(168, 85, 247, 0.25);
        overflow: hidden;
        animation: scale-up 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes scale-up {
        from {
          transform: scale(0.95);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        background: rgba(15, 23, 42, 0.7);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .header-pretitle {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #c084fc;
        display: block;
      }

      .header-title {
        margin: 2px 0 0 0;
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: 0.03em;
        color: #f8fafc;
      }

      .close-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #94a3b8;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: #f87171;
          color: #f87171;
        }
      }

      .bestiary-grid {
        display: grid;
        grid-template-columns: 240px 1fr;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      /* Roster Rail */
      .roster-rail {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        background: rgba(11, 18, 33, 0.7);
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        overflow-y: auto;
      }

      .roster-item-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: var(--radius-md);
        text-align: left;
        color: #f1f5f9;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(51, 65, 85, 0.7);
          border-color: rgba(192, 132, 252, 0.4);
          transform: translateY(-1px);
        }

        &.selected {
          background: rgba(147, 51, 234, 0.22);
          border-color: #c084fc;
          box-shadow: 0 0 16px rgba(192, 132, 252, 0.3);
        }
      }

      .roster-portrait-wrap {
        width: 38px;
        height: 38px;
        border-radius: 6px;
        border: 2px solid;
        background: #0f172a;
        overflow: hidden;
        flex-shrink: 0;
      }

      .roster-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .roster-info {
        flex: 1;
        min-width: 0;
      }

      .name-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
      }

      .mob-name {
        font-size: 0.82rem;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .air-badge {
        font-size: 0.55rem;
        font-weight: 700;
        color: #38bdf8;
      }

      .mob-badge {
        font-size: 0.65rem;
        color: #94a3b8;
        display: block;
      }

      /* Dossier Panel */
      .dossier-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px;
        overflow-y: auto;
      }

      .dossier-top {
        display: flex;
        gap: 16px;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .dossier-portrait-large {
        position: relative;
        width: 76px;
        height: 76px;
        border-radius: 10px;
        border: 2px solid;
        background: #0f172a;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        flex-shrink: 0;
      }

      .portrait-large-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .fly-tag,
      .ground-tag {
        position: absolute;
        bottom: 2px;
        right: 2px;
        font-family: var(--font-mono);
        font-size: 0.55rem;
        font-weight: 800;
        padding: 1px 4px;
        border-radius: 3px;
      }

      .fly-tag {
        background: rgba(2, 132, 199, 0.85);
        color: #ffffff;
      }

      .ground-tag {
        background: rgba(30, 41, 59, 0.85);
        color: #94a3b8;
      }

      .dossier-titles {
        flex: 1;
      }

      .title-status-line {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .active-mob-name {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        color: #f8fafc;
      }

      .threat-pill {
        font-family: var(--font-mono);
        font-size: 0.62rem;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 9999px;
        text-transform: uppercase;

        &.threat-low {
          background: rgba(74, 222, 128, 0.15);
          color: #4ade80;
          border: 1px solid #4ade80;
        }
        &.threat-medium {
          background: rgba(250, 204, 21, 0.15);
          color: #facc15;
          border: 1px solid #facc15;
        }
        &.threat-high {
          background: rgba(249, 115, 22, 0.15);
          color: #f97316;
          border: 1px solid #f97316;
        }
        &.threat-crucial-boss {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid #f87171;
          animation: pulse 1.8s infinite;
        }
      }

      .active-mob-badge {
        font-size: 0.72rem;
        color: #c084fc;
        display: block;
        margin-top: 2px;
      }

      .special-trait-line {
        margin: 4px 0 0 0;
        font-size: 0.75rem;
        color: #cbd5e1;

        strong {
          color: #fde047;
        }
      }

      /* Stats Grid */
      .stats-overview-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .stat-card {
        display: flex;
        flex-direction: column;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 6px 10px;
      }

      .stat-lbl {
        font-size: 0.58rem;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 0.04em;
      }

      .stat-val {
        font-family: var(--font-mono);
        font-size: 0.85rem;
        font-weight: 700;
        color: #f1f5f9;

        &.highlight-stat {
          color: #38bdf8;
        }
        &.danger-val {
          color: #f87171;
        }
        &.gold-val {
          color: #facc15;
        }
      }

      /* Strategy Advice Box */
      .strategy-advice-card {
        padding: 10px 14px;
        background: rgba(30, 41, 59, 0.6);
        border-left: 3px solid #38bdf8;
        border-radius: 0 8px 8px 0;
      }

      .advice-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }

      .advice-icon {
        font-size: 0.95rem;
      }

      .advice-title {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        color: #38bdf8;
      }

      .advice-body {
        margin: 0;
        font-size: 0.78rem;
        line-height: 1.4;
        color: #e2e8f0;
      }

      /* Lore Box */
      .lore-box {
        padding: 10px 14px;
        background: rgba(15, 23, 42, 0.4);
        border: 1px dashed rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
      }

      .lore-title {
        margin: 0 0 4px 0;
        font-family: var(--font-mono);
        font-size: 0.62rem;
        font-weight: 700;
        color: #94a3b8;
      }

      .lore-body {
        margin: 0;
        font-size: 0.72rem;
        font-style: italic;
        line-height: 1.4;
        color: #94a3b8;
      }

      @media (max-width: 767px) {
        .bestiary-grid {
          grid-template-columns: 1fr;
          overflow-y: auto;
        }

        .roster-rail {
          max-height: 140px;
          border-right: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .stats-overview-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
})
export class BestiaryModalComponent {
  public readonly closeModal = output<void>();
  protected readonly audio = inject(AudioService);

  public readonly roster: MobTypeDefinition[] = Object.values(MOB_TYPES);
  public readonly selectedMobId = signal<MobTypeId>('skulker');

  public readonly activeMobEntry = computed<MonsterTacticalEntry>(() => {
    const id = this.selectedMobId();
    const def = MOB_TYPES[id];
    const data = BESTIARY_DATA[id];
    return {
      mobType: def,
      counterAdvice: data.counterAdvice,
      threatLevel: data.threatLevel,
      lore: data.lore,
    };
  });

  public onSelectMob(id: MobTypeId): void {
    this.selectedMobId.set(id);
    this.audio.playSelect();
  }

  public onClose(): void {
    this.closeModal.emit();
  }

  public onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }
}
