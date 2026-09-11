import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Maze: broken, branching masonry threads a dense stone-and-diamond field. */
export const caveC: CaveSpec = {
  ...stageDefaults(2),
  paletteId: 'rime',
  hint: 'The shortest-looking branch may be the one holding up the most rocks.',
  objective: 'Find twenty-four diamonds among the maze branches, then reach the far lift.',
  mechanics: ['digging', 'gravity'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.P.r..d....w..r...d....w..r...d....r..W',
    'W.r.wwww.r..w....rr.ww..w....w..r.w....W',
    'W.r.w....d..www..d......w.d..w....w.rd.W',
    'W.d.w.r..w.....r.w.r.r....r..wwww.w....W',
    'W...w....wwwww...w....ww..w....r..w.r..W',
    'W.r...r..d...r...w.d.....rw.d..r..w..d.W',
    'W..wwwwww..w.....www..r..wwwww..r......W',
    'W..w.r.....w.r.d.....r...d....w...r.w..W',
    'W.d...r.w..w...www..www......w.d...w.r.W',
    'W..r....w..w.r.......w..r.r..wwww..w...W',
    'Wwwww...w..r..d..r...w.d........r..w.d.W',
    'W.r.d...wwww..www..r.w...wwwww..r......W',
    'W...r.r....w......d..w.r.w...d...wwww..W',
    'W..www..r..w..r.r....w...w.r.....w.r...W',
    'W.d..w.....w....wwww...r...d..r..w....dW',
    'W.r..w.r.d...r..w...r..wwwww..w..w.....W',
    'W.r..wwwww..w...w.d.......r..w....r.w..W',
    'W..r.....d..w.r....r..d.w....w.d....w..W',
    'W..w.r.r....www..ww.www.w.r..wwwww..w..W',
    'W..w....d.r.....r....d.w....r........E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
