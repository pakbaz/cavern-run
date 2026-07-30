import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey, TIME_BONUS_PER_SECOND } from '../../config';
import { audio } from '../audio/index';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { bodyStyle, centred, Ink, pad, panel, titleStyle } from './ui';

/** Seconds are counted off this fast, in milliseconds per second banked. */
const TALLY_MS = 26;

/**
 * The end-of-cave tally.
 *
 * Counting the remaining seconds off one at a time, each with its own blip,
 * is pure Boulder Dash ceremony -- it turns a number into a small reward.
 * Pressing a key skips straight to the total for anyone who has seen it.
 */
export class CaveCompleteScene extends Phaser.Scene {
  private state!: RunState;

  private remaining = 0;
  private banked = 0;
  private secondsLine!: Phaser.GameObjects.Text;
  private scoreLine!: Phaser.GameObjects.Text;
  private tally?: Phaser.Time.TimerEvent;
  private done = false;

  constructor() {
    super(SceneKey.CaveComplete);
  }

  create(): void {
    // Scene instances outlive a visit; clear per-visit state (see CaveIntroScene).
    this.done = false;
    this.remaining = 0;
    this.banked = 0;

    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    const result = this.state.lastResult;
    if (!result) {
      this.scene.start(SceneKey.Title);
      return;
    }

    this.cameras.main.setBackgroundColor('#05070f');
    panel(this, GAME_WIDTH / 2 - 180, 100, 360, 190);

    centred(this, 142, 'CAVE CLEAR', titleStyle(38));
    centred(this, 180, `${result.diamonds} DIAMONDS  ${pad(result.caveScore, 5)}`, bodyStyle(13));

    // The tally starts from the pre-bonus score and climbs, so the number
    // the player watches is the same one the HUD will show next cave.
    this.remaining = result.secondsLeft;
    this.banked = result.totalScore - result.timeBonus;

    this.secondsLine = centred(this, 212, '', bodyStyle(15, Ink.gold));
    this.scoreLine = centred(this, 240, '', bodyStyle(20, Ink.bright));
    this.refresh();

    if (result.extraLives > 0) {
      centred(this, 266, `EXTRA LIFE x${result.extraLives}`, bodyStyle(12, Ink.accent));
    }

    centred(this, GAME_HEIGHT - 34, 'PRESS ANY KEY', bodyStyle(11, Ink.dim));

    this.tally = this.time.addEvent({
      delay: TALLY_MS,
      loop: true,
      callback: this.tick,
      callbackScope: this,
    });

    this.input.keyboard?.on('keydown', this.advance, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.advance, this);
  }

  private tick(): void {
    if (this.remaining <= 0) {
      this.finishTally();
      return;
    }
    this.remaining -= 1;
    this.banked += TIME_BONUS_PER_SECOND;
    audio().sfx.bonusTick(this.remaining);
    this.refresh();
  }

  private refresh(): void {
    this.secondsLine.setText(`TIME BONUS  ${pad(this.remaining, 3)}`);
    this.scoreLine.setText(pad(this.banked, 6));
  }

  private finishTally(): void {
    this.tally?.remove();
    this.tally = undefined;
    this.remaining = 0;
    this.banked = this.state.lastResult?.totalScore ?? this.banked;
    this.refresh();
  }

  /**
   * First press finishes the tally instantly; second press moves on. Without
   * that, an eager player skips the cave-clear screen before reading it.
   */
  private advance(): void {
    if (this.tally) {
      this.finishTally();
      return;
    }
    if (this.done) return;
    this.done = true;

    const { session } = this.state;
    if (session.advanceCave()) {
      this.scene.start(SceneKey.CaveIntro);
    } else {
      this.state.won = true;
      this.scene.start(SceneKey.GameOver);
    }
  }

  shutdown(): void {
    this.tally?.remove();
    this.input.keyboard?.off('keydown', this.advance, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.advance, this);
  }
}
