import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveQ: CaveSpec = {
  ...stageDefaults(16),
  paletteId: 'rime',
  hint: 'Cross below the patrol band, then follow the alternating shaft ends.',
  objective: 'Trace the tall zigzag channels and collect thirty gems before climbing out.',
  mechanics: ['digging', 'gravity', 'fireflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W......................................W',
    'W.....wwwwwwwwwwwwwwwwwwwwwwwwwww......W',
    'W.....w  f    f    f    f    f  w......W',
    'W.....w                         w......W',
    'W.....wwwwwwww.wwwwwwwwwwwwwwwwww......W',
    'W.P....................................W',
    'W....w.wwwwwwwwwwwwwwwwwwwww.w.........W',
    'W....w..w.....w.....w.....w..w.........W',
    'W....w..w..w..w..w..w..w..w..w.........W',
    'W....w.dw.dw.dw.dw.dw.dw.dw.dw.........W',
    'W....w..w..w..w..w..w..w..w..w.........W',
    'W....w.dw.dw.dw.dw.dw.dw.dw.dw.........W',
    'W....w..w..w..w..w..w..w..w..w.........W',
    'W....w..w..w..w..w..w..w..w..w.........W',
    'W....w.dw.dw.dw.dw.dw.dw.dw.dw.........W',
    'W....w..w..w..w..w..w..w..w..w.........W',
    'W....w..w..w..w..w..w..w..w..w.........W',
    'W....w.dw.dw.dw.dw.dw.dw.dw.dw.........W',
    'W....w.....w.....w.....w.....w.........W',
    'W....wwwwwwwwwwwwwwwwwwwwwwwww......E..W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
