import Phaser from 'phaser';

import { layout } from '../../layout';

import { SceneKey } from '../../config';
import { audio } from '../audio/index';
import { CAVE_COUNT } from '../levels/index';
import { loadHighScores, type ScoreEntry } from '../state/profile';
import { saveSettings } from '../state/settings';
import { POSTER_KEY } from './BootScene';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { Ink, bodyStyle, card, centred, designX, designY, pad, pulse, relayoutOnResize, titleStyle } from './ui';

interface MenuItem {
  readonly label: () => string;
  readonly activate: () => void;
  /** Left/right adjusts a value rather than selecting. */
  readonly adjust?: (delta: number) => void;
}

/**
 * Poster, menu and the local score table.
 *
 * This is also where audio gets unlocked: browsers will not start an
 * AudioContext without a user gesture, so the first key press or tap here
 * both starts the music and dismisses the "press to begin" prompt.
 */
export class TitleScene extends Phaser.Scene {
  private state!: RunState;
  private items: MenuItem[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  private scores: ScoreEntry[] = [];
  private unlocked = false;
  private prompt?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Title);
  }

  async create(): Promise<void> {
    relayoutOnResize(this);
    // Per-visit state; `unlocked` is deliberately sticky, because the audio
    // context is a page-lifetime singleton and stays unlocked once granted.
    this.cursor = 0;
    this.items = [];

    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    this.drawBackdrop();

    centred(this, designY(74), 'CAVERN RUN', titleStyle(46)).setLetterSpacing?.(2);
    centred(this, designY(112), `${CAVE_COUNT} CAVES.  ONE WAY OUT.`, bodyStyle(13, Ink.accent));

    this.buildMenu();

    this.prompt = centred(this, layout().height - 26, 'PRESS ANY KEY', bodyStyle(12, Ink.dim));
    pulse(this, this.prompt);

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);

    this.scores = await loadHighScores();
    this.drawScores();
  }

  private drawBackdrop(): void {
    if (this.textures.exists(POSTER_KEY)) {
      // The poster carries its own title lettering on the left, which would
      // fight the real one. Zooming in and anchoring right crops that off and
      // keeps the part worth showing: the cavern and the crystal seams.
      const poster = this.add.image(layout().width, layout().height / 2, POSTER_KEY).setOrigin(1, 0.5);
      const cover = Math.max(layout().width / poster.width, layout().height / poster.height);
      poster.setScale(cover * 1.7).setAlpha(0.6);
    } else {
      this.cameras.main.setBackgroundColor('#070c18');
    }

    // Darken toward the bottom so the menu stays readable over the art.
    const shade = this.add.graphics();
    shade.fillStyle(0x04060e, 0.72);
    shade.fillRect(0, layout().height * 0.34, layout().width, layout().height * 0.66);
  }

  private buildMenu(): void {
    const { settings } = this.state;

    this.items = [
      { label: () => 'START RUN', activate: () => this.startRun() },
      {
        label: () => `MUSIC      ${meter(settings.musicVolume)}`,
        activate: () => this.adjust(0, +1),
        adjust: (delta) => {
          settings.musicVolume = step(settings.musicVolume, delta);
          audio().engine.setMusicVolume(settings.musicVolume);
        },
      },
      {
        label: () => `SOUND      ${meter(settings.sfxVolume)}`,
        activate: () => this.adjust(1, +1),
        adjust: (delta) => {
          settings.sfxVolume = step(settings.sfxVolume, delta);
          audio().engine.setSfxVolume(settings.sfxVolume);
          audio().sfx.uiMove();
        },
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

    card(this, 152 - 16, 336, this.items.length * 24 + 24);

    this.labels = this.items.map((item, index) =>
      this.add
        .text(designX(-148), designY(152 + index * 24), item.label(), bodyStyle(14))
        .setOrigin(0, 0.5),
    );
    this.refresh();
  }

  private drawScores(): void {
    if (this.scores.length === 0) return;

    const rows = this.scores.slice(0, 5);
    card(this, 290 - 20, 336, rows.length * 18 + 34);

    this.add
      .text(designX(-148), designY(290 - 6), 'BEST RUNS', bodyStyle(11, Ink.gold))
      .setOrigin(0, 0.5);

    rows.forEach((row, index) => {
      const line = `${index + 1}. ${row.name.padEnd(4)} ${pad(row.score, 6)}   CAVE ${row.caveLetter}`;
      this.add
        .text(designX(-148), designY(290 + 14 + index * 18), line, bodyStyle(12, Ink.body))
        .setOrigin(0, 0.5);
    });
  }

  private refresh(): void {
    this.labels.forEach((label, index) => {
      const selected = index === this.cursor;
      label.setText(`${selected ? '\u25b8 ' : '  '}${this.items[index].label()}`);
      label.setColor(selected ? Ink.bright : Ink.body);
    });
  }

  private onPointer(): void {
    if (!this.ensureAudio()) return;
    this.startRun();
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.ensureAudio()) return;

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
        audio().sfx.uiSelect();
        this.items[this.cursor].activate();
        break;
      default:
        break;
    }
  }

  /**
   * The first interaction is spent purely on unlocking audio, so a player
   * who mashes Enter does not skip straight past the menu into cave A.
   */
  private ensureAudio(): boolean {
    if (this.unlocked) return true;
    this.unlocked = true;
    audio().unlock();
    audio().engine.setMusicVolume(this.state.settings.musicVolume);
    audio().engine.setSfxVolume(this.state.settings.sfxVolume);
    this.prompt?.destroy();
    this.prompt = undefined;
    return false;
  }

  private move(delta: number): void {
    this.cursor = (this.cursor + delta + this.items.length) % this.items.length;
    audio().sfx.uiMove();
    this.refresh();
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
    audio().sfx.uiMove();
  }

  private startRun(): void {
    this.state.newRun();
    void saveSettings(this.state.settings);
    this.scene.start(SceneKey.CaveIntro);
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
  }
}

/** `0.6` renders as a five-block bar. */
function meter(value: number): string {
  const filled = Math.round(value * 5);
  return `${'\u2588'.repeat(filled)}${'\u2591'.repeat(5 - filled)}`;
}

function step(value: number, delta: number): number {
  return Math.min(1, Math.max(0, Math.round((value + delta * 0.2) * 10) / 10));
}
