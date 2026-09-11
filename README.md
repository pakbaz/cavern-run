# Cavern Run

[![CI](https://github.com/pakbaz/cavern-run/actions/workflows/ci.yml/badge.svg)](https://github.com/pakbaz/cavern-run/actions/workflows/ci.yml)

**20 stages. One way out.**

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

The campaign follows the twenty separate Level 1 screen profiles in
[this BD1 reference collection](https://www.boulder-dash.nl/down/maps/PeterLiepa/BoulderDash01.html):
sixteen caves and four intermissions, in that order. Each stage has its own
structural and enemy reference, not a repeated introductory cave template.
Tile arrangements are independently authored; the published quotas, clocks,
diamond values and bonus values below are retained.

| # | Stage | Gems | Time | Value | Bonus |
| --- | --- | --- | --- | --- | --- |
| 1 | A: Intro | 12 | 150 | 10 | 15 |
| 2 | B: Rooms | 10 | 150 | 20 | 50 |
| 3 | C: Maze | 24 | 150 | 15 | 0 |
| 4 | D: Butterflies | 36 | 120 | 5 | 20 |
| 5 | Intermission 1 | 6 | 10 | 30 | 0 |
| 6 | E: Guards | 4 | 150 | 50 | 90 |
| 7 | F: Firefly Dens | 4 | 150 | 40 | 60 |
| 8 | G: Amoeba | 15 | 120 | 10 | 20 |
| 9 | H: Enchanted Wall | 10 | 120 | 10 | 20 |
| 10 | Intermission 2 | 16 | 15 | 10 | 0 |
| 11 | I: Greed | 75 | 150 | 5 | 10 |
| 12 | J: Tracks | 12 | 150 | 25 | 60 |
| 13 | K: Crowd | 6 | 120 | 50 | 0 |
| 14 | L: Walls | 19 | 180 | 20 | 0 |
| 15 | Intermission 3 | 14 | 20 | 10 | 0 |
| 16 | M: Apocalypse | 50 | 160 | 5 | 8 |
| 17 | N: Zigzag | 30 | 150 | 10 | 20 |
| 18 | O: Funnel | 15 | 120 | 10 | 20 |
| 19 | P: Enchanted Boxes | 12 | 150 | 10 | 20 |
| 20 | Intermission 4 | 6 | 20 | 30 | 0 |

Magic-wall charge lasts 20 seconds in H and P, 8 seconds in O, and 3 seconds
in Intermission 4. Amoeba slow-growth phases last 75 seconds in G and 140
seconds in M. The historical PAL timing defect noted for Intermission 3 is
not reproduced: every stage must be completable in this engine.

Simulation speed increases gradually from 6.5 to 9.25 scans per second.
Briefings show each stage's correct cave or intermission label, objective,
mechanics and clock before play starts. Enemy-guarded caves require safe
movement around patrols; butterfly, amoeba and magic-wall production stages
require making diamonds rather than collecting an unrelated loose quota.

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
    levels/          16 caves and 4 intermissions, ASCII maps and reference settings
    render/          procedural textures, world drawing, lighting, particles
    audio/           Web Audio synthesis: adaptive score and sound effects
    input/           keyboard, gamepad and touch, unified
    state/           IndexedDB persistence with localStorage fallback
    scenes/          Phaser scenes: title, cave intro, play, HUD, results
  test/              headless harness and normal-input routes for all 20 stages
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

Independently authored tile arrangements, generated artwork and original
music. The campaign uses public BD1 stage names and numeric settings as
references; no original map images, decoded tile maps or recordings are
included. Not affiliated with Boulder Dash, a trademark of BBG Entertainment GmbH.
