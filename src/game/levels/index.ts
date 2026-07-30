import { caveA } from './caves/caveA';
import { caveB } from './caves/caveB';
import { caveC } from './caves/caveC';
import { caveD } from './caves/caveD';
import { caveE } from './caves/caveE';
import { caveF } from './caves/caveF';
import { caveG } from './caves/caveG';
import { caveH } from './caves/caveH';
import { caveI } from './caves/caveI';
import { caveJ } from './caves/caveJ';
import { caveK } from './caves/caveK';
import { caveL } from './caves/caveL';
import { caveM } from './caves/caveM';
import { caveN } from './caves/caveN';
import { caveO } from './caves/caveO';
import { caveP } from './caves/caveP';
import { caveQ } from './caves/caveQ';
import { caveR } from './caves/caveR';
import { caveS } from './caves/caveS';
import { caveT } from './caves/caveT';
import type { CaveSpec } from './caveFormat';

/**
 * The campaign: twenty original caves, A through T, ordered by difficulty.
 * Layouts, tuning and flavour text are original to Cavern Run.
 */
export const CAVES: readonly CaveSpec[] = [
  caveA,
  caveB,
  caveC,
  caveD,
  caveE,
  caveF,
  caveG,
  caveH,
  caveI,
  caveJ,
  caveK,
  caveL,
  caveM,
  caveN,
  caveO,
  caveP,
  caveQ,
  caveR,
  caveS,
  caveT,
];

export const CAVE_COUNT = CAVES.length;

export function caveAt(index: number): CaveSpec {
  return CAVES[Math.max(0, Math.min(CAVES.length - 1, index))];
}

export { type CaveSpec };
