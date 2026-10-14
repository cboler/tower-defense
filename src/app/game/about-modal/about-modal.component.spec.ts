import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AboutModalComponent, ORIGINAL_GAME_URL } from './about-modal.component';

describe('About Crystal Wardens', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [AboutModalComponent] }).compileComponents();
    const fixture = TestBed.createComponent(AboutModalComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('links to the original game in a new tab, without handing it this page', async () => {
    const fixture = await render();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '#about-original-link',
    );
    expect(link?.getAttribute('href')).toBe(ORIGINAL_GAME_URL);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
    expect(link?.textContent).toContain('Play Crystal Defenders on Xbox');
  });

  it('says plainly that this fan project is unaffiliated', async () => {
    const fixture = await render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('not affiliated with');
    expect(text).toContain('Square Enix');
  });

  it('closes from its buttons and from Escape', async () => {
    const fixture = await render();
    let closed = 0;
    fixture.componentInstance.closeModal.subscribe(() => closed++);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.click());
    root
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(3);
  });
});
