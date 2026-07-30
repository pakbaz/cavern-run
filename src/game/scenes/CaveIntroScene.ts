import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../../config';
import { audio } from '../audio/index';
import { CAVE_COUNT } from '../levels/index';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { bodyStyle, centred, Ink, panel, titleStyle } from './ui';

/** How long the card sits before the cave starts, if nobody skips it. */
const DWELL_MS = 2200;

/**
 * The card between caves: which cave, how many diamonds, how long, and a
 * line of flavour. Skippable, because on a retry you already know.
 */
export class CaveIntroScene extends Phaser.Scene {
  private state!: RunState;
  private advancing = false;

  constructor() {
    super(SceneKey.CaveIntro);
  }

  create(): void {
    // Phaser keeps one instance of each scene for the whole session and
    // re-runs create() on every visit, so per-visit state has to be cleared
    // by hand. Missing this leaves the guard latched and the card never
    // advances the second time you see it.
    this.advancing = false;

    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    const { session } = this.state;
    const spec = session.spec;

    this.cameras.main.setBackgroundColor('#05070f');
    panel(this, GAME_WIDTH / 2 - 190, 96, 380, 200);

    centred(this, 138, `CAVE ${spec.letter}`, titleStyle(44));
    centred(this, 176, spec.name.toUpperCase(), bodyStyle(15, Ink.accent));

    centred(this, 214, `COLLECT ${spec.diamondsRequired} DIAMONDS`, bodyStyle(13));
    centred(this, 234, `${spec.timeLimit} SECONDS`, bodyStyle(13));
    centred(this, 256, `LIVES ${session.lives}`, bodyStyle(13, Ink.gold));

    centred(this, 282, spec.hint.toUpperCase(), bodyStyle(11, Ink.dim));
    centred(this, GAME_HEIGHT - 40, `${session.caveIndex + 1} OF ${CAVE_COUNT}`, bodyStyle(11, Ink.dim));

    this.time.delayedCall(DWELL_MS, () => this.begin());
    this.input.keyboard?.once('keydown', () => this.begin());
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.begin());
  }

  private begin(): void {
    // Both the timer and an input can fire; only the first should count.
    if (this.advancing) return;
    this.advancing = true;
    audio().unlock();
    this.scene.start(SceneKey.Game);
  }
}
