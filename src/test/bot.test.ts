import { expect, it } from 'vitest';
import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome } from '../game/engine/simTypes';
import { DIR_DX, isDiamond, isFalling } from '../game/engine/tiles';
import { stageDefaults } from '../game/levels/stageProfiles';
import { playCave } from './bot';

it('grabs descending diamonds rather than entering underneath the next one', () => {
  const spec = {
    ...stageDefaults(0),
    id: 'caveS',
    paletteId: 'glacier',
    hint: '',
    objective: '',
    mechanics: ['gravity'] as const,
    diamondsRequired: 14,
    timeLimit: 45,
    tickHz: 9,
    magicWallTicks: 360,
    slimePermeability: 0.55,
    // Keep the verified cascading-stack fixture independent of campaign replacements.
    map: [
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'W.P...............W....................W',
      'W......WWW........W.........WWW........W',
      'W......WrW........W.........WrW........W',
      'W......WrW........W.........WrW........W',
      'W......WrW........W.........WrW........W',
      'W......WrW........W.........WrW........W',
      'W......WrW........W.........WrW........W',
      'W......WrW........W.........WrW........W',
      'W.................W....................W',
      'W......WSW........W.........WSW........W',
      'W......W W........W.........W W........W',
      'W......WMW........W.........WMW........W',
      'W....... .........W.......... .........W',
      'WWWWWWW. .WWWWWWWWW.......... .........W',
      'W....... .........W.......... .........W',
      'W....... ..........WWWWWWWWW. .WWWWWWWWW',
      'W....... .................... .........W',
      'W....... .................... .........W',
      'W...d... .................... ....d....W',
      'W....................................E.W',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    ],
  };
  const run = playCave(new CaveSession([spec]));
  expect(run.outcome).toBe(CaveOutcome.Complete);
  const replay = new CaveSession([spec]);
  let avoidedStacks = 0;
  for (const input of run.inputs) {
    const { cave, runtime } = replay.simulation;
    for (const dir of [1, 3] as const) {
      const x = runtime.playerX + DIR_DX[dir];
      const y = runtime.playerY;
      if (isDiamond(cave.get(x, y)) && isFalling(cave.get(x, y - 1))) {
        expect(input.dir !== dir || input.grab).toBe(true);
        avoidedStacks += 1;
      }
    }
    replay.update(replay.tickMs, input);
  }
  expect(avoidedStacks).toBeGreaterThan(0);
  expect(replay.outcome).toBe(CaveOutcome.Complete);
});
