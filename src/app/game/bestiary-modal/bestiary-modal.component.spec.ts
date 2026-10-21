import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BestiaryModalComponent } from './bestiary-modal.component';
import { GameService } from '../../core/services/game.service';

describe('Enemy dossier', () => {
  it('shows current vitality and one strongest slow per class, then returns to reference entries', async () => {
    await TestBed.configureTestingModule({ imports: [BestiaryModalComponent] }).compileComponents();
    const game = TestBed.inject(GameService);
    game['spawnMob']('bramble-golem', 2);
    const mob = game.mobs()[0];
    mob.hp = 1200;
    game['applySlow'](mob, 0.4, 1000, 'chronomancer');
    game['applySlow'](mob, 0.2, 3000, 'chronomancer');
    game['applySlow'](mob, 0.3, 2000, 'elementalist');
    game['applySlow'](mob, 0.1, 1500, 'juggernaut');
    game.selectMob(mob.id);
    const fixture = TestBed.createComponent(BestiaryModalComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.active-mob-name')?.textContent).toBe('Bramble Golem');
    expect(root.querySelector('.live-vitals')?.textContent).toContain('1200 / 6552 HP');
    expect(root.querySelectorAll('.effect-chip')).toHaveLength(3);
    const effects = root.querySelector('.vitals-effects')?.textContent?.replace(/\s+/g, ' ');
    expect(effects).toContain('chronomancer · 40%');
    expect(effects).toContain('elementalist · 30%');
    expect(effects).toContain('Unsteady · 10%');
    fixture.componentInstance.onSelectMob('prismatic-ooze');
    await fixture.whenStable();
    expect(root.querySelector('.live-vitals')).toBeNull();
    expect(root.querySelector('.active-mob-name')?.textContent).toBe('Prismatic Ooze');
    expect(root.querySelector('.strategy-advice-card')?.textContent).toContain(
      '80% physical armor',
    );
  });
});
