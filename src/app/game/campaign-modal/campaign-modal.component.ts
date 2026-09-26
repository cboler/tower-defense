import { Component, computed, inject, output, signal } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { CampaignService } from '../../core/services/campaign.service';
import { AudioService } from '../../core/services/audio.service';
import { CampaignMission } from '../../core/models/campaign.model';
import { TOWER_CLASSES } from '../../core/models/tower.model';

@Component({
  selector: 'app-campaign-modal',
  standalone: true,
  imports: [],
  template: `
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-modal-title"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onClose()"
      tabindex="-1"
    >
      <div class="campaign-modal-card" role="document">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-titles">
            <span class="header-pretitle">WARDEN DISPATCH • CAMPAIGN CHRONICLES</span>
            <h2 id="campaign-modal-title" class="header-title">Tactical Mission Map</h2>
          </div>
          <div class="header-stats">
            <div class="stars-badge" title="Total Stars Earned across all Acts">
              <span class="star-icon" aria-hidden="true">⭐</span>
              <span class="star-count">{{ campaign.totalStars() }} / 9 Stars</span>
            </div>
            <button
              type="button"
              class="close-btn"
              id="close-campaign-btn"
              (click)="onClose()"
              title="Close Mission Dossier [Esc]"
              aria-label="Close Campaign Dossier"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Main Content Grid -->
        <div class="modal-body-grid">
          <!-- Left: Mission Selection Rail -->
          <div class="missions-rail" role="tablist" aria-label="Campaign Missions List">
            @for (m of campaign.missions(); track m.id) {
              @let unlocked = campaign.isMissionUnlocked(m.id);
              @let record = campaign.progressMap()[m.id];
              @let isSelected = selectedMissionId() === m.id;

              <button
                type="button"
                role="tab"
                class="mission-tab-card"
                [class.selected]="isSelected"
                [class.locked]="!unlocked"
                [attr.aria-selected]="isSelected"
                (click)="onSelectMission(m)"
                [disabled]="!unlocked"
              >
                <div class="card-status-bar">
                  <span class="act-badge">{{ m.actTitle }}</span>
                  <span class="difficulty-tag" [class]="'diff-' + m.difficulty.toLowerCase()">
                    {{ m.difficulty }}
                  </span>
                </div>

                <div class="card-title-row">
                  <h4 class="mission-name">{{ m.title }}</h4>
                  @if (!unlocked) {
                    <span class="lock-icon" title="Clear previous stage to unlock">🔒</span>
                  } @else {
                    <div class="stars-row" [title]="(record?.starsEarned ?? 0) + ' / 3 Stars'">
                      @for (s of [1, 2, 3]; track s) {
                        <span class="star" [class.earned]="(record?.starsEarned ?? 0) >= s">★</span>
                      }
                    </div>
                  }
                </div>

                <p class="mission-loc">{{ m.location }}</p>

                @if (record?.completed) {
                  <div class="mission-cleared-tag">✓ SANCTUARY DEFENDED</div>
                }
              </button>
            }
          </div>

          <!-- Right: Mission Briefing & Deployment Dossier -->
          <div class="mission-dossier" role="tabpanel">
            @if (selectedMission(); as mission) {
              @let record = campaign.progressMap()[mission.id];

              <div class="dossier-hero">
                <div class="hero-left">
                  <span class="hero-act">{{ mission.actTitle }}</span>
                  <h3 class="hero-title">{{ mission.title }}</h3>
                  <span class="hero-sub">{{ mission.subtitle }}</span>
                </div>
                <div class="hero-right">
                  <div class="hero-stat-pill">
                    <span class="pill-label">RECORD SCORE</span>
                    <span class="pill-val">{{ record?.highScore ?? 0 }}</span>
                  </div>
                  <div class="hero-stat-pill">
                    <span class="pill-label">BEST WAVE</span>
                    <span class="pill-val">{{ record?.highestWave ?? 0 }} / 31</span>
                  </div>
                </div>
              </div>

              <!-- Recommended Classes & Stage Modifiers -->
              <div class="intel-badges-row">
                <div class="classes-rec-group">
                  <span class="group-label">TACTICAL COUNTERS:</span>
                  <div class="classes-pills">
                    @for (cId of mission.recommendedClasses; track cId) {
                      @let def = getDef(cId);
                      <span class="class-pill" [style.border-color]="def.color">
                        <span class="class-icon">{{ def.icon }}</span>
                        <span class="class-name">{{ def.name }}</span>
                      </span>
                    }
                  </div>
                </div>

                @if (mission.modifiers.length > 0) {
                  <div class="modifiers-group">
                    <span class="group-label">STAGE MODIFIER:</span>
                    @for (mod of mission.modifiers; track mod.id) {
                      <div class="modifier-tag" [title]="mod.description">
                        <span class="mod-icon">{{ mod.icon }}</span>
                        <span class="mod-name">{{ mod.name }}</span>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Story Briefing Dialogue Box -->
              <div class="briefing-box">
                <div class="speaker-profile">
                  <img
                    [src]="mission.prologueStory.avatar"
                    [alt]="mission.prologueStory.speaker"
                    class="speaker-avatar"
                  />
                  <div class="speaker-meta">
                    <span class="speaker-rank">DISPATCH OFFICER</span>
                    <h5 class="speaker-name">{{ mission.prologueStory.speaker }}</h5>
                  </div>
                </div>

                <div class="dialogue-speech-bubble">
                  @for (line of mission.prologueStory.lines; track line) {
                    <p class="dialogue-line">{{ line }}</p>
                  }
                </div>
              </div>

              <!-- Deployment Actions Bar -->
              <div class="dossier-actions-bar">
                <div class="criteria-hint">
                  <span class="criteria-star">⭐⭐⭐ 3-Star Mastery:</span>
                  <span class="criteria-text"
                    >Save {{ mission.threeStarCrystalRequirement }}/20 Sacred Crystals</span
                  >
                </div>

                <button
                  type="button"
                  class="deploy-stage-btn"
                  id="deploy-mission-btn"
                  (click)="onDeploy(mission)"
                >
                  <span class="deploy-glow" aria-hidden="true"></span>
                  <span class="deploy-icon">⚔️</span>
                  <span class="deploy-text">Deploy Champions to {{ mission.title }}</span>
                  <span class="gamepad-hint" aria-hidden="true">[Enter]</span>
                </button>
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

      .campaign-modal-card {
        width: 100%;
        max-width: 900px;
        max-height: 90dvh;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, #0e1e38 0%, #080f1d 100%);
        border: 2px solid rgba(56, 189, 248, 0.4);
        border-radius: var(--radius-lg);
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.95),
          0 0 32px rgba(56, 189, 248, 0.25);
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
        color: var(--color-primary);
        display: block;
      }

      .header-title {
        margin: 2px 0 0 0;
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: 0.03em;
        color: #f8fafc;
      }

      .header-stats {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .stars-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        background: rgba(234, 179, 8, 0.15);
        border: 1px solid #eab308;
        border-radius: 9999px;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 700;
        color: #fde047;
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

      .modal-body-grid {
        display: grid;
        grid-template-columns: 280px 1fr;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      /* Left: Missions Rail */
      .missions-rail {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        background: rgba(11, 18, 33, 0.7);
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        overflow-y: auto;
      }

      .mission-tab-card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: var(--radius-md);
        text-align: left;
        color: #f1f5f9;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover:not(.locked) {
          background: rgba(51, 65, 85, 0.7);
          border-color: rgba(56, 189, 248, 0.4);
          transform: translateY(-1px);
        }

        &.selected {
          background: rgba(2, 132, 199, 0.22);
          border-color: var(--color-primary);
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.3);
        }

        &.locked {
          opacity: 0.45;
          cursor: not-allowed;
          filter: grayscale(0.5);
        }
      }

      .card-status-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .act-badge {
        font-family: var(--font-mono);
        font-size: 0.6rem;
        font-weight: 700;
        color: #38bdf8;
      }

      .difficulty-tag {
        font-size: 0.55rem;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 4px;
        text-transform: uppercase;

        &.diff-novice {
          background: rgba(74, 222, 128, 0.15);
          color: #4ade80;
          border: 1px solid rgba(74, 222, 128, 0.3);
        }
        &.diff-tactician {
          background: rgba(250, 204, 21, 0.15);
          color: #facc15;
          border: 1px solid rgba(250, 204, 21, 0.3);
        }
        &.diff-master {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
      }

      .card-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .mission-name {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .stars-row {
        display: flex;
        gap: 2px;
      }

      .star {
        font-size: 0.85rem;
        color: #475569;

        &.earned {
          color: #facc15;
          text-shadow: 0 0 6px rgba(250, 204, 21, 0.5);
        }
      }

      .mission-loc {
        margin: 0;
        font-size: 0.68rem;
        color: #94a3b8;
      }

      .mission-cleared-tag {
        font-family: var(--font-mono);
        font-size: 0.58rem;
        font-weight: 700;
        color: #34d399;
        margin-top: 2px;
      }

      /* Right: Mission Dossier */
      .mission-dossier {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px;
        overflow-y: auto;
      }

      .dossier-hero {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .hero-act {
        font-family: var(--font-mono);
        font-size: 0.68rem;
        font-weight: 700;
        color: var(--color-primary);
      }

      .hero-title {
        margin: 2px 0 0 0;
        font-size: 1.35rem;
        font-weight: 800;
        color: #f8fafc;
      }

      .hero-sub {
        font-size: 0.75rem;
        color: #94a3b8;
      }

      .hero-right {
        display: flex;
        gap: 8px;
      }

      .hero-stat-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 4px 10px;
      }

      .pill-label {
        font-size: 0.58rem;
        font-weight: 700;
        color: #64748b;
      }

      .pill-val {
        font-family: var(--font-mono);
        font-size: 0.95rem;
        font-weight: 800;
        color: #38bdf8;
      }

      .intel-badges-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }

      .group-label {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        color: #94a3b8;
        display: block;
        margin-bottom: 4px;
      }

      .classes-pills {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .class-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid;
        border-radius: 6px;
        font-size: 0.72rem;
        color: #e2e8f0;
      }

      .modifier-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(168, 85, 247, 0.15);
        border: 1px solid #a855f7;
        border-radius: 6px;
        font-size: 0.72rem;
        font-weight: 600;
        color: #d8b4fe;
      }

      /* Story Briefing Box */
      .briefing-box {
        display: flex;
        gap: 14px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: var(--radius-md);
      }

      .speaker-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 80px;
        flex-shrink: 0;
      }

      .speaker-avatar {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        border: 2px solid var(--color-primary);
        object-fit: cover;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
      }

      .speaker-meta {
        text-align: center;
        margin-top: 4px;
      }

      .speaker-rank {
        font-family: var(--font-mono);
        font-size: 0.52rem;
        font-weight: 700;
        color: var(--color-primary);
        display: block;
      }

      .speaker-name {
        margin: 0;
        font-size: 0.68rem;
        font-weight: 700;
        color: #f1f5f9;
        line-height: 1.1;
      }

      .dialogue-speech-bubble {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 14px;
        background: rgba(30, 41, 59, 0.6);
        border-left: 3px solid var(--color-primary);
        border-radius: 0 8px 8px 0;
      }

      .dialogue-line {
        margin: 0;
        font-size: 0.78rem;
        line-height: 1.4;
        color: #cbd5e1;

        &:first-child {
          font-weight: 600;
          color: #f8fafc;
        }
      }

      /* Actions Bar */
      .dossier-actions-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: auto;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .criteria-hint {
        font-size: 0.72rem;
        color: #94a3b8;
      }

      .criteria-star {
        color: #facc15;
        font-weight: 700;
        margin-right: 4px;
      }

      .deploy-stage-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 24px;
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        border: none;
        border-radius: var(--radius-md);
        color: #ffffff;
        font-weight: 800;
        font-size: 0.88rem;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(37, 99, 235, 0.45);
        transition: all 0.15s ease;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(37, 99, 235, 0.6);
        }
      }

      .gamepad-hint {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        background: rgba(0, 0, 0, 0.35);
        padding: 1px 6px;
        border-radius: 4px;
      }

      @media (max-width: 767px) {
        .modal-body-grid {
          grid-template-columns: 1fr;
          overflow-y: auto;
        }

        .missions-rail {
          max-height: 160px;
          border-right: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .briefing-box {
          flex-direction: column;
        }

        .speaker-profile {
          flex-direction: row;
          width: 100%;
          gap: 10px;
        }

        .dossier-actions-bar {
          flex-direction: column;
          gap: 8px;
          align-items: stretch;
        }

        .deploy-stage-btn {
          justify-content: center;
        }
      }
    `,
  ],
})
export class CampaignModalComponent {
  public readonly closeModal = output<void>();
  public readonly missionSelected = output<CampaignMission>();

