import Phaser from 'phaser';

import { layout } from '../../layout';
import { toggleFullscreen } from '../../fullscreen';

import { DEFAULT_PALETTE_ID, Depth, PALETTES, SceneKey, TILE_SIZE } from '../../config';
import { audio } from '../audio/index';
import { CAVE_COUNT, caveAt } from '../levels/index';
import {
  DIRT_VARIANTS,
  PLAYER_IDLE_FRAMES,
  TextureKey,
  cavityFrame,
  edgeFrame,
} from '../render/TextureFactory';
import { clamp, drift, edgeMask, tileVariant, wrap } from '../render/renderMath';
import { loadHighScores, type ScoreEntry } from '../state/scores';
import { saveSettings } from '../state/settings';
import { POSTER_KEY } from './BootScene';
import { RUN_STATE_KEY, type RunState } from './RunState';
import {
  Ink,
  Slab,
  bodyStyle,
  card,
  centred,
  designRowAt,
  designX,
  designY,
  divider,
  pad,
  pulse,
  onLayoutChanged,
  menuScale,
  titleStyle,
} from './ui';

interface MenuItem {
  readonly label: () => string;
  readonly activate: () => void;
  /** Left/right adjusts a value rather than selecting. */
  readonly adjust?: (delta: number) => void;
}

/** The cave the title screen is set in. */
const TITLE_PALETTE = PALETTES[DEFAULT_PALETTE_ID];

/**
 * Smallest a menu row is allowed to be on the glass, in CSS pixels.
 *
 * The usual accessibility floor for a touch target. Rows are laid out to meet
 * it after both the canvas scale and the menu scale have had their say.
 */
const TOUCH_TARGET_CSS = 44;

/** Row height in design units below which the menu stops shrinking. */
const MIN_ROW_HEIGHT = 22;

/** How long a one-off message sits at the foot of the screen, in ms. */
const NOTICE_MS = 3500;

/** How fast the two strata sheets creep, in pixels a second. */
const STRATA_FAR_DRIFT = 3.5;
const STRATA_NEAR_DRIFT = 9;

/**
 * Poster, menu and the local score table.
 *
 * The screen is a cave rather than a splash: the same parallax strata, the
 * same dug rock and the same miner the game itself is drawn with, arranged
 * into a ledge along the bottom of the frame with a seam of gems in it. The
 * downloaded poster, if it arrives, is graded right back and used as the
 * furthest layer of all -- present as depth, never competing with the pixel
 * art in front of it.
 *
 * This is also where audio gets unlocked: browsers will not start an
 * AudioContext without a user gesture, so the first key press or tap here
 * both starts the music and dismisses the "press to begin" prompt.
 */
export class TitleScene extends Phaser.Scene {
  private state!: RunState;
  private items: MenuItem[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private meters: Phaser.GameObjects.Graphics[] = [];
  private highlight?: Phaser.GameObjects.Graphics;
  private cursor = 0;
  /** Menu row to land on after a relayout, so the screen does not jump. */
  private restoredCursor = 0;
  private fullscreenBusy = false;
  private notice?: Phaser.GameObjects.Text;
  private scores: ScoreEntry[] = [];
  private unlocked = false;
  private prompt?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;

  /** Animated backdrop pieces, updated every frame. */
  private strataFar?: Phaser.GameObjects.TileSprite;
  private strataNear?: Phaser.GameObjects.TileSprite;
  private poster?: Phaser.GameObjects.Image;
  private readonly motes: Phaser.GameObjects.Image[] = [];
  private readonly glints: Phaser.GameObjects.Image[] = [];
  private miner?: Phaser.GameObjects.Image;
  private clock = 0;
  /** Screen y of the top of the rock ledge; UI has to stay above it. */
  private ledgeTop = 0;
  /** Design row the menu card ends on, so the score table can follow it. */
  private menuBottom = 0;
  /** Height of one menu row in design units, chosen to be thumb-sized. */
  private rowHeight = MIN_ROW_HEIGHT;
  private visit = 0;

  constructor() {
    super(SceneKey.Title);
  }

  /**
   * @param data carries the menu position across a relayout. Changing the
   * window -- which is exactly what going fullscreen does -- rebuilds this
   * screen, and a cursor that jumped back to the top every time would throw
   * the player off the row they had just pressed.
   */
  init(data?: { cursor?: number }): void {
    this.restoredCursor = Math.max(0, Math.trunc(data?.cursor ?? 0));
  }

  async create(): Promise<void> {
    const visit = ++this.visit;
    // Rebuild at the new size, keeping the player's place in the menu.
    onLayoutChanged(this, () => this.scene.restart({ cursor: this.cursor }));
    // Per-visit state; `unlocked` is deliberately sticky, because the audio
    // context is a page-lifetime singleton and stays unlocked once granted.
    this.cursor = this.restoredCursor;
    this.items = [];
    this.labels = [];
    this.meters = [];
    this.motes.length = 0;
    this.glints.length = 0;
    this.clock = 0;

    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    this.drawBackdrop();
    this.drawCrest();

    this.buildMenu();

    // The prompt only exists until the first interaction unlocks audio; on a
    // later visit, or after a rotation restarts the scene, the controls line
    // has already taken over its spot.
    if (!this.unlocked) {
      this.prompt = centred(this, layout().height - 52, 'PRESS ANY KEY', bodyStyle(12, Ink.gold))
        .setDepth(Depth.Menu);
      if (!this.state.settings.reducedMotion) pulse(this, this.prompt);
    }

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);

    // Esc, a system gesture or the HUD's own button can all drop us out of
    // fullscreen without going through this menu, and the row has to agree.
    const syncFullscreen = (): void => {
      if (this.sys.isActive()) this.refresh();
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      this.shutdown();
    });

