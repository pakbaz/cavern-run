import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveN: CaveSpec = {
  ...stageDefaults(13),
  paletteId: 'rust',
  hint: 'The living strips close behind you. Sweep each vertical lane in one direction.',
  objective: 'Collect nineteen gems while alternating between the masonry and growing walls.',
  mechanics: ['gravity', 'digging', 'expanding-wall'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W......................................W',
    'W..P...................................W',
    'W.....w..r..H.....w..r..H.....w..r..H..W',
    'W...r.wr..rdHr..r.wr..rdHr..r.wr..rdH..W',
    'W.rd.rw.r...H.rd.rw.r...H.rd.rw.r...H..W',
    'W.....w..r..H.....w..r..H.....w..r..H..W',
    'W...r.wr..r.Hr..r.wr..r.Hr..r.wr..r.H..W',
    'W.r..rw.r...H.r..rw.r...H.r..rw.r...H..W',
    'W.....w..r.dH.....w..r.dH.....w..r.dH..W',
    'W..dr.wr..r.Hr.dr.wr..r.Hr.dr.wr..r.H..W',
    'W.r..rw.r...H.r..rw.r...H.r..rw.r...H..W',
    'W.....w..r..H.....w..r..H.....w..r..H..W',
    'W...r.wr..r.Hr..r.wr..r.Hr..r.wr..r.H..W',
    'W.r..rw.r..dH.r..rw.r..dH.r..rw.r..dH..W',
    'W.....w..r..H.....w..r..H.....w..r..H..W',
    'W..dr.wr..r.Hr.dr.wr..r.Hr.dr.wr..r.H..W',
    'W.r..rw.r...H.r..rw.r...H.r..rw.r...H.dW',
    'W.....w..r..H.....w..r..H.....w..r..H..W',
    'W......................................W',
    'W.....................................EW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
