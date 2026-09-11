import { describe, expect, it } from 'vitest';
import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome, NO_INPUT } from '../game/engine/simTypes';
import { Tile, isButterfly, isCreature, isFirefly } from '../game/engine/tiles';
import { validateCave, type CaveSpec } from '../game/levels/caveFormat';
import { caveB } from '../game/levels/caves/caveB';
import { caveC } from '../game/levels/caves/caveC';
import { caveD } from '../game/levels/caves/caveD';
import { caveF } from '../game/levels/caves/caveF';
import { caveG } from '../game/levels/caves/caveG';
import { caveH } from '../game/levels/caves/caveH';
import { caveI } from '../game/levels/caves/caveI';
import { stageDefaults } from '../game/levels/stageProfiles';
import { playCave, replayCave } from './bot';
import { referenceEarlyRoutes } from './referenceEarlyRoutes';

const stages = [
  [1, caveB], [2, caveC], [3, caveD], [5, caveF],
  [6, caveG], [7, caveH], [8, caveI],
] as const;

function count(spec: CaveSpec, chars: string): number {
  return [...spec.map.join('')].filter((char) => chars.includes(char)).length;
}

describe('individually authored early Level 1 references', () => {
  it.each(stages)('screen index %i preserves its published profile', (index, spec) => {
    const profile = stageDefaults(index);
    for (const key of [
      'id', 'letter', 'name', 'displayLabel', 'stageKind', 'difficulty', 'diamondsRequired',
      'timeLimit', 'diamondValue', 'extraDiamondValue', 'tickHz', 'magicWallTicks',
      'amoebaSlowGrowthTicks',
    ] as const) expect(spec[key]).toBe(profile[key]);
    expect(validateCave(spec)).toEqual([]);
  });

  it('Rooms and Maze occupy the board instead of a narrow steel route', () => {
    for (const spec of [caveB, caveC]) {
      expect(count(spec, 'W')).toBe(120);
      expect(count(spec, 'w')).toBeGreaterThan(95);
      expect(count(spec, '. rd')).toBeGreaterThan(420);
      for (const [x0, y0] of [[1, 1], [20, 1], [1, 11], [20, 11]]) {
        const quarter = spec.map.slice(y0, y0 + 10).map((row) => row.slice(x0, x0 + 19)).join('');
        expect([...quarter].filter((char) => char === 'w').length).toBeGreaterThan(15);
        expect([...quarter].filter((char) => char === 'r').length).toBeGreaterThan(4);
        expect([...quarter].filter((char) => char === 'd').length).toBeGreaterThan(1);
      }
      expect(count(spec, 'afFbBM')).toBe(0);
    }
    expect(count(caveC, 'r')).toBeGreaterThan(65);
  });

  it('Butterflies is an open rock-strewn dirt field with mobile production pockets', () => {
    expect(count(caveD, 'Ww')).toBeLessThan(155);
    expect(count(caveD, '.')).toBeGreaterThan(500);
    expect(count(caveD, 'bB')).toBeGreaterThanOrEqual(4);
    expect(count(caveD, 'r')).toBeGreaterThan(25);
    expect(count(caveD, 'd')).toBeLessThan(caveD.diamondsRequired);
    expect(count(caveD, 'afFM')).toBe(0);
  });

  it('Guards and Firefly Dens use actual fireflies, not butterfly blast locks', () => {
    expect(count(caveF, 'fF')).toBeGreaterThanOrEqual(5);
    expect(count(caveF, '.')).toBeGreaterThan(530);
    expect(count(caveF, 'r')).toBeLessThan(25);
    expect(count(caveG, 'fF')).toBeGreaterThanOrEqual(4);
    expect(count(caveG, 'r')).toBeGreaterThan(45);
    for (const spec of [caveF, caveG]) expect(count(spec, 'bBaM')).toBe(0);
    expect(caveG.map.slice(2, 12).some((row) => /[fF]/.test(row.slice(1, 12)))).toBe(true);
    expect(caveG.map.slice(2, 12).some((row) => /[fF]/.test(row.slice(28, 39)))).toBe(true);
  });

  it('Amoeba has a broad irregular dug field and a real organic objective', () => {
    expect(count(caveH, ' ')).toBeGreaterThan(90);
    expect(count(caveH, 'Ww')).toBeLessThan(195);
    expect(count(caveH, 'r')).toBeGreaterThan(40);
    expect(count(caveH, 'a')).toBeGreaterThan(0);
    expect(count(caveH, 'd')).toBeLessThan(caveH.diamondsRequired);
    expect(count(caveH, 'MbBfF')).toBe(0);
    expect(caveH.amoebaSlowGrowthTicks).toBe(Math.round(75 * caveH.tickHz));
    const colony = caveH.map.flatMap((row, y) => [...row].flatMap((char, x) => char === 'a' ? [[x, y]] : []));
    expect(Math.max(...colony.map(([x]) => x)) - Math.min(...colony.map(([x]) => x))).toBeGreaterThanOrEqual(6);
    expect(Math.max(...colony.map(([, y]) => y)) - Math.min(...colony.map(([, y]) => y))).toBeGreaterThanOrEqual(4);
  });

  it('Enchanted Wall has long barriers threaded through rock-rich galleries', () => {
    expect(count(caveI, 'r')).toBeGreaterThan(65);
    expect(caveI.map.filter((row) => /M{8}/.test(row)).length).toBeGreaterThanOrEqual(3);
    expect(count(caveI, 'd')).toBeLessThan(caveI.diamondsRequired);
    expect(count(caveI, 'abBfF')).toBe(0);
    expect(caveI.magicWallTicks).toBe(Math.round(20 * caveI.tickHz));
  });

  it.each(stages)('screen index %i has a reproducible living normal-input finish', (_, spec) => {
    const session = new CaveSession([spec]);
    const route = referenceEarlyRoutes[spec.id];
    const result = route ? replayCave(session, route) : playCave(session);
    expect(result.outcome).toBe(CaveOutcome.Complete);
    expect(session.simulation.runtime.playerAlive).toBe(true);
    expect(result.diamonds).toBeGreaterThanOrEqual(spec.diamondsRequired);
    expect(result.secondsLeft).toBeGreaterThanOrEqual(10);
    expect(result.eventCounts.playerDied).toBe(0);
    expect(replayCave(new CaveSession([spec]), result.inputs)).toEqual(result);
    if (spec === caveD) expect(result.butterflyExplosions).toBeGreaterThanOrEqual(4);
    if (spec === caveH) {
      expect(result.amoebaDiamondResolutions).toBe(1);
      expect(result.eventCounts.push).toBe(2);
      expect(result.amoebaDiamondResolutionTick).toBeLessThan(caveH.amoebaSlowGrowthTicks);
    }
    if (spec === caveI) {
      const produced = result.events.filter((event) =>
        event.type === 'magicWallConvert' && event.tile === Tile.DiamondFalling).length;
      expect(produced).toBeGreaterThanOrEqual(spec.diamondsRequired - count(spec, 'd'));
    }
  });

  it.each([caveF, caveG])('$name involves nearby moving patrols, safely avoided rather than detonated', (spec) => {
    const route = playCave(new CaveSession([spec])).inputs;
    const session = new CaveSession([spec]);
    const visited = new Set<number>();
    let nearbyTicks = 0;
    let guardedPickups = 0;
    let explosions = 0;
    for (const input of route) {
      const update = session.update(session.tickMs, input);
      const nearby = session.simulation.nearestThreatDistance() <= 3;
      if (nearby) nearbyTicks += 1;
      if (nearby && update.events.some((event) => event.type === 'diamond')) guardedPickups += 1;
      explosions += update.events.filter((event) => event.type === 'explode').length;
      for (const move of session.simulation.cave.moves) {
        if (isFirefly(move.tile)) visited.add(move.toY * 40 + move.toX);
      }
    }
    expect(session.outcome).toBe(CaveOutcome.Complete);
    expect(nearbyTicks).toBeGreaterThanOrEqual(8);
    expect(guardedPickups).toBeGreaterThanOrEqual(1);
    expect(explosions).toBe(0);
    const survivors = session.simulation.cave.countWhere(isFirefly);
    expect(survivors).toBe(count(spec, 'fF'));
    expect(visited.size).toBeGreaterThanOrEqual(survivors * 4);
  });

  it('all butterfly pockets really patrol, and idle play cannot produce their quota', () => {
    const session = new CaveSession([caveD]);
    const visited = new Set<number>();
    for (let tick = 0; tick < 100; tick += 1) {
      const update = session.update(session.tickMs, NO_INPUT);
      expect(update.events.some((event) => event.type === 'explode')).toBe(false);
      for (const move of session.simulation.cave.moves) {
        if (isButterfly(move.tile)) visited.add(move.toY * 40 + move.toX);
      }
    }
    expect(session.simulation.cave.countWhere(isCreature)).toBe(5);
    for (const [x0, y0, x1, y1] of [
      [6, 5, 8, 7], [26, 6, 28, 8], [18, 12, 21, 14], [9, 16, 11, 18], [27, 17, 29, 19],
    ]) {
      expect([...visited].filter((index) => index % 40 >= x0 && index % 40 <= x1 &&
        Math.floor(index / 40) >= y0 && Math.floor(index / 40) <= y1).length).toBeGreaterThanOrEqual(4);
    }
    expect(session.simulation.cave.countTile(Tile.Diamond)).toBe(0);
  });

  it('the unclosed amoeba escapes and turns to stone, not free quota diamonds', () => {
    const session = new CaveSession([caveH]);
    const resolutions: number[] = [];
    for (let tick = 0; tick < 600 && !session.simulation.runtime.amoebaResolved; tick += 1) {
      for (const event of session.update(session.tickMs, NO_INPUT).events) {
        if (event.type === 'amoebaResolved') resolutions.push(event.into);
      }
    }
    expect(resolutions).toEqual([Tile.Boulder]);
    expect(session.simulation.runtime.diamondsCollected).toBe(0);
  });

  it('the organic witness waits only while its deliberately contained colony is still growing', () => {
    const session = new CaveSession([caveH]);
    for (const input of referenceEarlyRoutes.caveH) {
      if (session.simulation.runtime.playerBorn && input.dir === null) {
        expect(session.simulation.runtime.amoebaResolved).toBe(false);
      }
      session.update(session.tickMs, input);
    }
    expect(session.outcome).toBe(CaveOutcome.Complete);
  });
});
