import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../../config';
import { audio } from '../audio/index';
import {
  loadHighScores,
  normalizeInitials,
  qualifies,
  submitScore,
  type ScoreEntry,
} from '../state/profile';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { bodyStyle, centred, Ink, pad, panel, pulse, titleStyle } from './ui';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

/**
 * End of run, with arcade initials entry when the score earns a place.
 *
 * Entry is a three-slot letter wheel rather than a text field: it works
 * identically on keyboard, gamepad and touch, and it is what the machine
 * this game is descended from would have done.
 */
export class GameOverScene extends Phaser.Scene {
  private state!: RunState;

  private entering = false;
  private slots = [0, 0, 0];
  private slot = 0;
  private slotText: Phaser.GameObjects.Text[] = [];
  private submitted = false;

  constructor() {
    super(SceneKey.GameOver);
  }

  async create(): Promise<void> {
    // Scene instances outlive a visit; clear per-visit state (see CaveIntroScene).
    this.entering = false;
    this.submitted = false;
    this.slot = 0;
    this.slots = [0, 0, 0];
    this.slotText = [];

    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    const { session, won } = this.state;

    this.cameras.main.setBackgroundColor('#05070f');
    panel(this, GAME_WIDTH / 2 - 190, 96, 380, 200);

    centred(this, 142, won ? 'YOU ESCAPED' : 'GAME OVER', titleStyle(won ? 36 : 40));
    centred(this, 182, `SCORE  ${pad(session.score, 6)}`, bodyStyle(16, Ink.gold));
    centred(this, 206, `REACHED CAVE ${session.spec.letter}`, bodyStyle(13));

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);

    // Input is bound only once the table has loaded. Binding before the await
    // leaves a window where `entering` is still false, so a key pressed while
    // storage is opening would dismiss the screen and skip initials entry.
    const scores = await loadHighScores();
    if (qualifies(scores, session.score)) {
      this.beginEntry();
    } else {
      this.showTable(scores);
    }
    this.input.keyboard?.on('keydown', this.onKey, this);
  }

  private beginEntry(): void {
    this.entering = true;
    centred(this, 236, 'NEW BEST RUN -- ENTER INITIALS', bodyStyle(11, Ink.accent));

    const startX = GAME_WIDTH / 2 - 40;
    this.slotText = this.slots.map((_, index) =>
      this.add
        .text(startX + index * 40, 268, 'A', { ...titleStyle(30) })
        .setOrigin(0.5),
    );
    this.refreshSlots();

    const hint = centred(this, GAME_HEIGHT - 34, 'ARROWS + ENTER', bodyStyle(11, Ink.dim));
    pulse(this, hint);
  }

  private showTable(scores: readonly ScoreEntry[]): void {
    const rows = scores.slice(0, 5);
    if (rows.length > 0) {
      centred(this, 236, 'BEST RUNS', bodyStyle(11, Ink.gold));
      rows.forEach((row, index) => {
        centred(
          this,
          254 + index * 16,
          `${index + 1}. ${row.name.padEnd(4)} ${pad(row.score, 6)}  CAVE ${row.caveLetter}`,
          bodyStyle(11, Ink.body),
        );
      });
    }
    const hint = centred(this, GAME_HEIGHT - 34, 'PRESS ANY KEY', bodyStyle(11, Ink.dim));
    pulse(this, hint);
  }

  private refreshSlots(): void {
    this.slotText.forEach((text, index) => {
      text.setText(LETTERS[this.slots[index]] ?? 'A');
      text.setColor(index === this.slot ? Ink.gold : Ink.body);
    });
  }

  private onPointer(): void {
    // Touch players cycle the current slot, and a long-ish table of letters
    // would be miserable, so tapping just confirms with whatever is showing.
    if (this.entering) this.finish();
    else this.toTitle();
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.entering) {
      this.toTitle();
      return;
    }

    // Note: no WASD aliases here, unlike everywhere else in the game. On this
    // screen every letter key has to mean "type that letter", otherwise the
    // initials A, W, S and D would be impossible to enter.
    switch (event.code) {
      case 'ArrowUp':
        this.cycle(-1);
        break;
      case 'ArrowDown':
        this.cycle(+1);
        break;
      case 'ArrowLeft':
        this.slot = (this.slot + 2) % 3;
        audio().sfx.uiMove();
        this.refreshSlots();
        break;
      case 'ArrowRight':
        this.slot = (this.slot + 1) % 3;
        audio().sfx.uiMove();
        this.refreshSlots();
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        event.preventDefault();
        this.finish();
        break;
      default: {
        // Typing a letter fills the current slot and steps along, which is
        // what anyone with a keyboard will try first.
        const typed = event.key.toUpperCase();
        const at = LETTERS.indexOf(typed);
        if (at >= 0) {
          this.slots[this.slot] = at;
          this.slot = Math.min(2, this.slot + 1);
          audio().sfx.uiMove();
          this.refreshSlots();
        }
        break;
      }
    }
  }

  private cycle(delta: number): void {
    this.slots[this.slot] = (this.slots[this.slot] + delta + LETTERS.length) % LETTERS.length;
    audio().sfx.uiMove();
    this.refreshSlots();
  }

  private async finish(): Promise<void> {
    if (this.submitted) return;
    this.submitted = true;
    audio().sfx.uiSelect();

    const { session } = this.state;
    await submitScore({
      name: normalizeInitials(this.slots.map((index) => LETTERS[index] ?? '').join('')),
      score: session.score,
      caveReached: session.caveIndex + 1,
      caveLetter: session.spec.letter,
      date: new Date().toISOString(),
    });

    this.toTitle();
  }

  private toTitle(): void {
    this.scene.start(SceneKey.Title);
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
  }
}
