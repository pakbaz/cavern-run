import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveM: CaveSpec = {
  ...stageDefaults(12),
  paletteId: 'rust',
  hint: 'Six gems, crowded rooms. Time a roof release over a butterfly, then clear the blast.',
  objective: 'Use the crowded patrols to produce gems and cross the rubble chambers to the exit.',
  mechanics: ['gravity', 'digging', 'fireflies', 'butterflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.P......w............w................W',
    'W.rr.rrr.w.rr.rr.rrr..w..rr.rr.rrr.....W',
    'W...rr.r.w...rr.r.rr..w...rr.r.rr......W',
    'W.rr...r.w.rr...r..r..w.rr...rr.r......W',
    'W..r.....w......r.....w.......r........W',
    'W........w.rr..r...r..w.r.rr.....rr....W',
    'W.. b  ..w.     B  ...w..   f   .......W',
    'W..    ..w.        ...w..       .......W',
    'W...r.r..w...r.r.rr...w..r.r..r.rr.....W',
    'W......................................W',
    'W.wwwwwwwwwww.wwwwwwwwwww.wwwwwwwww....W',
    'W.rr.rrr....w.rr.rr.rr..w.rr.rr.rr.....W',
    'W...rr.r....w...rr.r....w...rr.r.......W',
    'W.rr...r....w.rr...rr...w.rr...rr......W',
    'W......r....w......r....w......r.......W',
    'W.rr..r.....w.rr..r.....w.rr..r........W',
    'W.    F   ..w.   b    ..w.    F   .....W',
    'W.        ..w.        ..w.        .....W',
    'W......................................W',
    'W...................................E..W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
