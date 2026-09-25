import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamepadAction, GamepadService } from './gamepad.service';

describe('GamepadService for Tower Defense', () => {
  let service: GamepadService;
  let pad: Gamepad;
  let pads: (Gamepad | null)[];
  let frame: FrameRequestCallback;
  let hidden: boolean;
  let container: HTMLElement;
  let originalGamepads: PropertyDescriptor | undefined;
  let actions: GamepadAction[];

  function tick(time = 0): void {
    frame(time);
  }

  function press(index: number, pressed = true): void {
    (pad.buttons[index] as { pressed: boolean }).pressed = pressed;
  }

  function axes(x: number, y = 0, rightX = 0, rightY = 0): void {
    (pad.axes as number[]).splice(0, 4, x, y, rightX, rightY);
  }

  function render(html: string): HTMLElement[] {
    container.innerHTML = html;
    return Array.from(container.querySelectorAll<HTMLElement>('*')).map((element) => {
      const rect = new DOMRect(
        Number(element.dataset['x'] ?? 0),
        Number(element.dataset['y'] ?? 0),
        80,
        44,
      );
      vi.spyOn(element, 'getClientRects').mockReturnValue([rect] as unknown as DOMRectList);
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
      return element;
    });
  }

  beforeEach(() => {
    hidden = false;
    originalGamepads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    pad = {
      id: 'Xbox 360 Controller (Standard Gameplay)',
      index: 0,
      connected: true,
      mapping: 'standard',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    } as unknown as Gamepad;
    pads = [pad];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    service = TestBed.inject(GamepadService);
    actions = [];
    service.actions.subscribe((action) => actions.push(action));
    service.start();
  });

  afterEach(() => {
    service.ngOnDestroy();
    container.remove();
    vi.restoreAllMocks();
    if (originalGamepads) Object.defineProperty(navigator, 'getGamepads', originalGamepads);
    else Reflect.deleteProperty(navigator, 'getGamepads');
  });

  it('detects connected standard gamepads and signals status', () => {
    tick();
    expect(service.connected()).toBe(true);
    expect(service.controllerName()).toContain('Xbox 360 Controller');

    pads = [];
    tick();
    expect(service.connected()).toBe(false);
  });

  it('dispatches X (start wave) and Y (toggle speed) actions on press edge', () => {
    tick();
    press(2, true); // Button X
    tick(20);
    expect(actions).toEqual(['start-wave']);

    press(2, false);
    tick(40);
    press(3, true); // Button Y
    tick(60);
    expect(actions).toEqual(['start-wave', 'toggle-speed']);
  });

  it('cycles class selection with LB (button 4) and RB (button 5)', () => {
    tick();
    press(4, true); // LB
    tick(20);
    press(4, false);
    tick(40);
    press(5, true); // RB
    tick(60);
    expect(actions).toEqual(['prev-class', 'next-class']);
  });

  it('activates focused buttons on A (button 0) press', () => {
    const [btn] = render('<button>Deploy Blade Warden</button>');
    const clicked = vi.fn();
    btn.addEventListener('click', clicked);
    btn.focus();

    tick();
    press(0, true);
    tick(20);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('emits cancel action on B (button 1) press when no modal is open', () => {
    tick();
    press(1, true);
    tick(20);
    expect(actions).toEqual(['cancel']);
  });

  it('navigates spatially between controls with D-pad or stick', () => {
    const [leftBtn, rightBtn] = render(`
      <button data-x="0">Left</button>
      <button data-x="200">Right</button>
    `);
    tick();
    press(15, true); // D-pad right
    tick(10);
    expect(document.activeElement).toBe(leftBtn);
    tick(400);
    expect(document.activeElement).toBe(rightBtn);
  });

  it('emits directional action when analog stick is deflected', () => {
    tick();
    axes(0.8, 0); // Stick tilted right
    tick(20);
    expect(actions).toEqual(['cursor-right']);
  });
});
