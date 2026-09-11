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

| Action | Keyboard | Mouse | Touch | Gamepad |
| --- | --- | --- | --- | --- |
| Move / dig | Arrow keys or WASD | Hold toward a cell | Swipe and hold | D-pad or left stick |
| Grab without moving | Shift or Ctrl + direction | Right-click toward a cell | Hold one finger and swipe another | A / X, shoulders or triggers |
| Confirm | Enter or Space | Click the button | Tap the button | &mdash; |
| Pause | Esc or P | &mdash; | &mdash; | Start |
| Restart cave | R | Pause, then Restart | Pause, then Restart | Select / Back |

**Grab** scoops the dirt next to you without stepping into the gap. It is the
difference between clearing the ground under a boulder and being under it.

On touch, keep one finger planted and swipe a second one to grab in that
direction. Either finger can be the one that moves, so it works whichever
hand you hold the phone in. Lifting one finger from a two-finger grab stops
movement until you make a new swipe. Short swipes are buffered so a quick
gesture still registers between simulation scans.

There are no on-screen movement controls. The cave uses all available space
below the compact status bar. Mouse steering is directional, not automatic
pathfinding: you still choose the safe route. Restarting costs a life.
Use **FULL** at the right of the status bar for native fullscreen on supported
mobile and desktop browsers; **BACK** leaves fullscreen. Browsers without
native fullscreen still use the full available browser viewport.
Fullscreen is also available from the title menu. Tap the MUSIC or SOUND
row to cycle its volume, including mute, or use left/right on a keyboard.

Each cave's introduction waits for Enter or a tap, giving you time to read
the puzzle hint before starting. Switching tabs or leaving the game window
pauses the cave instead of letting it continue without you.

The view adapts to the screen: a phone in portrait sees a tall, narrow slice
of the cave, the same phone on its side sees a wide, short one, and a desktop
sees more of both. The canvas matches the window's aspect ratio, including
partial tiles at its edges, rather than leaving bars around a fixed grid.
Rotating mid-cave keeps the run going.

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
| A | Buried River | 12 | 75 | K | Closing Shift | 17 | 65 |
| B | Rockfall | 12 | 55 | L | Bloom Chase | 10 | 85 |
| C | Side Pocket | 11 | 70 | M | Membrane Drop | 30 | 55 |
| D | Switchbacks | 12 | 85 | N | Crossed Wires | 26 | 48 |
| E | Spark Lock | 10 | 60 | O | Twin Blooms | 28 | 80 |
| F | Double Fuse | 14 | 95 | P | Alloy and Wings | 16 | 70 |
| G | Rich Strike | 7 | 45 | Q | Three Charges | 26 | 65 |
| H | Seven Furnaces | 9 | 80 | R | Blast Passage | 24 | 65 |
| I | Relay Kilns | 13 | 80 | S | Cascade Works | 14 | 45 |
| J | Seed Crystal | 18 | 70 | T | Foundry Run | 33 | 130 |

Five challenge tiers introduce individual mechanics before combining them.
Simulation speed rises in small steps from 6.5 to 9.25 scans per second.
Each cave has its own clock, with room to learn early puzzles and tighter
time pressure later. Briefings show the objective, required mechanics, and
challenge tier before the player starts the clock.

The layouts are built from structural motifs rather than scattered contents:
bricked vaults opened by creature blasts, boulder gates, furnaces feeding a
magic wall, slime cascades, live amoeba vents that the player must plug, and
corridors made irreversible by expanding walls. Production caves contain too
few loose diamonds to meet the quota: creating and releasing the rest is the
puzzle. Every layout, quota, clock and name is original to this project.

Related mechanics use different spaces rather than repeated templates:
Double Fuse has a nested keep, Relay Kilns climbs three separated terraces,
Twin Blooms joins offset chambers through a chimney, Three Charges requires
timed drops over moving butterfly patrols, and Cascade Works drains stacked
silos. Classic cave-digging games inform the broad enemy mix and diamond
counts, while the cell layouts and routes are independently authored.
Campaign checks compare interior structures after translation and reflection,
and replay a complete A-to-T run to catch repeated stages.

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

`render/TextureFactory.ts` paints all gameplay art at boot. Soil uses shaded
clods instead of dense pixel noise; boulders have distinct flat facets, and
the miner has an animated pick, lamp and larger silhouette. Fireflies,
butterflies, aqua slime and lime amoebas each have a distinct shape or colour.
The optional title poster stays behind this generated art.

Carved edge lighting and contact shadows make newly dug tunnels read as
openings in solid terrain. Layered strata sit behind the cave; diamonds and
the exit glow, while the helmet lamp points ahead of the miner. Each palette
has its own ambient light and particles. Reduced-motion mode suppresses
ambient drifting, and the view fits partial edge tiles without stretching
the square cave cells.

### The soundtrack

All twenty legacy melodies have been replaced by new original compositions.
Each cave has its own motif, melodic rhythm and chord progression, named
for its stage and shaped around its puzzle. A shared three-note cadence and
subterranean instrument palette keep the campaign musically connected.

The arrangement develops with the clock and nearby danger. Intensity changes
smoothly, and larger arrangement changes wait for a bar boundary. One clear
foreground melody is audible from the first bar, using the full phrase that
previously arrived near the end. Quiet sustained chords sit underneath it;
the pulsing bass, drums, hi-hats and continuous air hiss are removed entirely.
There is no competing counter-melody, melodic echo, panic drone or countdown
ticker. A small late-stage lift in expression and brightness preserves the
music's sense of progress without restoring the old backing track.

Stereo placement, a synthetic cave reverb and a mix compressor give the sounds
depth while keeping the melody and gameplay cues clear. Short, bounded
crossfades prevent old tracks from stacking up. Diamond collection,
magic-wall conversion and opening the exit
have distinct cues. The soundtrack and effects use no third-party recordings.

### Saved data

High scores, per-cave bests, the furthest cave reached and your audio settings
are stored locally in IndexedDB, falling back to `localStorage` and then to
memory. Nothing leaves the browser, and every read and write is best-effort:
storage failing is never allowed to break the game.

## Licence

Original work. Not affiliated with, derived from, or containing any assets or
level data from Boulder Dash, which is a trademark of BBG Entertainment GmbH.
