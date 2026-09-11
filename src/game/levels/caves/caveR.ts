import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveR: CaveSpec = {
  ...stageDefaults(17),
  paletteId: 'glacier',
  hint: 'Eight seconds of charge: release the loaded throat before collecting below the funnel.',
  objective: 'Feed the broad rockfall through the magic throat and recover fifteen converted gems.',
  mechanics: ['gravity', 'magic-wall'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W..r....r.r.r.r....r.r.r.r....r.r.r.r..W',
    'W.r.r.r....r.r.r.r....r.r.r.r....r.r.r.W',
    'W..rwr.r.r....r.r.r.r....r.r.r.r...wr..W',
    'W....wr.r.r.r....r.r.r.r....r.r.r.w....W',
    'W.r.r.w..r.r.r.r....r.r.r.r....r.w.r.r.W',
    'W..r.r.w....r.r.r.r....r.r.r.r..w.r.r..W',
    'W...r.r.w.r....r.r.r.r....r.r.rwr....r.W',
    'W.r....r.w.r.r....r.r.r.r....rwr.r.r...W',
    'W..r.r....w..................w..r.r.r..W',
    'W.......MMM.rrrrrrrrrrrrrrrrMMM........W',
    'W..........P...........................W',
    'W...........MMMMMMMMMMMMMMMM...........W',
    'W..........w                w..........W',
    'W...........w              w...........W',
    'W........... w            w ...........W',
    'W...........  w          w  ...........W',
    'W..............w........w..............W',
    'W......................................W',
    'W..................................E...W',
    'W......................................W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
