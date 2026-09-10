import Phaser from 'phaser';

import { layout } from '../../layout';

import { SceneKey } from '../../config';
import { audio } from '../audio/index';
import { CAVE_COUNT } from '../levels/index';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { Ink, bodyStyle, card, centred, designY, relayoutOnResize, titleStyle } from './ui';

/**
 * The card between caves: which cave, how many diamonds, how long, and a
 * puzzle hint. The player decides when to start the clock.
 */
export class CaveIntroScene extends Phaser.Scene {
  private state!: RunState;
  private advancing = false;

  constructor() {
    super(SceneKey.CaveIntro);
  }

  create(): void {
    relayoutOnResize(this);
    // Phaser keeps one instance of each scene for the whole session and
    // re-runs create() on every visit, so per-visit state has to be cleared
    // by hand. Missing this leaves the guard latched and the card never
    // advances the second time you see it.
    this.advancing = false;

    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    const { session } = this.state;
    const spec = session.spec;

    this.cameras.main.setBackgroundColor('#05070f');
    card(this, 96, 380, 278);

    centred(this, designY(138), `CAVE ${spec.letter}`, titleStyle(44));
    centred(this, designY(176), spec.name.toUpperCase(), bodyStyle(15, Ink.accent));

    centred(this, designY(214), `COLLECT ${spec.diamondsRequired} DIAMONDS`, bodyStyle(13));
    centred(this, designY(234), `${spec.timeLimit} SECONDS`, bodyStyle(13));
    centred(this, designY(256), `LIVES ${session.lives}`, bodyStyle(13, Ink.gold));

    centred(this, designY(288), spec.hint, {
      ...bodyStyle(12, Ink.bright),
      wordWrap: { width: Math.min(340, layout().width - 44) },
      align: 'center',
    });
    centred(this, designY(350), 'ENTER / TAP TO DESCEND', bodyStyle(12, Ink.gold));
    centred(this, layout().height - 40, `${session.caveIndex + 1} OF ${CAVE_COUNT}`, bodyStyle(11, Ink.dim));

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.begin());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKey, this);
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (!['Enter', 'Space', 'NumpadEnter'].includes(event.code) || event.repeat) return;
    event.preventDefault();
    this.begin();
  }

  private begin(): void {
    // A keyboard and pointer can arrive in the same frame.
    if (this.advancing) return;
    this.advancing = true;
    audio().unlock();
    this.scene.start(SceneKey.Game);
  }
}
