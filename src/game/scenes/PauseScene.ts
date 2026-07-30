import Phaser from 'phaser';

import { layout } from '../../layout';

import { SceneKey } from '../../config';
import { audio } from '../audio/index';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { Ink, bodyStyle, card, centred, designY, relayoutOnResize, titleStyle } from './ui';

/** Overlay drawn on top of the frozen cave. */
export class PauseScene extends Phaser.Scene {
  private state!: RunState;

  constructor() {
    super({ key: SceneKey.Pause, active: false });
  }

  create(): void {
    relayoutOnResize(this);
    this.state = this.registry.get(RUN_STATE_KEY) as RunState;

    const shade = this.add.graphics();
    shade.fillStyle(0x03050c, 0.78);
    shade.fillRect(0, 0, layout().width, layout().height);

    card(this, 130, 320, 150);
    centred(this, designY(172), 'PAUSED', titleStyle(34));
    centred(this, designY(214), 'ESC  RESUME', bodyStyle(13));
    centred(this, designY(236), 'R    RESTART CAVE (COSTS A LIFE)', bodyStyle(11, Ink.dim));
    centred(this, designY(258), 'Q    ABANDON RUN', bodyStyle(11, Ink.dim));

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.resume, this);
  }

  private onKey(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Escape':
      case 'KeyP':
        event.preventDefault();
        this.resume();
        break;
      case 'KeyR':
        this.restart();
        break;
      case 'KeyQ':
        this.abandon();
        break;
      default:
        break;
    }
  }

  private resume(): void {
    audio().engine.setMuted(false);
    this.scene.resume(SceneKey.Game);
    this.scene.stop();
  }

  private restart(): void {
    audio().engine.setMuted(false);
    audio().music.stop(true);

    if (this.state.session.loseLife()) {
      this.scene.stop(SceneKey.Game);
      this.scene.start(SceneKey.CaveIntro);
    } else {
      this.scene.stop(SceneKey.Game);
      this.scene.start(SceneKey.GameOver);
    }
  }

  private abandon(): void {
    audio().engine.setMuted(false);
    audio().music.stop(true);
    this.scene.stop(SceneKey.Game);
    this.scene.start(SceneKey.GameOver);
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.resume, this);
  }
}
