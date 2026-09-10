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
    card(this, 24, 380, 356);

    centred(this, designY(64), `CAVE ${spec.letter}`, titleStyle(34));
    centred(this, designY(100), spec.name.toUpperCase(), bodyStyle(15, Ink.accent));

    centred(this, designY(126), `CHALLENGE ${spec.difficulty}/5`, bodyStyle(10, Ink.gold));
    centred(this, designY(152), `${spec.diamondsRequired} GEMS / ${spec.timeLimit}s / ${session.lives} LIVES`, bodyStyle(12));

    const wrapWidth = Math.min(340, layout().width - 44);
    centred(this, designY(198), spec.objective, {
      ...bodyStyle(12, Ink.bright),
      wordWrap: { width: wrapWidth },
      align: 'center',
    });
    centred(this, designY(248), spec.mechanics.map((mechanic) => mechanic.replaceAll('-', ' ').toUpperCase()).join(' / '), {
      ...bodyStyle(9, Ink.accent),
      wordWrap: { width: wrapWidth },
      align: 'center',
    });
    centred(this, designY(296), spec.hint, {
      ...bodyStyle(11, Ink.dim),
      wordWrap: { width: wrapWidth },
      align: 'center',
    });
    centred(this, designY(350), 'ENTER / TAP TO DESCEND', bodyStyle(12, Ink.gold));
    centred(this, layout().height - 18, `${session.caveIndex + 1} OF ${CAVE_COUNT}`, bodyStyle(10, Ink.dim));

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
