import { DOCUMENT, Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

export type GamepadAction =
  | 'confirm'
  | 'cancel'
  | 'start-wave'
  | 'toggle-speed'
  | 'prev-class'
  | 'next-class'
  | 'cursor-up'
  | 'cursor-down'
  | 'cursor-left'
  | 'cursor-right'
  | 'cycle-camera'
  | 'toggle-menu';

export type Direction = 'up' | 'down' | 'left' | 'right';

@Injectable({ providedIn: 'root' })
export class GamepadService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  private readonly actionSource = new Subject<GamepadAction>();
  public readonly actions = this.actionSource.asObservable();

  public readonly connected = signal(false);
  public readonly controllerName = signal('');
  public readonly lastActiveInput = signal<'gamepad' | 'keyboard' | 'mouse'>('mouse');

  private frame: number | null = null;
  private controllerKey = '';
  private armed = false;
  private suspended = false;
  private buttons: boolean[] = [];
  private navigation: Direction | null = null;
  private nextNavigationAt = 0;
  private focused: HTMLElement | null = null;

  public start(): void {
    const view = this.document.defaultView;
    if (this.frame !== null || !view?.navigator.getGamepads) return;

    view.addEventListener('blur', this.onBlur);
    view.addEventListener('focus', this.onFocus);
    view.addEventListener('pointerdown', this.onPointer);
    view.addEventListener('keydown', this.onKey);
    this.document.addEventListener('visibilitychange', this.resetInput);

    this.zone.runOutsideAngular(() => {
      this.frame = view.requestAnimationFrame(this.poll);
    });
  }

  public ngOnDestroy(): void {
    const view = this.document.defaultView;
    if (this.frame !== null) view?.cancelAnimationFrame(this.frame);
    this.frame = null;

    view?.removeEventListener('blur', this.onBlur);
    view?.removeEventListener('focus', this.onFocus);
    view?.removeEventListener('pointerdown', this.onPointer);
    view?.removeEventListener('keydown', this.onKey);
    this.document.removeEventListener('visibilitychange', this.resetInput);

    this.clearFocusHighlight();
    this.actionSource.complete();
  }

  private readonly poll = (time: number): void => {
    const view = this.document.defaultView;
    if (!view) return;

    let pad: Gamepad | undefined;
    try {
      pad = Array.from(view.navigator.getGamepads()).find(
        (candidate): candidate is Gamepad =>
          !!candidate?.connected && candidate.mapping === 'standard',
      );
    } catch {
      // In embedded frames or restricted origins, getGamepads can throw
    }

    const key = pad ? `${pad.index}:${pad.id}` : '';
    if (key !== this.controllerKey) {
      this.controllerKey = key;
      this.resetInput();
      this.clearFocusHighlight();
      this.zone.run(() => {
        this.connected.set(!!pad);
        this.controllerName.set(pad?.id ?? '');
      });
    }

    if (pad && !this.document.hidden && !this.suspended && !this.isEditing()) {
      this.processInput(pad, time);
    } else {
      this.resetInput();
    }

    this.frame = view.requestAnimationFrame(this.poll);
  };

  private processInput(pad: Gamepad, time: number): void {
    const pressed = pad.buttons.map((b) => b.pressed);

    if (!this.armed) {
      this.armed = !pressed.some(Boolean) && pad.axes.every((a) => Math.abs(a) < 0.35);
      this.buttons = pressed;
      return;
    }

    const edge = (index: number) => pressed[index] && !this.buttons[index];

    // Directional calculation: D-pad has priority, then left stick, then right stick
    const navigation: Direction | null = pressed[12]
      ? 'up'
      : pressed[13]
        ? 'down'
        : pressed[14]
          ? 'left'
          : pressed[15]
            ? 'right'
            : this.axisDirection(pad.axes[0], pad.axes[1]) ||
              this.axisDirection(pad.axes[2], pad.axes[3]);

    if (navigation && (navigation !== this.navigation || time >= this.nextNavigationAt)) {
      this.zone.run(() => {
        this.lastActiveInput.set('gamepad');
        this.navigate(navigation);
      });
      this.nextNavigationAt = time + (navigation === this.navigation ? 160 : 380);
    }

    // Buttons
    // 0: A (Confirm / Place / Upgrade)
    // 1: B (Cancel / Deselect)
    // 2: X (Start / Call Wave)
    // 3: Y (Cycle Speed 1x -> 2x -> 4x)
    // 4: LB (Previous Class)
    // 5: RB (Next Class)
    const hasAnyButtonEdge =
      edge(0) || edge(1) || edge(2) || edge(3) || edge(4) || edge(5) || edge(8) || edge(9);

    if (hasAnyButtonEdge) {
      this.zone.run(() => {
        this.lastActiveInput.set('gamepad');

        if (edge(0)) {
          // Confirm button
          this.activateOrEmit();
        } else if (edge(1)) {
          // Cancel button
          this.cancel();
        } else if (edge(2)) {
          // X: Start Wave / Action
          this.actionSource.next('start-wave');
        } else if (edge(3)) {
          // Y: Toggle Speed / Action
          this.actionSource.next('toggle-speed');
        } else if (edge(4)) {
          // LB: Prev Class
          this.actionSource.next('prev-class');
        } else if (edge(5)) {
          // RB: Next Class
          this.actionSource.next('next-class');
        } else if (edge(8)) {
          // Select / Back / View: Cycle Camera View
          this.actionSource.next('cycle-camera');
        } else if (edge(9)) {
          // Start / Menu: Toggle Pause Options Menu
          this.actionSource.next('toggle-menu');
        }
      });
    }

    this.buttons = pressed;
    this.navigation = navigation;
  }

  private axisDirection(x = 0, y = 0): Direction | null {
    if (Math.max(Math.abs(x), Math.abs(y)) < 0.5) return null;
    return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';
  }

  private modal(): HTMLElement | undefined {
    return Array.from(
      this.document.querySelectorAll<HTMLElement>(
        'dialog[open], [role="dialog"][aria-modal="true"]',
      ),
    )
      .reverse()
      .find((element) => element.getClientRects().length > 0);
  }

  private controls(): HTMLElement[] {
    return Array.from(
      (this.modal() ?? this.document).querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"][tabindex], [data-gamepad-selectable="true"]',
      ),
    ).filter(
      (element) =>
        !element.matches(':disabled, [aria-disabled="true"], [tabindex="-1"]') &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        element.getClientRects().length > 0 &&
        this.document.defaultView?.getComputedStyle(element).visibility !== 'hidden',
    );
  }

  private navigate(direction: Direction): void {
    const modal = this.modal();
    const isBattlefieldActive = !!this.document.getElementById('battlefield-map');

    if (isBattlefieldActive && !modal) {
      // In main battlefield gameplay, directional inputs ALWAYS move the tactical grid cursor!
      this.clearFocusHighlight();
      if (
        this.document.activeElement instanceof HTMLElement &&
        this.document.activeElement !== this.document.body
      ) {
        this.document.activeElement.blur();
      }
      this.actionSource.next(`cursor-${direction}` as GamepadAction);
      return;
    }

    const controls = this.controls();
    const active = this.document.activeElement as HTMLElement;

    if (controls.length === 0) {
      this.actionSource.next(`cursor-${direction}` as GamepadAction);
      return;
    }

    let next = controls[0];
    if (controls.includes(active)) {
      const current = active.getBoundingClientRect();
      const horizontal = direction === 'left' || direction === 'right';
      const sign = direction === 'left' || direction === 'up' ? -1 : 1;
      let bestScore = Infinity;
      next = active;

      for (const candidate of controls) {
        if (candidate === active) continue;
        const bounds = candidate.getBoundingClientRect();
        const dx = bounds.left + bounds.width / 2 - (current.left + current.width / 2);
        const dy = bounds.top + bounds.height / 2 - (current.top + current.height / 2);
        const along = (horizontal ? dx : dy) * sign;
        const across = Math.abs(horizontal ? dy : dx);
        const score = along + across * 3;

        if (along > 2 && score < bestScore) {
          bestScore = score;
          next = candidate;
        }
      }

      if (next === active) {
        // If we reached the edge of DOM controls in this direction, emit cursor movement
        this.actionSource.next(`cursor-${direction}` as GamepadAction);
        return;
      }
    }

    if (!next) return;
    this.clearFocusHighlight();
    this.focused = next;
    next.classList.add('gamepad-focused');
    next.focus({ preventScroll: true });
    next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private activateOrEmit(): void {
    const modal = this.modal();
    const isBattlefieldActive = !!this.document.getElementById('battlefield-map');
    const active = this.document.activeElement as HTMLElement;

    if (isBattlefieldActive && !modal) {
      this.actionSource.next('confirm');
      return;
    }

    if (active && this.controls().includes(active)) {
      active.click();
    } else {
      const controls = this.controls();
      if (controls.length > 0) {
        controls[0].click();
      } else {
        this.actionSource.next('confirm');
      }
    }
  }

  private cancel(): void {
    const modal = this.modal();
    if (modal) {
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      this.actionSource.next('cancel');
    } else {
      this.actionSource.next('cancel');
    }
  }

  private isEditing(): boolean {
    return !!this.document.activeElement?.closest('input, textarea, select, [contenteditable]');
  }

  private readonly onPointer = (): void => {
    this.lastActiveInput.set('mouse');
    this.clearFocusHighlight();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) {
      this.lastActiveInput.set('keyboard');
    }
  };

  private readonly resetInput = (): void => {
    this.armed = false;
    this.buttons = [];
    this.navigation = null;
    this.nextNavigationAt = 0;
  };

  private readonly onBlur = (): void => {
    this.suspended = true;
    this.resetInput();
  };

  private readonly onFocus = (): void => {
    this.suspended = false;
    this.resetInput();
  };

  public clearFocusHighlight = (): void => {
    this.focused?.classList.remove('gamepad-focused');
    this.focused = null;
  };
}
