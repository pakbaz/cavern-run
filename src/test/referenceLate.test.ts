import { describe, expect, it } from 'vitest';
import { PALETTES } from '../config';
import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome, NO_INPUT } from '../game/engine/simTypes';
import { isCreature, Tile } from '../game/engine/tiles';
import { type CaveSpec, validateCave } from '../game/levels/caveFormat';
import { caveK } from '../game/levels/caves/caveK';
import { caveL } from '../game/levels/caves/caveL';
import { caveM } from '../game/levels/caves/caveM';
import { caveN } from '../game/levels/caves/caveN';
import { caveP } from '../game/levels/caves/caveP';
import { caveQ } from '../game/levels/caves/caveQ';
import { caveR } from '../game/levels/caves/caveR';
import { caveS } from '../game/levels/caves/caveS';
import { stageDefaults } from '../game/levels/stageProfiles';
import { playCave, replayCave } from './bot';
import { referenceLateRoutes } from './referenceLateRoutes';

const stages = [
  [10, caveK], [11, caveL], [12, caveM], [13, caveN],
  [15, caveP], [16, caveQ], [17, caveR], [18, caveS],
] as const;
const count = (spec: CaveSpec, chars: string) =>
  [...spec.map.join('')].filter((char) => chars.includes(char)).length;