  protected readonly game = inject(GameService);
  protected readonly campaign = inject(CampaignService);
  protected readonly audio = inject(AudioService);

  public readonly selectedMissionId = signal<string>(this.campaign.activeMissionId());

  public readonly selectedMission = computed(() => {
    const id = this.selectedMissionId();
    return this.campaign.missions().find((m) => m.id === id) ?? this.campaign.missions()[0];
  });

  protected getDef(classId: string) {
    return TOWER_CLASSES[classId as keyof typeof TOWER_CLASSES];
  }

  public onSelectMission(m: CampaignMission): void {
    if (!this.campaign.isMissionUnlocked(m.id)) return;
    this.selectedMissionId.set(m.id);
    this.audio.playSelect();
  }

  public onDeploy(m: CampaignMission): void {
    this.game.loadMission(m);
    this.audio.playEarlyCallHorn();
    this.missionSelected.emit(m);
    this.closeModal.emit();

    // Launch interactive story cutscene
    this.game.story.startSequence({
      id: `${m.id}-prologue`,
      title: `${m.actTitle} • ${m.title}`,
      trigger: 'on-mission-start',
      steps: m.prologueStory.lines.map((line, idx) => ({
        speaker: m.prologueStory.speaker,
        avatar: m.prologueStory.avatar,
        title: 'Dispatch Officer',
        emotion: idx === 0 ? 'urgent' : 'neutral',
        text: line,
      })),
    });
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
