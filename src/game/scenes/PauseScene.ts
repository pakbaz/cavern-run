import Phaser from 'phaser';

import { layout } from '../../layout';

import { SceneKey } from '../../config';
import { audio } from '../audio/index';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { Ink, bodyStyle, card, centred, designY, relayoutOnResize, titleStyle } from './ui';

/** Overlay drawn on top of the frozen cave. */
export class PauseScene extends Phaser.Scene {
  private state!: RunState;
  private leaving = false;

  constructor() {
    super({ key: SceneKey.Pause, active: false });
  }

  create(): void {
    relayoutOnResize(this);
    this.leaving = false;
    this.state = this.registry.get(RUN_STATE_KEY) as RunState;

    const shade = this.add.graphics();
    shade.fillStyle(0x03050c, 0.78);
    shade.fillRect(0, 0, layout().width, layout().height);

    card(this, 76, 340, 280);
    centred(this, designY(112), 'PAUSED', titleStyle(34));
    this.button(164, 'RESUME  [ESC]', () => this.resume());
    this.button(218, 'RESTART  [R]  -1 LIFE', () => this.restart());
    this.button(272, 'END RUN  [Q]', () => this.abandon());
    centred(this, designY(330), 'TAKE A MOMENT. THE CAVE CAN WAIT.', bodyStyle(10, Ink.dim));

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKey, this);
    });
  }

  private button(y: number, label: string, action: () => void): void {
    this.add.rectangle(layout().width / 2, designY(y), Math.min(292, layout().width - 40), 44, 0x182b3c)
      .setStrokeStyle(1, 0x466577)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.POINTER_DOWN, action);
    centred(this, designY(y), label, bodyStyle(12, Ink.bright));
  }

  private onKey(event: KeyboardEvent): void {
    if (event.repeat) return;
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
    if (this.leaving) return;
    this.leaving = true;
    audio().engine.setMuted(false);
    this.scene.resume(SceneKey.Game);
    this.scene.stop();
  }

  private restart(): void {
    if (this.leaving) return;
    this.leaving = true;
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
    if (this.leaving) return;
    this.leaving = true;
    audio().engine.setMuted(false);
    audio().music.stop(true);
    this.scene.stop(SceneKey.Game);
    this.scene.start(SceneKey.GameOver);
  }

}
