import { Injectable } from '@angular/core';
import { MapDefinition, Point } from '../models/map.model';

@Injectable({ providedIn: 'root' })
export class PathfindingService {
  /** Smallest sideways bow, in tiles, of a flight path that already crosses the centre. */
  private static readonly MIN_AIR_BOW = 1.2;

  /**
   * Finds the shortest walkable path for ground units using Breadth-First Search.
   * Considers path tiles, spawn, sanctuary, and maze slots that do not have barricades.
   * Starts at the spawn unless `from` is given (used to reroute monsters already marching).
   */
  public findGroundPath(map: MapDefinition, barricades: Set<string>, from?: Point): Point[] | null {
    const spawn = from ?? this.findTile(map, 'S');
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
   * Generates the air corridor for flying mobs, which bypass ground barricades and chasms.
   * The route runs from spawn to sanctuary, bowed sideways toward the board centre and at
   * least deep enough to reach it, so flyers always cross the courtyard. A straight or
   * along-the-line arc would skim the board's rim whenever spawn and sanctuary share an edge.
   */
  public findAirPath(map: MapDefinition): Point[] {
    const spawn = this.findTile(map, 'S') ?? { x: 0, y: 1 };
    const sanctuary = this.findTile(map, 'C') ?? { x: map.width - 2, y: map.height - 2 };

    const dx = sanctuary.x - spawn.x;
    const dy = sanctuary.y - spawn.y;
    const span = Math.hypot(dx, dy) || 1;
    const mid = { x: (spawn.x + sanctuary.x) / 2, y: (spawn.y + sanctuary.y) / 2 };
    // Unit normal to the flight line, turned to face the board centre
    let nx = dy / span;
    let ny = -dx / span;
    const toCentre = ((map.width - 1) / 2 - mid.x) * nx + ((map.height - 1) / 2 - mid.y) * ny;
    if (toCentre < 0) {
      nx = -nx;
      ny = -ny;
    }
    const bow = Math.max(PathfindingService.MIN_AIR_BOW, Math.abs(toCentre));

    // Quadratic Bézier whose apex (t = 0.5) sits `bow` tiles off the straight line
    const control = { x: mid.x + nx * bow * 2, y: mid.y + ny * bow * 2 };
    const at = (t: number): Point => {
      const a = (1 - t) * (1 - t);
      const b = 2 * t * (1 - t);
      const c = t * t;
      return {
        x: a * spawn.x + b * control.x + c * sanctuary.x,
        y: a * spawn.y + b * control.y + c * sanctuary.y,
      };
    };

    // Two waypoints per tile of flight keeps the curve smooth
    let length = 0;
    for (let i = 1; i <= 32; i++) {
      const p = at((i - 1) / 32);
      const q = at(i / 32);
      length += Math.hypot(q.x - p.x, q.y - p.y);
    }
    const steps = Math.max(2, Math.ceil(length * 2));

    const path: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = at(i / steps);
      path.push({
        x: Number(Math.min(map.width - 1, Math.max(0, p.x)).toFixed(2)),
        y: Number(Math.min(map.height - 1, Math.max(0, p.y)).toFixed(2)),
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
