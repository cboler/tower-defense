import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BossBarComponent } from './boss-bar.component';
import { GameService } from '../../core/services/game.service';
import { MOB_TYPES } from '../../core/models/mob.model';

describe('Boss health and inspection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BossBarComponent] }).compileComponents();
  });

  it('shows only living super bosses, with stage notches, and opens the selected bestiary entry', async () => {
    const game = TestBed.inject(GameService);
    for (const id of ['skulker', 'bramble-golem', 'sky-sovereign', 'iron-colossus'] as const)
      game['spawnMob'](id, 1);
    const fixture = TestBed.createComponent(BossBarComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const bars = root.querySelectorAll<HTMLButtonElement>('.boss-bar');
    expect(bars).toHaveLength(1);
    expect(root.querySelectorAll('.boss-notch')).toHaveLength(3);
    expect(bars[0].textContent).toContain('Iron Colossus');
    expect(bars[0].textContent).toContain(String(MOB_TYPES['iron-colossus'].baseHp));
    bars[0].click();
    expect(game.selectedMob()?.typeId).toBe('iron-colossus');
    expect(game.bestiaryTypeId()).toBe('iron-colossus');
    expect(game.isBestiaryModalOpen()).toBe(true);
    game.mobs.update((mobs) => mobs.map((m) => ({ ...m, isDead: m.typeId === 'iron-colossus' })));
    await fixture.whenStable();
    expect(root.querySelectorAll('.boss-bar')).toHaveLength(0);
  });
});
