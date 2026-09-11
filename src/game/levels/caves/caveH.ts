import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Amoeba: a broad organic basin opens west into irregular, already-dug ground. */
export const caveH: CaveSpec = {
  ...stageDefaults(7),
  paletteId: 'verdant',
  hint: 'Push the west stone across the breach; enter from below only after the green turns.',
  objective: 'Contain the spreading colony, then mine fifteen diamonds from its broad basin.',
  mechanics: ['digging', 'gravity', 'boulder-pushing', 'amoeba'],
  amoebaSlowGrowthChance: 0.03,
  amoebaGrowthChance: 0.3,
  amoebaMaxSize: 180,
  pushChance: 1,
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.  rr.      ..r. .r..  .   ....rr.....W',
    'W.r .   . .r ..    . ..r .  ...r.......W',
    'W... ...r....  ...r.rr...   ...r..  ...W',
    'W...r...  .....r.......   ...r......r..W',
    'W..  ...r...r...  ......r..  ....r.....W',
    'W.r....  .........wwwww....r...  ......W',
    'W....r....  ....wwaaaaaww....r...r.....W',
    'W.. ...r.......w..aaaaaaaw........r....W',
    'W...r.......w.w......aaa..w..r...  ....W',
    'W.  ......P.r  .......aaaaaw...r.......W',
    'W.....r.....www......aaaaaww.....r.....W',
    'W..r....  .....wwaaaaaaaww...r...  ....W',
    'W......r...  ....wwwwdww.... ...r......W',
    'W...r......r..... .......r....r.....r..W',
    'W.r...  .....r.....   .....r..... .....W',
    'W... ...r.....  .r....r.......r..r.....W',
    'W.....r...r.......   ...r.......  .....W',
    'W..r.      ....r. ..r..   ..r.   ..r...W',
    'W....r.....r....  .....r........r......W',
    'W.. ...  .....r......  ...r... ......E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
