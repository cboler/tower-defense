import { Component, HostListener, inject } from '@angular/core';
import { StoryService } from '../../core/services/story.service';
import { GameService } from '../../core/services/game.service';

@Component({
  selector: 'app-story-dialogue-overlay',
  standalone: true,
  imports: [],
  template: `
    @if (story.activeNarrativeEvent(); as event) {
      @if (story.currentStep(); as step) {
        <div
          class="dialogue-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialogue-speaker"
          (click)="onBackdropClick($event)"
          (keydown.escape)="onSkip()"
          tabindex="-1"
        >
          <div
            class="dialogue-card"
            [class.is-warning]="step.emotion === 'warning' || step.emotion === 'urgent'"
          >
            <!-- Event Banner Header -->
            <div class="event-banner">
              <span class="banner-icon">
                @if (step.emotion === 'warning' || step.emotion === 'urgent') {
                  ⚠️
                } @else if (step.emotion === 'victorious') {
                  👑
                } @else {
                  📜
                }
              </span>
              <span class="event-title">{{ event.title }}</span>
              <span class="step-indicator">
                {{ story.currentStepIndex() + 1 }} / {{ event.steps.length }}
              </span>
            </div>

            <!-- Dialogue Body: Avatar + Speech Content -->
            <div class="dialogue-body">
              <div class="speaker-avatar-wrap">
                <img
                  [src]="step.avatar"
                  [alt]="step.speaker"
                  class="speaker-avatar-img"
                  loading="eager"
                />
                <div class="avatar-glow"></div>
              </div>

              <div class="speech-content">
                <div class="speaker-info">
                  <h3 id="dialogue-speaker" class="speaker-name">{{ step.speaker }}</h3>
                  @if (step.title) {
                    <span class="speaker-badge">{{ step.title }}</span>
                  }
                </div>

                <p class="dialogue-text">{{ step.text }}</p>
              </div>
            </div>

            <!-- Footer Controls -->
            <div class="dialogue-actions">
              <button
                type="button"
                class="action-btn skip-btn"
                id="story-skip-btn"
                (click)="onSkip()"
                title="Skip cutscene [B / Esc]"
              >
                <span>Dismiss</span>
                <kbd class="btn-kbd">[B / Esc]</kbd>
              </button>

              <button
                type="button"
                class="action-btn advance-btn"
                id="story-advance-btn"
                (click)="onAdvance()"
                [title]="story.isLastStep() ? 'Close & Deploy [A / Enter]' : 'Next [A / Enter]'"
              >
                <span>{{ story.isLastStep() ? '⚔️ Understood!' : 'Continue ▶' }}</span>
                <kbd class="btn-kbd">[A / Space]</kbd>
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .dialogue-backdrop {
        position: fixed;
        inset: 0;
        z-index: 950;
        background: rgba(4, 7, 18, 0.75);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 24px 16px 40px;
        animation: dialogue-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes dialogue-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .dialogue-card {
        width: 100%;
        max-width: 760px;
        background: linear-gradient(180deg, #111a30 0%, #080d1a 100%);
        border: 2px solid rgba(56, 189, 248, 0.4);
        border-radius: var(--radius-lg);
        box-shadow:
          0 20px 50px rgba(0, 0, 0, 0.9),
          0 0 30px rgba(56, 189, 248, 0.25);
        overflow: hidden;
        animation: dialogue-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .dialogue-card.is-warning {
        border-color: rgba(249, 115, 22, 0.6);
        box-shadow:
          0 20px 50px rgba(0, 0, 0, 0.9),
          0 0 30px rgba(249, 115, 22, 0.3);
      }

      @keyframes dialogue-slide-up {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .event-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(15, 23, 42, 0.8);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .banner-icon {
        font-size: 1rem;
      }

      .event-title {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #94a3b8;
        flex: 1;
      }

      .step-indicator {
        font-size: 0.72rem;
        font-weight: 700;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        padding: 2px 8px;
        border-radius: 9999px;
      }

      .dialogue-body {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 18px 22px;
      }

      .speaker-avatar-wrap {
        position: relative;
        width: 76px;
        height: 76px;
        flex-shrink: 0;
        border-radius: var(--radius-md);
        overflow: hidden;
        border: 2px solid #38bdf8;
        background: #0f172a;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
      }

      .dialogue-card.is-warning .speaker-avatar-wrap {
        border-color: #f97316;
      }

      .speaker-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .speech-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .speaker-info {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .speaker-name {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 800;
        color: #f8fafc;
        letter-spacing: 0.02em;
      }

      .speaker-badge {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.15);
        padding: 2px 8px;
        border-radius: var(--radius-sm);
      }

      .dialogue-text {
        margin: 0;
        font-size: 0.94rem;
        line-height: 1.5;
        color: #cbd5e1;
      }

      .dialogue-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        padding: 10px 20px;
        background: rgba(10, 15, 30, 0.9);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: var(--radius-md);
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .skip-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #94a3b8;
      }

      .skip-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }

      .advance-btn {
        background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
        border: 1px solid #38bdf8;
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
      }

      .advance-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(2, 132, 199, 0.6);
      }

      .btn-kbd {
        font-family: inherit;
        font-size: 0.68rem;
        opacity: 0.8;
      }

      @media (max-width: 640px) {
        .dialogue-backdrop {
          padding: 12px 10px 24px;
        }

        .dialogue-body {
          gap: 14px;
          padding: 14px;
        }

        .speaker-avatar-wrap {
          width: 56px;
          height: 56px;
        }

        .speaker-name {
          font-size: 0.95rem;
        }

        .dialogue-text {
          font-size: 0.85rem;
        }

        .action-btn {
          padding: 6px 12px;
          font-size: 0.78rem;
        }
      }
    `,
  ],
})
export class StoryDialogueOverlayComponent {
  public readonly story = inject(StoryService);
  protected readonly game = inject(GameService);

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.story.isDialogueActive()) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.onAdvance();
    } else if (event.key === 'Escape' || event.key === 'b' || event.key === 'B') {
      event.preventDefault();
      this.onSkip();
    }
  }

  public onAdvance(): void {
    this.story.advanceStep();
  }

  public onSkip(): void {
    this.story.skipSequence();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onAdvance();
    }
  }
}
