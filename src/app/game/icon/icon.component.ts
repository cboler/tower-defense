import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Stroke paths drawn on a 24×24 grid; filled shapes are marked with a leading `F:`. */
const ICONS = {
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  play: ['F:M8 5.5v13l10.5-6.5z'],
  pause: ['F:M7 5h3.5v14H7z', 'F:M13.5 5H17v14h-3.5z'],
  speed: ['F:M4 6v12l8-6z', 'F:M12 6v12l8-6z'],
  swords: [
    'M5 3l9.5 9.5',
    'M3 5l2-2',
    'M12 15l-3 3',
    'M19 3l-9.5 9.5',
    'M21 5l-2-2',
    'M12 15l3 3',
    'M7 17l-3 3',
    'M17 17l3 3',
  ],
  bolt: ['F:M13 2L4 14h7l-1 8 9-12h-7z'],
  map: ['M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z', 'M9 4v13', 'M15 6.5v13'],
  book: [
    'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z',
    'M4 20.5A2.5 2.5 0 006.5 23H20v-5',
  ],
  volume: ['F:M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 010 7', 'M19 6a8.5 8.5 0 010 12'],
  mute: ['F:M4 9h4l5-4v14l-5-4H4z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  gamepad: [
    'M7 8h10a5 5 0 014.8 6.4l-1 3.3a2.5 2.5 0 01-4.3.9L14.5 16h-5l-2 2.6a2.5 2.5 0 01-4.3-.9l-1-3.3A5 5 0 017 8z',
    'M8 11v3',
    'M6.5 12.5h3',
    'F:M15.5 11.2a.9.9 0 110 1.8.9.9 0 010-1.8z',
    'F:M17.5 13a.9.9 0 110 1.8.9.9 0 010-1.8z',
  ],
  camera: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5', 'M12 12v9', 'M12 12L4 7.5'],
  crystal: ['F:M12 2l6 7-6 13-6-13z'],
  coin: ['F:M12 3a9 9 0 110 18 9 9 0 010-18z'],
  star: ['F:M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z'],
  search: ['M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13z', 'M15.5 15.5L20 20'],
  upgrade: ['M12 19V6', 'M6 11l6-6 6 6'],
  refresh: ['M20 12a8 8 0 11-2.3-5.6', 'M20 4v4.5h-4.5'],
  shield: ['M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z'],
  target: ['M12 4a8 8 0 110 16 8 8 0 010-16z', 'M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 017 0v3'],
  chevron: ['M9 6l6 6-6 6'],
  info: ['M12 3a9 9 0 110 18 9 9 0 010-18z', 'M12 11v6', 'M12 7.5v.5'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      aria-hidden="true"
      focusable="false"
    >
      @for (p of paths(); track $index) {
        @if (p.fill) {
          <path [attr.d]="p.d" fill="currentColor" />
        } @else {
          <path
            [attr.d]="p.d"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
        line-height: 0;
      }
    `,
  ],
})
export class IconComponent {
  public readonly name = input.required<IconName>();
  public readonly size = input<number>(20);

  protected readonly paths = computed(() =>
    ICONS[this.name()].map((d) =>
      d.startsWith('F:') ? { d: d.slice(2), fill: true } : { d, fill: false },
    ),
  );
}
