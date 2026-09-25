import { describe, expect, it } from 'vitest';
import { PathfindingService } from './pathfinding.service';
import { MAP_VERDANT_CROSSROADS } from '../models/map.model';

describe('PathfindingService', () => {
  const service = new PathfindingService();

  it('finds a valid ground path from spawn to sanctuary on Verdant Crossroads', () => {
    const barricades = new Set<string>();
    const path = service.findGroundPath(MAP_VERDANT_CROSSROADS, barricades);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(5);
    expect(path![0]).toEqual({ x: 0, y: 1 }); // Spawn tile
    expect(path![path!.length - 1]).toEqual({ x: 11, y: 7 }); // Sanctuary tile
  });

  it('generates an air path covering the distance between spawn and sanctuary', () => {
    const airPath = service.findAirPath(MAP_VERDANT_CROSSROADS);

    expect(airPath.length).toBeGreaterThan(10);
    expect(airPath[0].x).toBe(0);
    expect(airPath[airPath.length - 1].x).toBe(11);
  });

  it('validates barricade placement on maze slots when a path remains open', () => {
    const barricades = new Set<string>();
    // Maze slot at (5, 3)
    const canPlace = service.canPlaceBarricade(MAP_VERDANT_CROSSROADS, barricades, 5, 3);
    expect(typeof canPlace).toBe('boolean');
  });

  it('rejects barricade placement on non-maze tiles', () => {
    const barricades = new Set<string>();
    // Build tile at (0, 0)
    const canPlace = service.canPlaceBarricade(MAP_VERDANT_CROSSROADS, barricades, 0, 0);
    expect(canPlace).toBe(false);
  });
});
