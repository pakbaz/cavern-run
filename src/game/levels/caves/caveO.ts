import { DEFAULT_TUNING } from '../../engine/simTypes';
import type { CaveSpec } from '../caveFormat';

/**
 * O — Amoeba Bloom. The bloom is sealed in its vault: it swells to fill the
 * glass, hits its ceiling and petrifies, and there is nothing you can do about
 * it. The quota is out here in the ring, so mine while the show is on.
 */
export const caveO: CaveSpec = {
  ...DEFAULT_TUNING,
  id: 'caveO',
  letter: 'O',
  name: 'Amoeba Bloom',
  paletteId: 'sulphur',
  hint: 'The bloom is walled in. Work the ring while it turns itself to stone.',
  diamondsRequired: 24,
  diamondValue: 14,
  extraDiamondValue: 35,
  timeLimit: 155,
  tickHz: 8,
  amoebaSlowGrowthTicks: 60,
  amoebaGrowthChance: 0.24,
  amoebaMaxSize: 90,
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W....r.d................rdd..........d.W',
    'W.P....d.......d.....................d.W',
    'W...r........r.....d.......r....dd.....W',
    'W..d.......d..........d........d.......W',
    'W....wwwwwwwwwwwwwwwwwwwwwwwwwwwwww....W',
    'Wd...w  r   r   r   r   r   r   r w....W',
    'W..d.w                            w..d.W',
    'W....w      a                     w.d..W',
    'W....w                            w...rW',
    'W..d.w                            w....W',
    'W....w           a                w..d.W',
    'W.d..w                            w....W',
    'W....w                            wd...W',
    'W...dw                            w....W',
    'W.r..w                            w.d..W',
    'W....wwwwwwwwwwwwwwwwwwwwwwwwwwwwww....W',
    'W......r.......d................d......W',
    'W.......d.........r...d........r....d..W',
    'W...d..........d..........d............W',
    'W.......d..................d.........E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
