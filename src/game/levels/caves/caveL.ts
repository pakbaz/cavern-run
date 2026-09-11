import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveL: CaveSpec = {
  ...stageDefaults(11),
  paletteId: 'sulphur',
  hint: 'Follow the nested rails inward. Leave the guard siding closed until you know its rhythm.',
  objective: 'Work through the concentric tracks for all twelve diamonds, then retrace the outer rail.',
  mechanics: ['digging', 'fireflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W......................................W',
    'W.P....................................W',
    'W.wwwwwwwwwwwwwwwwwwwwww...............W',
    'W..d..................dw...............W',
    'W.w.wwwwwwwwwwwwwwwww..w...............W',
    'W.w...d............dw..w...............W',
    'W.w.w.wwwwwwwwwwwww.w..w...............W',
    'W.w.w.w.d........dw.w..w...............W',
    'W.w.w.w.wwwwwwwww.w.w..w...............W',
    'W.w.w.w.w f F f w.w.w..w...............W',
    'W.w.w.w.w       w.w.w..w...............W',
    'W.w.w.w.wwwww.www.w.w..w...............W',
    'W.w.w..d.........dw.w..w...............W',
    'W.w.w.wwwwwwwwwwwww.w..w...............W',
    'W.w.wd.............dw..w...............W',
    'W.w.wwwwwwwwwwwwwwwww..w...............W',
    'W.wd..................dw...............W',
    'W.wwwwwwwwwwwwwwwwwwww.w...............W',
    'W......................E...............W',
    'W......................................W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
