import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameService } from './game.service';
import { MAP_VERDANT_CROSSROADS } from '../models/map.model';

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameService);
    service.loadMap(MAP_VERDANT_CROSSROADS);
  });

  it('initializes with starting gold, crystals, and paths', () => {
    expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold);
    expect(service.crystals()).toBe(20);
    expect(service.groundPath().length).toBeGreaterThan(0);
    expect(service.airPath().length).toBeGreaterThan(0);
  });

  it('places a Blade Warden on a build tile when sufficient gold is available', () => {
    // Coordinate (0, 0) is 'B' (Build)
    const success = service.placeTower(0, 0, 'blade-warden');
    expect(success).toBe(true);
    expect(service.towers().length).toBe(1);
    expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold - 100);
  });

  it('rejects tower placement on path tiles', () => {
    // Coordinate (1, 1) is 'P' (Path)
    const success = service.placeTower(1, 1, 'blade-warden');
    expect(success).toBe(false);
    expect(service.towers().length).toBe(0);
  });

  it('upgrades a placed tower and deducts gold', () => {
    service.placeTower(0, 0, 'blade-warden');
    const tower = service.towers()[0];

    const upgradeSuccess = service.upgradeTower(tower.id);
    expect(upgradeSuccess).toBe(true);

    const upgradedTower = service.towers()[0];
    expect(upgradedTower.level).toBe(2);
    expect(upgradedTower.totalInvested).toBe(220); // 100 + 120
  });

  it('sells a tower with 70% refund', () => {
    service.placeTower(0, 0, 'blade-warden');
    const goldBeforeSell = service.gold();
    const tower = service.towers()[0];

    service.sellTower(tower.id);
    expect(service.towers().length).toBe(0);
    expect(service.gold()).toBe(goldBeforeSell + 70); // 70% of 100
  });

  it('places an Aether Barricade on a maze slot and recalculates paths', () => {
    // Maze slot at (5, 3) on Verdant Crossroads
    const success = service.placeTower(5, 3, 'barricade');
    expect(success).toBe(true);
    expect(service.barricades().has('5,3')).toBe(true);
  });

  it('cycles game speed between 1x, 2x, and 4x', () => {
    expect(service.gameSpeed()).toBe(1);
    service.cycleSpeed();
    expect(service.gameSpeed()).toBe(2);
    service.cycleSpeed();
    expect(service.gameSpeed()).toBe(4);
    service.cycleSpeed();
    expect(service.gameSpeed()).toBe(1);
  });
});
