import { WaveDefinition, generateStandardWaves } from './wave.model';

export type TileCode =
  | 'P' // Ground Path
  | 'B' // Build Tile (towers only)
  | 'M' // Maze Slot (path tile where Barricades can be erected to reroute creeps)
  | 'O' // Obstacle (water, trees, chasm)
  | 'S' // Monster Spawn
  | 'C'; // Crystal Sanctuary Altar

export interface Point {
  x: number;
  y: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: 'Novice' | 'Tactician' | 'Master';
  width: number;
  height: number;
  tiles: TileCode[][]; // [row][col] -> [y][x]
  startingGold: number;
  startingCrystals: number;
  waves: WaveDefinition[];
}

// 14 columns x 9 rows grid maps
// P = Path, B = Build, M = Maze Slot, O = Obstacle, S = Spawn, C = Crystal Sanctuary

export const MAP_VERDANT_CROSSROADS: MapDefinition = {
  id: 'verdant-crossroads',
  name: 'Verdant Crossroads',
  subtitle: 'Stage 1 • Emerald Valley',
  description:
    'A winding valley trail through lush highlands. Build vantage towers on ridges and place barricades to detour incoming waves.',
  difficulty: 'Novice',
  width: 14,
  height: 9,
  startingGold: 420,
  startingCrystals: 20,
  tiles: [
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
    ['S', 'P', 'P', 'P', 'B', 'B', 'B', 'P', 'P', 'P', 'P', 'P', 'B', 'B'],
    ['B', 'B', 'B', 'P', 'P', 'P', 'P', 'P', 'B', 'B', 'B', 'P', 'B', 'B'],
    ['B', 'B', 'B', 'P', 'B', 'M', 'B', 'P', 'B', 'B', 'B', 'P', 'B', 'B'],
    ['B', 'B', 'B', 'P', 'P', 'P', 'P', 'P', 'B', 'B', 'B', 'P', 'B', 'B'],
    ['B', 'P', 'P', 'P', 'B', 'B', 'B', 'P', 'B', 'B', 'B', 'P', 'B', 'B'],
    ['B', 'P', 'B', 'P', 'P', 'M', 'P', 'P', 'P', 'B', 'B', 'P', 'B', 'B'],
    ['B', 'P', 'P', 'P', 'B', 'B', 'B', 'B', 'P', 'P', 'P', 'C', 'B', 'B'],
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
  ],
  waves: generateStandardWaves(15, 1.0),
};

export const MAP_SUNKEN_SANCTUM: MapDefinition = {
  id: 'sunken-sanctum',
  name: 'Sunken Sanctum',
  subtitle: 'Stage 2 • Temple of Aether',
  description:
    'An expansive open courtyard with ancient pillars. Utilize light mazing barricades to create a devastating serpentine killzone.',
  difficulty: 'Tactician',
  width: 14,
  height: 9,
  startingGold: 480,
  startingCrystals: 20,
  tiles: [
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
    ['S', 'P', 'P', 'P', 'P', 'P', 'M', 'P', 'P', 'P', 'P', 'P', 'P', 'B'],
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'P', 'B'],
    ['B', 'P', 'P', 'P', 'M', 'P', 'P', 'P', 'P', 'P', 'P', 'B', 'P', 'B'],
    ['B', 'P', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'P', 'B', 'P', 'B'],
    ['B', 'P', 'B', 'P', 'P', 'P', 'P', 'M', 'P', 'B', 'P', 'B', 'P', 'B'],
    ['B', 'P', 'B', 'P', 'B', 'B', 'B', 'B', 'P', 'B', 'P', 'B', 'P', 'B'],
    ['B', 'P', 'P', 'P', 'B', 'B', 'B', 'B', 'P', 'P', 'P', 'P', 'C', 'B'],
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
  ],
  waves: generateStandardWaves(15, 1.25),
};

export const MAP_MOLTEN_CALDERA: MapDefinition = {
  id: 'molten-caldera',
  name: 'Molten Caldera',
  subtitle: 'Stage 3 • Dragonpeak Core',
  description:
    'Brimming with magma pits and sky corridors. Flying horrors glide straight across the lava while ground creeps march the perimeter.',
  difficulty: 'Master',
  width: 14,
  height: 9,
  startingGold: 540,
  startingCrystals: 20,
  tiles: [
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
    ['S', 'P', 'P', 'P', 'P', 'B', 'B', 'B', 'B', 'P', 'P', 'P', 'P', 'B'],
    ['B', 'P', 'B', 'B', 'P', 'B', 'O', 'O', 'B', 'P', 'B', 'B', 'P', 'B'],
    ['B', 'P', 'B', 'B', 'P', 'O', 'O', 'O', 'O', 'P', 'B', 'B', 'P', 'B'],
    ['B', 'P', 'M', 'P', 'P', 'O', 'O', 'O', 'O', 'P', 'P', 'M', 'P', 'B'],
    ['B', 'B', 'B', 'B', 'P', 'O', 'O', 'O', 'O', 'P', 'B', 'B', 'B', 'B'],
    ['B', 'B', 'B', 'B', 'P', 'B', 'O', 'O', 'B', 'P', 'B', 'B', 'B', 'B'],
    ['B', 'B', 'B', 'B', 'P', 'P', 'P', 'P', 'P', 'P', 'B', 'B', 'C', 'B'],
    ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
  ],
  waves: generateStandardWaves(15, 1.5),
};

export const ALL_MAPS: MapDefinition[] = [
  MAP_VERDANT_CROSSROADS,
  MAP_SUNKEN_SANCTUM,
  MAP_MOLTEN_CALDERA,
];
