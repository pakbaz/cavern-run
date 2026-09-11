import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Enchanted Wall: long, offset magic seams divide branching rock galleries. */
export const caveI: CaveSpec = {
  ...stageDefaults(8),
  paletteId: 'verdant',
  hint: 'Cut a run of supports before collecting: all enchanted seams share twenty seconds.',
  objective: 'Feed ten or more stones through the long magic walls and collect below them.',
  mechanics: ['gravity', 'magic-wall'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.P....r.......r....w...r.r.......r....W',
    'W..r.r.r.r.r.r.r.r..w.r....r..r........W',
    'W...................w...wwww...r...r...W',
    'W..MMMMMMMMMMMMMMM......w....r.........W',
    'W..               ..r...w.r....r.......W',
    'W..               ..........r.....r....W',
    'W................r...r.r.r.r.r.r.r.....W',
    'W...r...wwww..r........................W',
    'W.r.......w........MMMMMMMMMMMMMMMM....W',
    'W....r....w..r..r..                ....W',
    'W.r.....r..........                ....W',
    'W...r...........r......................W',
    'W......r.r.r.r.r.r.r..w.r....r....r....W',
    'W.r..................w...r.....r.......W',
    'W.....MMMMMMMMMMMMMM.w.r...wwww........W',
    'W.r...              .w.........r..r....W',
    'W...r.              ....r....r.........W',
    'W.........r....r.........wwww....r.....W',
    'W...r..r....r....r...r........r........W',
    'W....................................E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
