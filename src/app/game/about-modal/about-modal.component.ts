import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/** Where to buy the game this one pays homage to. */
export const ORIGINAL_GAME_URL =
  'https://www.xbox.com/en-us/games/store/CRYSTAL-DEFENDERS/BVCHVG7HM8LG';

/**
 * About Crystal Wardens: credits the game it pays homage to and points players to the original,
 * with a plain statement that this fan project isn't affiliated with its publisher.
 */
@Component({
  selector: 'app-about-modal',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cw-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      tabindex="-1"
      (click)="onBackdrop($event)"
      (keydown.escape)="$event.stopPropagation(); closeModal.emit()"
    >
      <div class="cw-sheet about-sheet">
        <div class="cw-sheet-header">
          <div class="cw-sheet-titles">
            <span class="cw-eyebrow">A fan-made homage</span>
            <h2 id="about-title" class="cw-title">About Crystal Wardens</h2>
          </div>
          <button
            type="button"
            class="cw-icon-btn"
            (click)="closeModal.emit()"
            aria-label="Close about"
          >
            <app-icon name="close" />
          </button>
        </div>

        <div class="cw-sheet-body about-body">
          <p class="about-lead">
            Crystal Wardens is a free, non-commercial tribute to
            <strong>Crystal Defenders</strong>, the tactical tower defense from Square Enix, made by
            a fan who has wanted more of it for years.
          </p>
          <p>The original is still out there. If you enjoy this, please play it and support it.</p>

          <a
            class="cw-btn primary block about-link"
            id="about-original-link"
            [href]="originalUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <app-icon name="crystal" [size]="18" />
            Play Crystal Defenders on Xbox
            <span class="about-external" aria-hidden="true">↗</span>
          </a>

          <p class="about-fine">
            Crystal Wardens is not affiliated with, endorsed by or connected to Square Enix. Crystal
            Defenders is a trademark of Square Enix. Every hero, monster, map, picture and sound in
            Crystal Wardens is original to this project.
          </p>
        </div>

        <div class="cw-sheet-footer">
          <button type="button" class="cw-btn block" (click)="closeModal.emit()">
            Back
            <span class="btn-kbd">B</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .about-sheet {
        max-width: 520px;
      }

      .about-body {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        color: var(--text-secondary);
        line-height: 1.55;

        p {
          margin: 0;
        }

        strong {
          color: var(--text-primary);
        }
      }

      .about-lead {
        color: var(--text-primary);
      }

      .about-link {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: var(--space-1) 0;
        text-decoration: none;

        &:hover {
          text-decoration: none;
        }
      }

      .about-external {
        opacity: 0.8;
      }

      .about-fine {
        font-size: var(--font-size-2xs);
        color: var(--text-muted);
      }
    `,
  ],
})
export class AboutModalComponent {
  public readonly closeModal = output<void>();
  protected readonly originalUrl = ORIGINAL_GAME_URL;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Focus moves into the sheet, so Escape and screen readers start here
    afterNextRender(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[role="dialog"]')?.focus(),
    );
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeModal.emit();
  }
}
