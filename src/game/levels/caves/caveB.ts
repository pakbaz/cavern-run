import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Rooms: offset doorways connect small masonry rooms across the entire board. */
export const caveB: CaveSpec = {
  ...stageDefaults(1),
  paletteId: 'glacier',
  hint: 'Read the doorways before digging below a room full of loose stone.',
  objective: 'Collect ten diamonds while threading the interconnected masonry rooms.',
  mechanics: ['digging', 'gravity'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.P....r.w...r....w.r.......w....r.....W',
    'W...d....w.....d..w....d....w.......d..W',
    'W..r.....w.r......w......r..w..r.......W',
    'W......................................W',
    'Wwww..wwwwwwww..wwwww..wwwwwwwwww..wwwwW',
    'W...r....w..r.....w....r....w..r.......W',
    'W.d...r..w.....d..w.d.......w......d...W',
    'W...........r...........r........r.....W',
    'W.....r..w........w.r......w...........W',
    'Www..wwwwww..wwwwwwwwww..wwwww..wwwwwwwW',
    'W..r.....w...d..r.w..r......w....r.....W',
    'W.....d..w.r......w.....d...w.d........W',
    'W......................................W',
    'W.r......w....r...w.r.......w..r....d..W',
    'Wwwww..wwwww..wwwwww..wwwwwwwwwww..wwwwW',
    'W...r....w.r......w....r....w.r........W',
    'W.d......w....d...w.d.......w....d.....W',
    'W......r......r........r..........r....W',
    'W..r.....w........w......r..w..........W',
    'W........w........w.........w........E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
