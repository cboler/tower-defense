import { Injectable } from '@angular/core';
import { MapDefinition, Point } from '../models/map.model';

@Injectable({ providedIn: 'root' })
export class PathfindingService {
  /**
   * Finds the shortest walkable path for ground units using Breadth-First Search.
   * Considers path tiles, spawn, sanctuary, and maze slots that do not have barricades.
   */
  public findGroundPath(map: MapDefinition, barricades: Set<string>): Point[] | null {
    const spawn = this.findTile(map, 'S');
    const sanctuary = this.findTile(map, 'C');

    if (!spawn || !sanctuary) return null;

    const queue: Point[] = [spawn];
    const visited = new Set<string>([`${spawn.x},${spawn.y}`]);
    const parentMap = new Map<string, Point>();

    const directions = [
      { x: 0, y: -1 }, // up
      { x: 1, y: 0 }, // right
      { x: 0, y: 1 }, // down
      { x: -1, y: 0 }, // left
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.x === sanctuary.x && current.y === sanctuary.y) {
        // Reconstruct path
        const path: Point[] = [];
        let curr: Point | undefined = current;
        while (curr) {
          path.unshift(curr);
          curr = parentMap.get(`${curr.x},${curr.y}`);
        }
        return path;
      }

      for (const dir of directions) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const key = `${nx},${ny}`;

        if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height && !visited.has(key)) {
          const tile = map.tiles[ny][nx];
          const isBarricaded = barricades.has(key);

          // Walkable ground tiles:
          // 'P' (Path), 'S' (Spawn), 'C' (Sanctuary)
          // 'M' (Maze slot only if not barricaded)
          const isWalkable =
            tile === 'P' || tile === 'S' || tile === 'C' || (tile === 'M' && !isBarricaded);

          if (isWalkable) {
            visited.add(key);
            parentMap.set(key, current);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }

    return null; // No path found (blocked)
  }

  /**
   * Generates a direct or semi-direct air corridor for flying mobs.
   * Flying mobs can bypass ground barricades and chasms directly.
   */
  public findAirPath(map: MapDefinition): Point[] {
    const spawn = this.findTile(map, 'S') ?? { x: 0, y: 1 };
    const sanctuary = this.findTile(map, 'C') ?? { x: map.width - 2, y: map.height - 2 };

    // Linear interpolation path for flying units
    const steps = Math.max(Math.abs(sanctuary.x - spawn.x), Math.abs(sanctuary.y - spawn.y)) * 2;
    const path: Point[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Slight arc for aesthetic flying trajectory
      const arc = Math.sin(t * Math.PI) * -1.2;
      path.push({
        x: Number((spawn.x + (sanctuary.x - spawn.x) * t).toFixed(2)),
        y: Number((spawn.y + (sanctuary.y - spawn.y) * t + arc).toFixed(2)),
      });
    }

    return path;
  }

  /**
   * Validates if placing a barricade on a maze slot preserves at least one valid path.
   * Light mazing rule: player cannot completely wall off the crystals.
   */
  public canPlaceBarricade(
    map: MapDefinition,
    existingBarricades: Set<string>,
    x: number,
    y: number,
  ): boolean {
    const tile = map.tiles[y]?.[x];
    if (tile !== 'M') return false;

    const hypothetical = new Set(existingBarricades);
    hypothetical.add(`${x},${y}`);

    const path = this.findGroundPath(map, hypothetical);
    return path !== null && path.length > 0;
  }

  public findTile(map: MapDefinition, code: string): Point | null {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x] === code) {
          return { x, y };
        }
      }
    }
    return null;
  }
}
