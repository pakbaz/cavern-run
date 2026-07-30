# Cavern Run

[![CI](https://github.com/pakbaz/cavern-run/actions/workflows/ci.yml/badge.svg)](https://github.com/pakbaz/cavern-run/actions/workflows/ci.yml)

**20 caves. One way out.**

**[Play it in your browser &rarr;](https://pakbaz.github.io/cavern-run/)**

A browser game in the spirit of the 1984 cave-digging classics: tunnel through
the dirt, collect the gems before the clock runs dry, and try not to be
standing under a boulder when it decides to move.

Everything you see and hear is generated at runtime. There are no sprite
sheets, no tilesets and no audio files &mdash; the pixel art is drawn into
canvases on boot, and the soundtrack is synthesised note by note in the Web
Audio API. The only binary asset in the repository is the title screen poster.

## Playing

```bash
npm install
npm run dev
```

Then open the address Vite prints (http://localhost:5173 by default).

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move / dig | Arrow keys or WASD | D-pad or left stick | Swipe or hold |
| Grab without moving | Shift or Ctrl | A / B / shoulder | Hold one finger, swipe another |
| Confirm | Enter or Space | A | Tap |
| Pause | Esc or P | Start | &mdash; |
| Restart cave | R | &mdash; | &mdash; |

**Grab** scoops the dirt next to you without stepping into the gap. It is the
difference between clearing the ground under a boulder and being under it.

On touch, keep one finger planted and swipe a second one to grab in that
direction. Either finger can be the one that moves, so it works whichever
hand you hold the phone in.

The view adapts to the screen: a phone in portrait sees a tall, narrow slice
of the cave, the same phone on its side sees a wide, short one, and a desktop
sees more of both. Rotating mid-cave keeps the run going.

## The rules

- Collect the diamond quota to open the exit, then walk into it.
- Boulders and diamonds fall when nothing holds them up, and roll off the
  rounded tops of other boulders, diamonds and brick walls.
- Anything falling on your head kills you. So does touching a firefly or a
  butterfly.
- Fireflies keep a wall on their left; butterflies keep one on their right.
  Both explode when disturbed &mdash; butterflies leave a cache of diamonds
  behind, which is usually the point.
- Boulders that fall through a **magic wall** come out as diamonds, but the
  wall only stays charged for a few seconds after the first one hits it.
- The **amoeba** grows into any gap it can reach. Seal it off and it turns to
  diamonds; let it run wild and it turns to boulders.
- You start with three lives and earn another every 500 points, up to nine.
- Clearing a cave banks one point per second left on the clock.

## The caves

| | Cave | Gems | Time | | Cave | Gems | Time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | First Descent | 12 | 150 | K | Expanding Ruin | 18 | 140 |
| B | Rockfall | 12 | 145 | L | Growth Chamber | 20 | 155 |
| C | The Gallery | 15 | 150 | M | Slime Pits | 18 | 145 |
| D | Pushing Through | 14 | 140 | N | Double Trouble | 22 | 150 |
| E | Firefly Warren | 15 | 140 | O | Amoeba Bloom | 24 | 155 |
| F | Crush Depth | 16 | 135 | P | The Crucible | 24 | 150 |
| G | Butterfly Vault | 20 | 150 | Q | Nest of Wings | 28 | 150 |
| H | Magic Seam | 18 | 145 | R | Choke Point | 22 | 140 |
| I | The Sieve | 20 | 140 | S | Cascade | 26 | 140 |
| J | Green Tide | 20 | 160 | T | One Way Out | 30 | 165 |

Each cave introduces one idea and then asks you to combine it with the last
one. The layouts, tuning and names are original to this project.

## How it is built

TypeScript, [Phaser 4](https://github.com/phaserjs/phaser), Vite and Vitest.

```bash
npm run build       # typecheck, then bundle to dist/
npm test            # 247 unit tests
npm run typecheck   # types only
```

Every push and pull request runs the suite and a full build in GitHub Actions.
Pushes to `main` that pass then publish `dist/` to GitHub Pages, so what is
playable is always a build that passed its tests.

The cave simulation in `src/game/engine/` is a pure, deterministic cellular
automaton with no Phaser import anywhere in it. Every rule &mdash; gravity,
rolling, creature pathing, explosions, the amoeba &mdash; is a small module
that reads and writes a `Uint8Array` grid, which is why the bulk of the test
suite can drive the game from ASCII cave fragments without a browser:

```ts
const sim = makeSim(['WWWWW', 'WP.d.W', 'WWWWW']);
run(sim, 1, input(Dir.Right));
expect(sim.runtime.playerX).toBe(2);
```

Phaser is only the renderer, the input source and the scene shell.

```
src/
  config.ts          tuning constants, palettes, scene keys
  game/
    engine/          the simulation: grid, rules, run state (no Phaser)
    levels/          the 20 caves, as ASCII maps plus tuning
    render/          procedural textures, world drawing, lighting, particles
    audio/           Web Audio synthesis: adaptive score and sound effects
    input/           keyboard, gamepad and touch, unified
    state/           IndexedDB persistence with localStorage fallback
    scenes/          Phaser scenes: title, cave intro, play, HUD, results
```

### The soundtrack

The music is written by the game as you play. Caves are grouped into four
tiers, each with a darker mode than the last &mdash; Dorian, Aeolian, Phrygian,
then Locrian for the final five &mdash; and the tempo climbs from 100 to 170
BPM as the campaign goes on. Within a cave the arrangement responds to how much
trouble you are in: the pad thins out and the drums and lead come forward as
the clock drains and hazards close in, and a ticking layer joins over the last
ten seconds.

### Saved data

High scores, per-cave bests, the furthest cave reached and your audio settings
are stored locally in IndexedDB, falling back to `localStorage` and then to
memory. Nothing leaves the browser, and every read and write is best-effort:
storage failing is never allowed to break the game.

## Licence

Original work. Not affiliated with, derived from, or containing any assets or
level data from Boulder Dash, which is a trademark of BBG Entertainment GmbH.
