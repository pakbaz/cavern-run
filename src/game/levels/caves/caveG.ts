import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Firefly Dens: opposed side galleries spill into a stony central crossing. */
export const caveG: CaveSpec = {
  ...stageDefaults(6),
  paletteId: 'verdant',
  hint: 'The side tunnels belong to the fireflies. Cross their mouths, not their paths.',
  objective: 'Collect four diamonds along the central passage and escape through the lower field.',
  mechanics: ['digging', 'gravity', 'fireflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'Wwwwwwwwwww....r..P...r.....wwwwwwwwwwwW',
    'W       F  ..r.......r..r...  F        W',
    'W    www   d.r....r......r..   www     W',
    'Wwwwwwwwwww......r...r......wwwwwwwwwwwW',
    'W.....r........r.....r..r..............W',
    'Wwww..wwwww...r...r........wwwww..wwwwwW',
    'W       F  .....r.....r...d  F         W',
    'W      ww  ..r.....r....r... ww        W',
    'Wwwwwwwwwww....r.r......r...wwwwwwwwwwwW',
    'W............r.....r..r................W',
    'W       F  d.r..........r..  F         W',
    'W   wwww   ....r...r..r....   wwww     W',
    'Wwwwwwwwwww..r......r.......wwwwwwwwwwwW',
    'W.....r..........r..............r......W',
    'W..r......r..r........r...r.........r..W',
    'W.................r.........r..........W',
    'W....r.......r.........r.........r.....W',
    'W.......r.........d........r...........W',
    'W..r.........r........r...........r....W',
    'W....................................E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