describe('independently authored late reference stages', () => {
  it.each(stages)('screen index %i retains its published profile and sealed canvas', (index, spec) => {
    const defaults = stageDefaults(index);
    for (const key of [
      'id', 'letter', 'name', 'displayLabel', 'stageKind', 'difficulty',
      'diamondsRequired', 'timeLimit', 'diamondValue', 'extraDiamondValue',
      'tickHz', 'magicWallTicks', 'amoebaSlowGrowthTicks',
    ] as const) expect(spec[key], key).toBe(defaults[key]);
    expect(validateCave(spec)).toEqual([]);
    expect(spec.map).toHaveLength(22);
    expect(spec.map.every((row) => row.length === 40)).toBe(true);
    expect(PALETTES[spec.paletteId]).toBeDefined();
  });

  it('Greed surrounds broad voids with a dense falling-gem canopy', () => {
    expect(count(caveK, 'd')).toBeGreaterThanOrEqual(100);
    expect(count(caveK, 'r')).toBeGreaterThanOrEqual(70);
    expect(caveK.map.filter((row) => / {8}/.test(row)).length).toBeGreaterThanOrEqual(6);
    expect(count(caveK, 'fFbB')).toBeGreaterThanOrEqual(2);
  });

  it('Tracks uses nested rails rather than an all-screen room grid', () => {
    expect(count(caveL, 'd')).toBe(12);
    expect(count(caveL, 'w')).toBeGreaterThanOrEqual(100);
    expect(count(caveL, '.')).toBeGreaterThan(300);
    expect(caveL.map.filter((row) => /w[ .dPfFbBE]{1,2}w/.test(row)).length)
      .toBeGreaterThanOrEqual(8);
    expect(count(caveL, 'fFbB')).toBeGreaterThanOrEqual(3);
  });

  it('Crowd puts multiple moving creatures amongst rock-heavy masonry chambers', () => {
    expect(count(caveM, 'r')).toBeGreaterThanOrEqual(110);
    expect(count(caveM, 'w')).toBeGreaterThanOrEqual(50);
    expect(count(caveM, 'fFbB')).toBeGreaterThanOrEqual(4);
    expect(count(caveM, ' ')).toBeGreaterThanOrEqual(45);
    expect(count(caveM, 'd')).toBe(0);
    expect(count(caveM, 'bB')).toBeGreaterThanOrEqual(2);
  });

  it('Walls alternates long masonry and expanding strips with loaded lanes', () => {
    const longColumns = (char: string) => Array.from({ length: 38 }, (_, x) =>
      caveN.map.filter((row) => row[x + 1] === char).length).filter((n) => n >= 10);
    expect(longColumns('w').length).toBeGreaterThanOrEqual(3);
    expect(longColumns('H').length).toBeGreaterThanOrEqual(3);
    expect(count(caveN, 'r')).toBeGreaterThanOrEqual(70);
  });

  it('Apocalypse needs broad amoeba production as well as its rich lower seam', () => {
    const colony = caveP.map.flatMap((row, y) =>
      [...row].flatMap((char, x) => char === 'a' ? [{ x, y }] : []));
    expect(colony.length).toBeGreaterThanOrEqual(25);
    expect(Math.max(...colony.map(({ x }) => x)) - Math.min(...colony.map(({ x }) => x)))
      .toBeGreaterThanOrEqual(8);
    expect(Math.max(...colony.map(({ y }) => y)) - Math.min(...colony.map(({ y }) => y)))
      .toBeGreaterThanOrEqual(5);
    expect(count(caveP, 'd')).toBeLessThan(50);
    expect(count(caveP, 'd')).toBeGreaterThanOrEqual(25);
    expect(count(caveP, 'r')).toBeGreaterThanOrEqual(65);
  });

  it('Zigzag separates its tall narrow switchbacks from the upper patrol band', () => {
    expect(caveQ.map.slice(1, 7).join('').match(/[fFbB]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(caveQ.map.slice(8, 20).filter((row) => (row.match(/w/g)?.length ?? 0) >= 6).length)
      .toBeGreaterThanOrEqual(10);
    expect(count(caveQ, 'd')).toBeGreaterThanOrEqual(30);
  });

  it('Funnel and Enchanted Boxes require conversion, with distinct barrier geometry', () => {
    for (const spec of [caveR, caveS]) {
      expect(count(spec, 'd')).toBeLessThan(spec.diamondsRequired);
      expect(count(spec, 'r')).toBeGreaterThanOrEqual(60);
      expect(count(spec, 'M')).toBeGreaterThanOrEqual(12);
    }
    expect(caveR.map.filter((row) => row.includes('M')).length).toBeGreaterThanOrEqual(2);
    expect(caveS.map.filter((row) => row.includes('M')).length).toBeGreaterThanOrEqual(3);
    expect(count(caveS, 'w')).toBeGreaterThanOrEqual(80);
    expect(count(caveS, 'fFbB')).toBeGreaterThanOrEqual(4);
  });

  it.each(stages)('screen index %i completes through normal birth-to-exit input and replays', (_index, spec) => {
    const run = new CaveSession([spec]);
    const witness = referenceLateRoutes[spec.id];
    const result = witness ? replayCave(run, witness) : playCave(run);
    expect(result.outcome, `${spec.name}: ${result.diamonds} gems in ${result.ticks} ticks`)
      .toBe(CaveOutcome.Complete);
    expect(result.secondsLeft).toBeGreaterThanOrEqual(10);
    expect(result.diamonds).toBeGreaterThanOrEqual(spec.diamondsRequired);
    expect(result.eventCounts.playerBorn).toBe(1);
    expect(result.eventCounts.playerDied).toBe(0);
    if (spec === caveP) {
      expect(result.eventCounts.amoebaGrow).toBeGreaterThan(0);
      expect(result.amoebaDiamondResolutions).toBe(1);
      expect(result.eventTicks.push?.filter((tick) =>
        tick < result.amoebaDiamondResolutionTick!).length).toBeGreaterThanOrEqual(3);
    }
    if (spec === caveM) expect(result.butterflyExplosions).toBeGreaterThanOrEqual(1);
    if (spec === caveN) expect(result.eventCounts.expand).toBeGreaterThan(0);
    if (spec === caveK) expect(result.eventCounts.land).toBeGreaterThanOrEqual(20);
    if (spec === caveR || spec === caveS) {
      const conversions = result.events.filter((event) => event.type === 'magicWallConvert');
      expect(conversions.every((event) => event.tile === Tile.DiamondFalling)).toBe(true);
      expect(conversions.length).toBeGreaterThanOrEqual(spec.diamondsRequired - count(spec, 'd'));
      const ticks = result.eventTicks.magicWallConvert!;
      expect(ticks.at(-1)! - ticks[0]).toBeLessThanOrEqual(spec.magicWallTicks - 2 * spec.tickHz);
      if (spec === caveS) expect(new Set(conversions.map((event) => event.y)).size).toBe(3);
    }
    const replay = replayCave(new CaveSession([spec]), result.inputs);
    expect(replay.outcome).toBe(CaveOutcome.Complete);
    expect(replay.ticks).toBe(result.ticks);
    expect(replay.events).toEqual(result.events);

    const observed = new CaveSession([spec]);
    const visited = new Set<string>();
    let closestGuard = Infinity;
    const guardPositions = new Set<string>();
    for (const input of result.inputs) {
      observed.update(observed.tickMs, input);
      const sim = observed.simulation;
      if (sim.runtime.playerBorn) {
        visited.add(`${sim.runtime.playerX},${sim.runtime.playerY}`);
        closestGuard = Math.min(closestGuard, sim.nearestThreatDistance());
      }
      sim.cave.tiles.forEach((tile, cell) => {
        const x = cell % sim.cave.width;
        const y = Math.floor(cell / sim.cave.width);
        if (tile !== Tile.Empty && isCreature(sim.cave.get(x, y))) guardPositions.add(`${x},${y}`);
      });
    }
    const closedTrail = result.events.filter((event) =>
      event.type === 'expand' && visited.has(`${event.x},${event.y}`)).length;
    const fallenHarvest = result.events.filter((event) =>
      event.type === 'diamond' && spec.map[event.y][event.x] !== 'd').length;
    if (count(spec, 'fFbB') > 0) {
      expect(closestGuard).toBeLessThanOrEqual(2);
      expect(guardPositions.size).toBeGreaterThan(count(spec, 'fFbB') * 2);
    }
    if (spec === caveN) expect(closedTrail).toBeGreaterThanOrEqual(30);
    if (spec === caveP) expect(fallenHarvest).toBeGreaterThanOrEqual(18);
  });

  it('leaving Apocalypse uncontained petrifies the colony instead of paying the quota', () => {
    const run = new CaveSession([caveP]);
    const result = replayCave(run, Array.from({ length: 900 }, () => NO_INPUT));
    expect(result.events).toContainEqual({ type: 'amoebaResolved', into: Tile.Boulder });
    expect(result.amoebaDiamondResolutions).toBe(0);
    expect(result.diamonds).toBeLessThan(caveP.diamondsRequired);
  });
});
