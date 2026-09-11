import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveE: CaveSpec = {
  ...stageDefaults(4),
  paletteId: 'rust',
  hint: 'Wait for the butterfly to cross the drop, then pull the support from the side.',
  objective: 'Make six diamonds in the small open arena and reach its corner exit.',
  mechanics: ['gravity', 'butterflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWW...................W',
    'WW        r        W...................W',
    'WW P      .        W...................W',
    'WW                 W...................W',
    'WW                 W...................W',
    'WW                 W...................W',
    'WW                 W...................W',
    'WW                 W...................W',
    'WW        b        W...................W',
    'WW                EW...................W',
    'WWWWWWWWWWWWWWWWWWWW...................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
