import { DEFAULT_TUNING } from '../engine/simTypes';
import type { CaveSpec } from './caveFormat';

export const STAGE_REFERENCE_URL = 'https://www.boulder-dash.nl/down/maps/PeterLiepa/BoulderDash01.html';

// Published Level 1 numeric settings, in the page's screen order. Layouts are original.
const SETTINGS = [
  ['Intro', 'CAVE A', 12, 150, 10, 15, 0, 0],
  ['Rooms', 'CAVE B', 10, 150, 20, 50, 0, 0],
  ['Maze', 'CAVE C', 24, 150, 15, 0, 0, 0],
  ['Butterflies', 'CAVE D', 36, 120, 5, 20, 0, 0],
  ['Intermission 1', 'INTERMISSION 1', 6, 10, 30, 0, 0, 0],
  ['Guards', 'CAVE E', 4, 150, 50, 90, 0, 0],
  ['Firefly Dens', 'CAVE F', 4, 150, 40, 60, 0, 0],
  ['Amoeba', 'CAVE G', 15, 120, 10, 20, 0, 75],
  ['Enchanted Wall', 'CAVE H', 10, 120, 10, 20, 20, 0],
  ['Intermission 2', 'INTERMISSION 2', 16, 15, 10, 0, 0, 0],
  ['Greed', 'CAVE I', 75, 150, 5, 10, 0, 0],
  ['Tracks', 'CAVE J', 12, 150, 25, 60, 0, 0],
  ['Crowd', 'CAVE K', 6, 120, 50, 0, 0, 0],
  ['Walls', 'CAVE L', 19, 180, 20, 0, 0, 0],
  ['Intermission 3', 'INTERMISSION 3', 14, 20, 10, 0, 0, 0],
  ['Apocalypse', 'CAVE M', 50, 160, 5, 8, 0, 140],
  ['Zigzag', 'CAVE N', 30, 150, 10, 20, 0, 0],
  ['Funnel', 'CAVE O', 15, 120, 10, 20, 8, 0],
  ['Enchanted Boxes', 'CAVE P', 12, 150, 10, 20, 20, 0],
  ['Intermission 4', 'INTERMISSION 4', 6, 20, 30, 0, 3, 0],
] as const;

const TIERS = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5] as const;
const SPEEDS = [6.5, 6.75, 7, 7.25, 7.25, 7.5, 7.5, 7.75, 7.75, 8, 8, 8.25, 8.25, 8.5, 8.5, 8.5, 8.75, 9, 9, 9.25] as const;

export type StageDefaults = Omit<CaveSpec, 'map' | 'paletteId' | 'hint' | 'objective' | 'mechanics'>;

export function stageDefaults(index: number): StageDefaults {
  const settings = SETTINGS[index];
  if (!Number.isInteger(index) || !settings) throw new Error(`Invalid reference stage: ${index}`);
  const [name, displayLabel, diamondsRequired, timeLimit, diamondValue, extraDiamondValue, magicSeconds, amoebaSeconds] = settings;
  const tickHz = SPEEDS[index];
  const letter = String.fromCharCode(65 + index);
  return {
    ...DEFAULT_TUNING,
    id: `cave${letter}`,
    letter,
    name,
    displayLabel,
    stageKind: displayLabel.startsWith('INTERMISSION') ? 'intermission' : 'cave',
    difficulty: TIERS[index],
    diamondsRequired,
    timeLimit,
    diamondValue,
    extraDiamondValue,
    tickHz,
    magicWallTicks: magicSeconds ? Math.round(magicSeconds * tickHz) : DEFAULT_TUNING.magicWallTicks,
    amoebaSlowGrowthTicks: amoebaSeconds ? Math.round(amoebaSeconds * tickHz) : DEFAULT_TUNING.amoebaSlowGrowthTicks,
  };
}