    let scores: ScoreEntry[];
    try {
      scores = await loadHighScores();
    } catch {
      if (visit === this.visit && this.sys.isActive()) this.drawScoresUnavailable();
      return;
    }
    if (visit !== this.visit || !this.sys.isActive()) return;
    this.scores = scores;
    this.drawScores();
  }

  override update(_time: number, delta: number): void {
    this.clock += delta;
    if (this.state?.settings.reducedMotion) return;

    const seconds = this.clock / 1000;
    if (this.strataFar) this.strataFar.tilePositionX = seconds * STRATA_FAR_DRIFT;
    if (this.strataNear) {
      this.strataNear.tilePositionX = seconds * STRATA_NEAR_DRIFT;
      this.strataNear.tilePositionY = Math.sin(seconds * 0.14) * 6;
    }
    if (this.poster) this.poster.x = this.posterAnchor + drift(0.6, this.clock, 7);

    const { width, height } = layout();
    for (let i = 0; i < this.motes.length; i += 1) {
      const mote = this.motes[i];
      const fall = (seconds * (0.008 + (i % 4) * 0.002)) % 1;
      mote.setPosition(
        wrap(mote.getData('baseX') + drift(i * 0.7, this.clock, 30), width),
        wrap(mote.getData('baseY') - fall * height, height),
      );
      mote.setAlpha(0.06 + Math.abs(Math.sin(this.clock * 0.0005 + i)) * 0.16);
    }

    for (let i = 0; i < this.glints.length; i += 1) {
      const glint = this.glints[i];
      glint.setAlpha(0.3 + Math.abs(Math.sin(this.clock * 0.0011 + i * 1.7)) * 0.5);
    }

    if (this.miner) {
      const frame = Math.floor(this.clock / 190) % PLAYER_IDLE_FRAMES;
      this.miner.setTexture(TextureKey.playerIdle(frame));
    }
  }

  /** Where the poster's right edge sits before its idle drift is added. */
  private get posterAnchor(): number {
    return layout().width;
  }

  /* ---------------------------------------------------------------- *
   * The cave behind the menu
   * ---------------------------------------------------------------- */

  private drawBackdrop(): void {
    const { width, height } = layout();
    this.cameras.main.setBackgroundColor('#04070f');

    if (this.textures.exists(POSTER_KEY)) {
      // The poster is a painting; everything in front of it is pixel art. It
      // is pushed back to a haze -- dimmed, cooled and blown up past its own
      // title lettering -- so it reads as distance rather than as a second
      // art style arguing with the first.
      // Anchored right and blown up: the poster carries its own title
      // lettering down the left, which this crops off the frame entirely.
      const poster = this.add.image(this.posterAnchor, height * 0.44, POSTER_KEY).setOrigin(1, 0.5);
      const cover = Math.max(width / poster.width, height / poster.height);
      poster.setScale(cover * 1.9).setAlpha(0.45).setTint(0x5f86c8).setDepth(Depth.BackdropFar - 1);
      this.poster = poster;
    }

    this.strataFar = this.add
      .tileSprite(0, 0, width, height, TextureKey.strataFar(TITLE_PALETTE.id))
      .setOrigin(0, 0)
      .setAlpha(0.34)
      .setDepth(Depth.BackdropFar);
    this.strataNear = this.add
      .tileSprite(0, height * 0.2, width, height * 0.8, TextureKey.strataNear(TITLE_PALETTE.id))
      .setOrigin(0, 0)
      .setAlpha(0.42)
      .setDepth(Depth.BackdropNear);

    this.drawLedge();
    this.drawMotes();

    // A scrim so the menu always has something quiet to sit on, heaviest
    // through the middle of the frame where the card goes.
    const scrim = this.add.graphics().setDepth(Depth.Background + 2);
    for (let i = 0; i < 8; i += 1) {
      const t = i / 8;
      scrim.fillStyle(0x04060e, 0.1);
      scrim.fillRect(0, height * (0.16 + t * 0.06), width, height);
    }

    // A vignette, matching the one the cave itself is drawn with.
    const vignette = this.add.graphics().setDepth(Depth.Vignette);
    for (let i = 0; i < 14; i += 1) {
      const t = i / 14;
      const inset = t * Math.min(width, height) * 0.5;
      vignette.lineStyle(Math.max(2, (1 - t) * 16), 0x01030a, (1 - t) * 0.06);
      vignette.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    }
  }

  /**
   * A ledge of dug rock across the bottom of the frame, built out of the
   * game's own tiles: soil with its opened faces lit exactly as the cave lights
   * them, boulders resting on it, a seam of gems in the wall and the miner
   * standing at the near end.
   */
  private drawLedge(): void {
    const { width, height } = layout();
    const cell = TILE_SIZE;
    const columns = Math.ceil(width / cell) + 1;
    // The ledge is capped as a fraction of the frame as well as in cells, so
    // a short landscape phone gets a strip of rock rather than a wall of it.
    // The ledge is capped as a fraction of the frame as well as in cells, so
    // a short landscape phone gets a strip of rock rather than a wall of it --
    // and it gives way further still if the menu needs the room, because a
    // thumb-sized row matters more than a second course of dirt.
    this.ledgeTop = clamp(
      this.menuFloor() + cell * 0.4,
      height - cell * 3.4,
      height - cell * 1.4,
    );
    const gridTop = this.ledgeTop;
    const rows = Math.ceil((height - gridTop) / cell) + 1;

    // A little landscape: how many cells of air sit above each column before
    // the rock starts. Two frequencies, so the ledge steps up and down in
    // runs of a few columns rather than alternating like a sawtooth.
    const profile: number[] = [];
    for (let column = 0; column < columns; column += 1) {
      const lift = Math.sin(column * 0.42) * 0.5 + Math.sin(column * 0.17) * 0.6;
      profile.push(lift > 0.15 ? 0 : 1);
    }
    const rockAt = (column: number, row: number): boolean => {
      const clamped = Math.min(Math.max(column, 0), columns - 1);
      return row >= profile[clamped];
    };

    for (let column = 0; column < columns; column += 1) {
      const x = column * cell + cell / 2;
      for (let row = 0; row < rows; row += 1) {
        const y = gridTop + row * cell + cell / 2;

        if (!rockAt(column, row)) {
          // Open air in front of the ledge: give it the same occlusion the
          // cave presses into a freshly dug tunnel.
          const mask = edgeMask(
            rockAt(column, row - 1),
            rockAt(column + 1, row),
            rockAt(column, row + 1),
            rockAt(column - 1, row),
          );
          if (mask !== 0) {
            this.add
              .image(x, y, TextureKey.edges, cavityFrame(mask))
              .setDepth(Depth.Background + 1)
              .setAlpha(0.85);
          }
          continue;
        }

        this.add
          .image(x, y, TextureKey.dirt(TITLE_PALETTE.id, tileVariant(column, row, DIRT_VARIANTS)))
          .setDepth(Depth.Tiles);

        const mask = edgeMask(
          !rockAt(column, row - 1),
          !rockAt(column + 1, row),
          false,
          !rockAt(column - 1, row),
        );
        if (mask !== 0) {
          this.add
            .image(x, y, TextureKey.edges, edgeFrame(mask, column % 2))
            .setDepth(Depth.Tiles + 1);
        }
      }

      const topY = gridTop + profile[column] * cell;

      // A boulder every so often, sitting on the lip.
      if (column % 7 === 3) {
        this.add
          .image(x + cell * 0.2, topY - cell * 0.44, TextureKey.boulder(TITLE_PALETTE.id))
          .setDepth(Depth.Entities)
          .setRotation(column * 0.4);
      }

      // A seam of gems running through the rock, each with its own glow.
      if (column % 5 === 1) {
        const gemY = topY + cell * (1.5 + (column % 2));
        if (gemY > height - cell * 0.4) continue;
        const glow = this.add
          .image(x, gemY, TextureKey.glow)
          .setDepth(Depth.Tiles + 2)
          .setTint(0x9df0ff)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDisplaySize(cell * 2.4, cell * 2.4)
          .setAlpha(0.4);
        this.glints.push(glow);
        this.add.image(x, gemY, TextureKey.diamond(column % 8)).setDepth(Depth.Entities);
      }
    }

    // The miner, standing at the near end of the ledge looking out over it.
    const minerColumn = 2;
    this.miner = this.add
      .image(
        cell * (minerColumn + 0.5),
        gridTop + profile[minerColumn] * cell - cell * 0.5,
        TextureKey.playerIdle(0),
      )
      .setDepth(Depth.Entities + 1);
    this.add
      .image(this.miner.x, this.miner.y, TextureKey.glow)
      .setDepth(Depth.Tiles + 2)
      .setTint(0xffd9a2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(cell * 5.5, cell * 5.5)
      .setAlpha(0.18);

    // The floor of the frame is a place to put words, so it fades down into
    // the dark rather than staying as busy as the rock above it.
    const scrim = this.add.graphics().setDepth(Depth.Particles + 1);
    const bandTop = height - cell * 2.6;
    for (let i = 0; i < 12; i += 1) {
      const t = i / 12;
      scrim.fillStyle(0x03060d, 0.1);
      scrim.fillRect(0, bandTop + t * (height - bandTop), width, height - bandTop);
    }
  }

  private drawMotes(): void {
    if (this.state.settings.reducedMotion) return;
    const { width, height } = layout();
    for (let i = 0; i < 26; i += 1) {
      const mote = this.add
        .image(0, 0, TextureKey.mote)
        .setDepth(Depth.Particles)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x9fd6ff)
        .setScale(0.3 + (i % 5) * 0.14)
        .setAlpha(0.12);
      mote.setData('baseX', ((i * 0.6180339887) % 1) * width);
      mote.setData('baseY', ((i * 0.3819660113) % 1) * height);
      mote.setPosition(mote.getData('baseX'), mote.getData('baseY'));
      this.motes.push(mote);
    }
  }

  /* ---------------------------------------------------------------- *
   * Lettering
   * ---------------------------------------------------------------- */

  private drawCrest(): void {
    const scale = menuScale();
    const title = centred(this, designY(74), 'CAVERN RUN', titleStyle(46)).setDepth(Depth.Menu);
    title.setLetterSpacing?.(3);

    // A cut-gem rule under the title: two tapering strokes meeting at a
    // diamond, echoing the thing the whole game is about.
    const g = this.add.graphics().setDepth(Depth.Menu);
    const half = Math.min(layout().width * 0.34, 190 * scale);
    const y = designY(98);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        g.fillStyle(Slab.glow, 0.5 - i * 0.15);
        g.fillRect(
          layout().width / 2 + side * (14 * scale + i * 2),
          y - i * 0.5,
          side > 0 ? half - i * 8 : -(half - i * 8),
          1,
        );
      }
    }
    const gem = 5 * scale;
    g.fillStyle(0x9df0ff, 0.9);
    g.beginPath();
    g.moveTo(layout().width / 2, y - gem);
    g.lineTo(layout().width / 2 + gem, y);
    g.lineTo(layout().width / 2, y + gem);
    g.lineTo(layout().width / 2 - gem, y);
    g.closePath();
    g.fillPath();

    centred(this, designY(116), `${CAVE_COUNT} CAVES.  ONE WAY OUT.`, bodyStyle(13, Ink.accent))
      .setDepth(Depth.Menu);
  }

  /* ---------------------------------------------------------------- *
   * Menu
   * ---------------------------------------------------------------- */

  private buildMenu(): void {
    const { settings } = this.state;
    const canResume = this.state.progress.furthestCave > 0 && this.state.progress.furthestCave < CAVE_COUNT;
    const changeMusic = (delta: number, cycle = false): void => {
      settings.musicVolume = cycle && settings.musicVolume >= 1 ? 0 : step(settings.musicVolume, delta);
      audio().engine.setMusicVolume(settings.musicVolume);
    };
    const changeSound = (delta: number, cycle = false): void => {
      settings.sfxVolume = cycle && settings.sfxVolume >= 1 ? 0 : step(settings.sfxVolume, delta);
      audio().engine.setSfxVolume(settings.sfxVolume);
      audio().sfx.uiMove();
    };

    this.items = [
      ...(canResume
        ? [
            {
              label: () => `CONTINUE CAVE ${caveAt(this.state.progress.furthestCave).letter}`,
              activate: () => this.startRun(true),
            },
            { label: () => 'NEW RUN', activate: () => this.startRun(false) },
          ]
        : [{ label: () => 'START RUN', activate: () => this.startRun(false) }]),
      {
        label: () => 'MUSIC',
        activate: () => changeMusic(+1, true),
        adjust: changeMusic,
      },
      {
        label: () => 'SOUND',
        activate: () => changeSound(+1, true),
        adjust: changeSound,
      },
      {
        label: () => `FULLSCREEN  ${fullscreenState()}`,
        activate: () => this.requestFullscreen(),
        adjust: () => this.requestFullscreen(),
      },
      {
        label: () => `HELMET LAMP  ${settings.lighting ? 'ON ' : 'OFF'}`,
        activate: () => this.toggle('lighting'),
        adjust: () => this.toggle('lighting'),
      },
      {
        label: () => `REDUCED MOTION  ${settings.reducedMotion ? 'ON ' : 'OFF'}`,
        activate: () => this.toggle('reducedMotion'),
        adjust: () => this.toggle('reducedMotion'),
      },
    ];

    const menuStart = canResume ? 142 : 152;
    const cardTop = menuStart - 20;
    const rowHeight = this.rowHeightFor(cardTop, this.items.length);
    const cardHeight = this.items.length * rowHeight + 20;
    this.menuBottom = cardTop + cardHeight;
    card(this, cardTop, 336, cardHeight).setDepth(Depth.Menu - 1);

    // The selection bar sits under the labels and slides to whichever row is
    // live, which is easier to follow at a glance than a moving arrow alone.
    this.highlight = this.add.graphics().setDepth(Depth.Menu - 1);

    this.labels = this.items.map((item, index) =>
      this.add
        .text(
          designX(-140),
          designY(menuStart + rowHeight / 2 - 11 + index * rowHeight),
          item.label(),
          bodyStyle(14),
        )
        .setOrigin(0, 0.5)
        .setDepth(Depth.Menu),
    );

    // Touch targets are a whole row rather than the glyphs themselves: a thumb
    // on a phone is a lot bigger than the word SOUND.
    this.rowHeight = rowHeight;
    this.labels.forEach((label, index) => {
      this.add
        .rectangle(designX(0), label.y, 292 * menuScale(), rowHeight * menuScale(), 0x000000, 0)
        .setDepth(Depth.Menu)
        .setInteractive({ useHandCursor: true })
        // Deliberately POINTER_MOVE rather than POINTER_OVER: "over" is
        // re-evaluated every frame, so a mouse left resting on a row would
        // drag the selection back onto it the instant the keyboard moved it
        // somewhere else, and the arrow keys would appear to be dead.
        .on(Phaser.Input.Events.POINTER_MOVE, () => this.point(index))
        .on(Phaser.Input.Events.POINTER_DOWN, () => this.press(index));
    });

    // Volume rows get a drawn meter rather than block glyphs, so the two
    // levels can be compared without counting characters.
    this.meters = this.items.map(() => this.add.graphics().setDepth(Depth.Menu));

    this.controlsHint();
    this.refresh();
  }

  /**
   * How tall a menu row has to be, in design units.
   *
   * The canvas is drawn at its own resolution and then scaled to fit the
   * window, and the menus are scaled again to fit the canvas, so a row laid
   * out at a fixed size ends up whatever size the device feels like. A phone
   * was getting rows barely twenty CSS pixels tall, which is half a fingertip.
   * This works backwards from the real thing a thumb has to hit: at least
   * `TOUCH_TARGET_CSS` on the glass, whatever the two scales are doing.
   */
  private wantedRowHeight(): number {
    // `displayScale` is game pixels per CSS pixel, which is exactly the
    // conversion needed to state a target in the units a finger works in.
    const gamePerCss = this.scale.displayScale.y || 1;
    return (TOUCH_TARGET_CSS * gamePerCss) / menuScale();
  }

  /** How many rows the menu will have, before it has been built. */
  private menuRowCount(): number {
    const { furthestCave } = this.state.progress;
    return furthestCave > 0 && furthestCave < CAVE_COUNT ? 7 : 6;
  }

  /** Screen y the menu card wants to reach down to, at thumb-sized rows. */
  private menuFloor(): number {
    const rows = this.menuRowCount();
    const cardTop = (rows > 5 ? 142 : 152) - 20;
    return designY(cardTop + rows * this.wantedRowHeight() + 20);
  }

  /**
   * The row height the menu is actually laid out at.
   *
   * Capped so the card cannot grow down past the rock at the bottom of the
   * frame, because a menu that runs off the screen is worse than one that is
   * slightly harder to tap. The ledge has already given up what room it can.
   */
  private rowHeightFor(cardTop: number, rows: number): number {
    const floor = designRowAt(this.ledgeTop - 12);
    const room = (floor - (cardTop + 20)) / Math.max(1, rows);
    return Math.max(MIN_ROW_HEIGHT, Math.min(this.wantedRowHeight(), room));
  }

  /**
   * Two quiet lines at the foot of the frame: how to work the menu, and how
   * to work a cave.
   *
   * The menu line shares its spot with the "press any key" prompt and only
   * appears once that prompt has done its job. The cave line is always there,
   * because the answer to "how do I play this" should not be something you
   * have to press a key to find out.
   *
   * Both are written short on a narrow screen. A portrait phone at 352px is
   * the target: the copy is scaled down with the menus, so the long version is
   * only used where there is genuinely room for it.
   */
  private controlsHint(): void {
    const { width, height } = layout();
    const touch = this.sys.game.device.input.touch;
    const narrow = width < 420;

    const menuLine = touch
      ? 'TAP A LINE TO CHOOSE'
      : '\u2191\u2193 CHOOSE   \u2190\u2192 ADJUST   ENTER START';
    this.hint = centred(this, height - 52, menuLine, bodyStyle(11, Ink.dim))
      .setDepth(Depth.Menu)
      .setVisible(this.unlocked);

    // How a cave is actually played, in the terms of whatever is in the
    // player's hands. There is nothing on screen to point at -- the whole
    // playfield is the control -- so this line is the only place the grab
    // gesture is explained, and it is worth the space it takes.
    const caveLine = touch
      ? narrow
        ? 'SWIPE TO MOVE  \u00b7  TWO FINGERS TO GRAB'
        : 'IN A CAVE: SWIPE TO MOVE  \u00b7  HOLD ONE FINGER AND SWIPE ANOTHER TO GRAB'
      : narrow
        ? 'ARROWS/WASD  \u00b7  SHIFT TO GRAB'
        : 'IN A CAVE: ARROWS OR WASD TO MOVE  \u00b7  HOLD SHIFT TO GRAB';
    // A touch brighter than the menu line: it is smaller, it sits over the
    // rock, and it is the line a first-time player actually needs.
    centred(this, height - 30, caveLine, bodyStyle(narrow ? 10 : 11, Ink.body)).setDepth(Depth.Menu);
  }

  /**
   * The local score table, tucked under the menu.
   *
   * How many places fit depends on the screen: the rock ledge owns the bottom
   * of the frame, so the table takes whatever room is left between the menu
   * and the rock and shows nothing at all when that is none.
   */
  private drawScores(): void {
    if (this.scores.length === 0) return;

    const top = this.menuBottom + 12;
    const room = designRowAt(this.ledgeTop - 14) - top - 34;
    const fits = Math.floor(room / 18);
    if (fits < 1) return;

    const rows = this.scores.slice(0, Math.min(5, fits));
    card(this, top, 336, rows.length * 18 + 32).setDepth(Depth.Menu - 1);

    this.add
      .text(designX(-140), designY(top + 14), 'BEST RUNS', bodyStyle(11, Ink.gold))
      .setOrigin(0, 0.5)
      .setDepth(Depth.Menu);
    divider(this, designX(-140), designY(top + 22), 280 * menuScale(), 0x8a6a24).setDepth(Depth.Menu);

    rows.forEach((row, index) => {
      const line = `${index + 1}. ${row.name.padEnd(4)} ${pad(row.score, 6)}   CAVE ${row.caveLetter}`;
      this.add
        .text(designX(-140), designY(top + 34 + index * 18), line, bodyStyle(12, Ink.body))
        .setOrigin(0, 0.5)
        .setDepth(Depth.Menu);
    });
  }

  private drawScoresUnavailable(): void {
    const y = this.menuBottom + 16;
    if (designY(y) > this.ledgeTop - 12) return;
    centred(this, designY(y), 'BEST RUNS OFFLINE', bodyStyle(11, Ink.dim)).setDepth(Depth.Menu);
  }

  private refresh(): void {
    const scale = menuScale();
    const { settings } = this.state;

    this.labels.forEach((label, index) => {
      const selected = index === this.cursor;
      label.setText(`${selected ? '\u25b8 ' : '  '}${this.items[index].label()}`);
      label.setColor(selected ? Ink.bright : Ink.body);
    });

    const active = this.labels[this.cursor];
    if (this.highlight && active) {
      this.highlight.clear();
      this.highlight.fillStyle(Slab.glow, 0.12);
      const bar = this.rowHeight * scale;
      this.highlight.fillRoundedRect(designX(-146), active.y - bar / 2, 292 * scale, bar, 4);
      this.highlight.fillStyle(Slab.glow, 0.65);
      this.highlight.fillRect(designX(-146), active.y - bar / 2, 2 * scale, bar);
    }

    // Volume meters, drawn beside their labels.
    const levels: Array<number | null> = this.items.map((item) => {
      const label = item.label();
      if (label === 'MUSIC') return settings.musicVolume;
      if (label === 'SOUND') return settings.sfxVolume;
      return null;
    });

    this.meters.forEach((meter, index) => {
      meter.clear();
      const level = levels[index];
      const label = this.labels[index];
      if (level === null || !label) return;

      const x = designX(20);
      const y = label.y - 5 * scale;
      const cellW = 20 * scale;
      const gap = 4 * scale;
      for (let i = 0; i < 5; i += 1) {
        const on = level > i / 5 + 0.001;
        meter.fillStyle(on ? Slab.glow : Slab.edge, on ? 0.85 : 0.35);
        meter.fillRect(x + i * (cellW + gap), y, cellW, 10 * scale);
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Input
   * ---------------------------------------------------------------- */

  private point(index: number): void {
    if (index === this.cursor) return;
    this.cursor = index;
    this.refresh();
    if (this.unlocked) audio().sfx.uiMove();
  }

  /**
   * A tap on a row acts on the first tap, prompt or no prompt.
   *
   * Unlocking audio needs a gesture, and this is one -- but unlike a blind key
   * press it landed on a labelled button that the player could see and aimed
   * at, so swallowing it to dismiss "PRESS ANY KEY" would just look like the
   * button is broken. The prompt is cleared and the row fires, in that order.
   */
  private press(index: number): void {
    this.unlockAudio();
    this.cursor = index;
    this.refresh();
    this.items[index]?.activate();
    this.refresh();
    audio().sfx.uiSelect();
  }

  /**
   * A tap on the art rather than on a row.
   *
   * There is no button under the finger here, so the first one is spent on
   * unlocking audio and clearing the prompt: a stray tap while the player is
   * still reading the screen should not drop them into cave A.
   */
  private onPointer(_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length > 0) return;
    const wasLocked = !this.unlocked;
    this.unlockAudio();
    // Unlike a row, there is no button under this finger, so the first tap on
    // bare rock is spent on the prompt alone.
    if (wasLocked) return;
    this.items[0]?.activate();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.repeat && ['Enter', 'NumpadEnter', 'Space'].includes(event.code)) return;
    // The first key both answers "PRESS ANY KEY" and does its own job. A key
    // that dismissed the prompt and nothing else looked like a dropped input.
    this.unlockAudio();

    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.move(+1);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.adjust(this.cursor, -1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.adjust(this.cursor, +1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        event.preventDefault();
        this.items[this.cursor].activate();
        audio().sfx.uiSelect();
        break;
      default:
        break;
    }
  }

  /** AudioEngine handles unsupported audio; unlocking never consumes an input. */
  private unlockAudio(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    audio().unlock();
    audio().engine.setMusicVolume(this.state.settings.musicVolume);
    audio().engine.setSfxVolume(this.state.settings.sfxVolume);
    this.prompt?.destroy();
    this.prompt = undefined;
    this.hint?.setVisible(true);
  }

  /**
   * Go fullscreen, or come back out.
   *
   * `toggleFullscreen` is called straight from the pointer or key handler that
   * triggered it: the browser only honours the request while it can still see
   * the gesture that asked for it, and an `await` before the call would lose
   * that. Everything after it is a promise, and a rejected one is reported to
   * the player rather than silently dropped -- a button that appears to do
   * nothing is worse than one that admits it cannot.
   *
   * The target is left to the helper, which takes the document element. Going
   * fullscreen on the game root instead would take the root out of the normal
   * flow and with it the safe-area insets that keep the canvas clear of a
   * notch and a home indicator.
   */
  private requestFullscreen(): void {
    if (this.fullscreenBusy) return;
    this.fullscreenBusy = true;

    void toggleFullscreen()
      .catch((error: unknown) => {
        console.warn('Could not change fullscreen', error);
        if (this.sys.isActive()) this.notify('FULLSCREEN UNAVAILABLE');
      })
      .finally(() => {
        this.fullscreenBusy = false;
        if (this.sys.isActive()) this.refresh();
      });
  }

  /**
   * Say something at the foot of the screen for a few seconds.
   *
   * It borrows the controls line's spot rather than opening a dialog, so the
   * message appears where the player is already being told things and nothing
   * moves underneath their thumb.
   */
  private notify(message: string): void {
    this.notice?.destroy();
    this.hint?.setVisible(false);

    const note = centred(this, layout().height - 52, message, bodyStyle(11, Ink.gold))
      .setDepth(Depth.Menu);
    this.notice = note;

    this.time.delayedCall(NOTICE_MS, () => {
      note.destroy();
      if (this.notice === note) this.notice = undefined;
      this.hint?.setVisible(this.unlocked);
    });
  }

  private move(delta: number): void {
    this.cursor = (this.cursor + delta + this.items.length) % this.items.length;
    this.refresh();
    audio().sfx.uiMove();
  }

  private adjust(index: number, delta: number): void {
    const item = this.items[index];
    if (!item.adjust) return;
    item.adjust(delta);
    this.refresh();
    void saveSettings(this.state.settings);
  }

  private toggle(key: 'lighting' | 'reducedMotion'): void {
    this.state.settings[key] = !this.state.settings[key];
    this.refresh();
    audio().sfx.uiMove();
  }

  private startRun(resume: boolean): void {
    if (resume) this.state.resumeRun();
    else this.state.newRun();
    void saveSettings(this.state.settings);
    this.scene.start(SceneKey.CaveIntro);
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
  }
}

/**
 * What the fullscreen row should read.
 *
 * A browser that will not allow fullscreen at all says so up front, rather
 * than offering a switch that fails the moment it is pressed.
 */
function fullscreenState(): string {
  if (!document.fullscreenEnabled) return 'N/A';
  return document.fullscreenElement ? 'ON ' : 'OFF';
}

function step(value: number, delta: number): number {
  return Math.min(1, Math.max(0, Math.round((value + delta * 0.2) * 10) / 10));
}
