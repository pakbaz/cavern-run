import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveO: CaveSpec = {
  ...stageDefaults(14),
  paletteId: 'ember',
  hint: 'Enter the floor seam at the left; return through the same gap after the wall grows.',
  objective: 'Sweep fourteen floor diamonds beneath the growing wall, then escape above it.',
  mechanics: ['gravity', 'expanding-wall'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWW................W',
    'WW                    W................W',
    'WW    P               W................W',
    'WW                    W................W',
    'WW                    W................W',
    'WW                    W................W',
    'WW                  E W................W',
    'WW                    W................W',
    'WW .               HW W................W',
    'WW  dddddddddddddd    W................W',
    'WW WWWWWWWWWWWWWWWWWW W................W',
    'WWWWWWWWWWWWWWWWWWWWWWW................W',
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
