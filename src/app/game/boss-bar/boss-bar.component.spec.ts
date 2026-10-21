import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BossBarComponent } from './boss-bar.component';
import { GameService } from '../../core/services/game.service';
import { MOB_TYPES } from '../../core/models/mob.model';

describe('Boss health and inspection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BossBarComponent] }).compileComponents();
  });

  it('shows every living boss, keeps stage notches for the Colossus, and opens the selected bestiary entry', async () => {
    const game = TestBed.inject(GameService);
    for (const id of ['skulker', 'bramble-golem', 'sky-sovereign', 'iron-colossus'] as const)
      game['spawnMob'](id, 1);
    const fixture = TestBed.createComponent(BossBarComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const bars = root.querySelectorAll<HTMLButtonElement>('.boss-bar');
    expect(bars).toHaveLength(3);
    expect(root.querySelectorAll('.boss-notch')).toHaveLength(3);
    expect(bars[0].textContent).toContain(String(MOB_TYPES['bramble-golem'].baseHp));
    bars[0].click();
    expect(game.selectedMob()?.typeId).toBe('bramble-golem');
    expect(game.bestiaryTypeId()).toBe('bramble-golem');
    expect(game.isBestiaryModalOpen()).toBe(true);
    game.mobs.update((mobs) =>
      mobs.map((m) => ({
        ...m,
        isDead: m.typeId === 'bramble-golem',
        hasEscaped: m.typeId === 'sky-sovereign',
      })),
    );
    await fixture.whenStable();
    expect(root.querySelectorAll('.boss-bar')).toHaveLength(1);
    expect(root.textContent).toContain('Iron Colossus');
  });
});
