import { describe, expect, it } from 'vitest';
import { ALL_MAPS, MapDefinition } from './map.model';
import { PathfindingService } from '../services/pathfinding.service';

const pathfinding = new PathfindingService();
const WALKABLE = new Set(['P', 'S', 'C', 'M']);

function tilesOf(map: MapDefinition, code: string): string[] {
  const keys: string[] = [];
  map.tiles.forEach((row, y) => row.forEach((t, x) => t === code && keys.push(`${x},${y}`)));
  return keys;
}

/** Walkable tiles monsters can reach from the spawn without first passing the crystal. */
function reachableBeforeCrystal(map: MapDefinition): Set<string> {
  const spawn = tilesOf(map, 'S')[0];
  const seen = new Set([spawn]);
  const queue = [spawn];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!.split(',').map(Number);
    if (map.tiles[y][x] === 'C') continue;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const key = `${x + dx},${y + dy}`;
      if (!seen.has(key) && WALKABLE.has(map.tiles[y + dy]?.[x + dx])) {
        seen.add(key);
        queue.push(key);
      }
    }
  }
  return seen;
}

describe.each(ALL_MAPS.map((map) => [map.name, map] as const))('%s layout', (_, map) => {
  it('is a 14x9 grid with one spawn and one crystal', () => {
    expect(map.tiles.length).toBe(map.height);
    map.tiles.forEach((row) => expect(row.length).toBe(map.width));
    expect(tilesOf(map, 'S').length).toBe(1);
    expect(tilesOf(map, 'C').length).toBe(1);
  });

  it('has an open ground route from spawn to crystal', () => {
    expect(pathfinding.findGroundPath(map, new Set())).not.toBeNull();
  });

  it('has no dead road that monsters can never walk', () => {
    const reachable = reachableBeforeCrystal(map);
    const walkable = [...tilesOf(map, 'P'), ...tilesOf(map, 'M')];
    expect(walkable.filter((k) => !reachable.has(k))).toEqual([]);
  });

  it('lets every maze slot be barricaded, and each one lengthens the march', () => {
    const open = pathfinding.findGroundPath(map, new Set())!.length;
    const slots = tilesOf(map, 'M');
    expect(slots.length).toBeGreaterThan(0);

    for (const slot of slots) {
      const [x, y] = slot.split(',').map(Number);
      expect(pathfinding.canPlaceBarricade(map, new Set(), x, y)).toBe(true);
      expect(pathfinding.findGroundPath(map, new Set([slot]))!.length).toBeGreaterThan(open);
    }

    // Light mazing: even with every slot walled off, a route remains
    const all = pathfinding.findGroundPath(map, new Set(slots));
    expect(all).not.toBeNull();
    expect(all!.length).toBeGreaterThan(open);
  });
});
