import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveT: CaveSpec = {
  ...stageDefaults(19),
  paletteId: 'glacier',
  hint: 'Release the stack once; keep the outlet clear, then collect its six diamonds.',
  objective: 'Empty the miniature hopper through a three-second magic wall.',
  mechanics: ['gravity', 'magic-wall'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW.......................W',
    'WW    WrW      W.......................W',
    'WW P  WrW      W.......................W',
    'WW    WrW      W.......................W',
    'WW    WrW      W.......................W',
    'WW    WrW      W.......................W',
    'WW    WrW      W.......................W',
    'WW     .       W.......................W',
    'WW    WMW      W.......................W',
    'WW             W.......................W',
    'WW             W.......................W',
    'WW             W.......................W',
    'WW             W.......................W',
    'WW             W.......................W',
    'WW             W.......................W',
    'WW           E W.......................W',
    'WW             W.......................W',
    'WWWWWWWWWWWWWWWW.......................W',
    'W......................................W',
    'W......................................W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
