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

Campaign progress is checkpointed after every cleared cave in browser IndexedDB
(with a localStorage fallback). Returning players get a **Continue Cave** option
that restores the next cave, banked score and remaining lives.

To run the shared high-score API locally, initialize the local D1 database and
start the Worker in a second terminal:

```bash
npm run db:migrate:local
npm run dev:scores
```

Vite proxies `/api/scores` to the local Worker.

## High-score backend

GitHub Pages cannot write a SQLite file because it only serves static files.
The shared leaderboard therefore uses a small Cloudflare Worker with D1,
Cloudflare's managed SQLite-compatible database. Browser storage never contains
the shared score table.

One-time setup:

```bash
npx wrangler login
npx wrangler d1 create cavern-run-scores
npm run db:migrate:remote
npm run deploy:scores
```

When `wrangler d1 create` asks to add the binding, accept it so the generated
database ID is written to `wrangler.jsonc`. After deployment, set the GitHub
Actions repository variable `SCORE_API_URL` to the Worker endpoint, including
the path:

```text
https://cavern-run-scores.<your-subdomain>.workers.dev/api/scores
```

The next successful `main` build embeds that URL in the GitHub Pages bundle.
The Worker only permits browser requests from `https://pakbaz.github.io`,
validates all submitted fields, derives the cave letter and timestamp itself,
and retains only the ten highest scores in D1.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move / dig | Arrow keys or WASD | D-pad or left stick | Swipe or hold |
| Grab without moving | Shift or Ctrl | A / X, shoulders or triggers | Hold one finger, swipe another |
| Confirm | Enter or Space | &mdash; | Tap |
| Pause | Esc or P | Start | &mdash; |
| Restart cave | R | Select / Back | &mdash; |

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
| A | First Descent | 14 | 140 | K | Expanding Ruin | 20 | 135 |
| B | Rockfall | 16 | 135 | L | Growth Chamber | 24 | 150 |
| C | The Gallery | 20 | 140 | M | Slime Pits | 26 | 140 |
| D | Pushing Through | 20 | 135 | N | Double Trouble | 24 | 145 |
| E | Firefly Warren | 18 | 135 | O | Amoeba Bloom | 28 | 150 |
| F | Crush Depth | 20 | 130 | P | The Crucible | 28 | 145 |
| G | Butterfly Vault | 22 | 145 | Q | Nest of Wings | 30 | 145 |
| H | Magic Seam | 24 | 140 | R | Choke Point | 26 | 135 |
| I | The Sieve | 24 | 135 | S | Cascade | 30 | 140 |
| J | Green Tide | 22 | 150 | T | One Way Out | 32 | 165 |

Each cave introduces one idea and then asks you to combine it with the last
one. The caves also speed up as you descend: the simulation runs at 7 scans a
second in the first pair and 9 by the last.

The layouts are built from structural motifs rather than scattered contents:
bricked vaults with a single door, boulder rafts resting on the gems you want,
guard cells you have to open deliberately, hoppers feeding a magic wall,
sealed amoeba pockets held shut by a plug, and corridors an expanding wall is
closing behind you. Every layout, quota, clock and name is original to this
project.

## How it is built

TypeScript, [Phaser 4](https://github.com/phaserjs/phaser), Vite and Vitest.

```bash
npm run build       # typecheck the game and Worker, then bundle to dist/
npm test            # the whole suite, headless
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
  main.ts            boot: Phaser config and the scene list
  config.ts          tuning constants, palettes, scene keys
  layout.ts          picks the canvas size and tile counts from the window
  game/
    engine/          the simulation: grid, rules, run state (no Phaser)
    levels/          the 20 caves, as ASCII maps plus tuning
    render/          procedural textures, world drawing, lighting, particles
    audio/           Web Audio synthesis: adaptive score and sound effects
    input/           keyboard, gamepad and touch, unified
    state/           IndexedDB persistence with localStorage fallback
    scenes/          Phaser scenes: title, cave intro, play, HUD, results
  test/              headless harness and a bot that plays all 20 caves
```

### The look

There are no image files either. `render/TextureFactory.ts` paints every
sprite into a canvas at boot from one shared lighting model &mdash; a key
light up and to the left, a cool fill from below &mdash; so a boulder, a
diamond facet and a steel rivet all catch the light from the same place. Each
cave recolours the whole set from its palette, which is why twenty caves that
share one tileset still look like twenty different places.

On top of that the world is drawn in layers: two scrolling strata sheets
parallax behind the cave at different rates, everything solid casts a soft
contact shadow, diamonds and the exit get an additive bloom that pulses, and
boulders roll into the direction they are falling and squash when they land.
The strata sheets are built from sine terms whose periods divide the sheet
exactly in both axes, so the backdrop tiles forever without a seam.

### The soundtrack

The music is written by the game as you play, and every cave gets its own
piece. A cave's theme fixes its mode, chord progression, melodic motif, groove,
swing and timbres, and the twenty themes darken as you descend &mdash; open
Dorian tunes at the top, airless Locrian ones that never resolve at the bottom
&mdash; while the tier a cave sits in drops the tonic lower.

A theme also carries its own voicing. The drum kit moves from a felt beater
and a brushed snare at the top of the campaign to a gated slam at the bottom;
a sine sub sits under the bass, weighted per cave; a struck FM bell shadows
the melody an octave up in the caves that should ring; and a band of filtered
air breathes under everything so the gaps between phrases still sound like a
cave. The parts are spread across the stereo field &mdash; the pad's detuned
halves thrown wide, the lead and its counter-line on opposite sides &mdash;
and the whole score is fed to a convolution reverb built from a synthetic
impulse with discrete early reflections, which is what tells the ear how far
apart the walls are.

Inside a cave the piece is then *developed*, in four movements driven by the
clock. It opens as pad and bass with the motif stated sparsely, then a
sixteenth-note counter-line arrives and the melody fills in, its vibrato
widening as the cave leans on you; past halfway the
drums start rolling fills, a seventh sours the pad, the last bar of the loop is
swapped for a chord that refuses to resolve, and a swell winds up into every
repeat. For the endgame a dissonant pedal comes in underneath, the bass stops
arpeggiating and hammers the root, and the whole tune is winched up a semitone.
Layered on top of that, the arrangement reacts to how much trouble you are in:
tempo, brightness and the drums all follow the nearest hazard and the diamonds
you still owe, and a ticking layer counts out the final ten seconds.

### Saved data

High scores, per-cave bests, the furthest cave reached and your audio settings
are stored locally in IndexedDB, falling back to `localStorage` and then to
memory. Nothing leaves the browser, and every read and write is best-effort:
storage failing is never allowed to break the game.

## Licence

Original work. Not affiliated with, derived from, or containing any assets or
level data from Boulder Dash, which is a trademark of BBG Entertainment GmbH.
