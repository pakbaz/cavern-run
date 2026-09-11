import Phaser from 'phaser';

import { Depth, HUD_HEIGHT, SceneKey, TIME_CRITICAL_SECONDS, TIME_PRESSURE_SECONDS } from '../../config';
import { layout } from '../../layout';
import { toggleFullscreen } from '../../fullscreen';
import { TextureKey } from '../render/TextureFactory';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { bodyStyle, Ink, pad, relayoutOnResize } from './ui';

/** Compact instruments above the cave, with no overlay controls. */
export class HudScene extends Phaser.Scene {
  private state!: RunState;
  private quota!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private lives!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Rectangle;
  private fullscreenLabel!: Phaser.GameObjects.Text;
  private fullscreenBusy = false;

  constructor() {
    super({ key: SceneKey.Hud, active: false });
  }

  create(): void {
    relayoutOnResize(this);
    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    this.fullscreenBusy = false;
    const { width } = layout();
    const compact = width < 520;
    const bar = this.add.graphics().setDepth(Depth.Hud);
    bar.fillStyle(0x080f1b, 1);
    bar.fillRect(0, 0, width, HUD_HEIGHT);
    bar.lineStyle(1, 0x2e4a5c, 1);
    bar.lineBetween(0, HUD_HEIGHT - 2, width, HUD_HEIGHT - 2);
    this.progress = this.add.rectangle(0, HUD_HEIGHT - 2, 1, 2, 0x68ded0).setOrigin(0).setDepth(Depth.Hud);

    const mid = HUD_HEIGHT / 2 - 1;
    this.add.image(16, mid, TextureKey.diamond(0)).setScale(0.55).setDepth(Depth.Hud);
    this.quota = this.text(30, mid, '', Ink.bright);
    this.add.image(108, mid, TextureKey.playerIdle(0)).setScale(0.5).setDepth(Depth.Hud);
    this.lives = this.text(120, mid, '', Ink.bright);
    this.text(compact ? 86 : width / 2, mid, `${compact ? '' : 'CAVE '}${this.state.session.spec.letter}`, Ink.accent).setOrigin(0.5);
    this.timer = this.text(width - 42, mid, '', Ink.bright).setOrigin(1, 0.5);
    this.score = this.text(width - 96, mid, '', Ink.gold).setOrigin(1, 0.5).setVisible(width >= 300);
    this.add.rectangle(width - 18, mid, 34, 28, 0x142534).setStrokeStyle(1, 0x38536a)
      .setDepth(Depth.Hud).setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.fullscreen());
    this.fullscreenLabel = this.text(width - 18, mid, 'FULL', Ink.accent, 9).setOrigin(0.5);
  }

  override update(): void {
    const { session } = this.state;
    const sim = session.simulation;
    const required = session.spec.diamondsRequired;
    const collected = sim.runtime.diamondsCollected;
    const open = collected >= required;
    this.quota.setText(`${collected}/${required}`).setColor(open ? Ink.gold : Ink.bright);
    this.progress.displayWidth = layout().width * Math.min(1, collected / required);
    this.progress.setFillStyle(open ? 0xf5c76c : 0x68ded0);
    const seconds = sim.secondsLeft;
    this.timer.setText(`${pad(seconds, 3)}s`).setColor(
      seconds <= TIME_CRITICAL_SECONDS ? Ink.danger : seconds <= TIME_PRESSURE_SECONDS ? Ink.gold : Ink.bright,
    );
    this.score.setText(pad(session.score + sim.runtime.caveScore, 6));
    this.lives.setText(`${session.lives}`);
    this.fullscreenLabel.setText(document.fullscreenElement ? 'BACK' : 'FULL');
  }

  private fullscreen(): void {
    if (this.fullscreenBusy) return;
    this.fullscreenBusy = true;
    void toggleFullscreen()
      .catch((error: unknown) => {
        console.warn('Could not enter fullscreen', error);
        if (!this.sys.isActive()) return;
        const background = this.add.rectangle(0, 0, layout().width - 38, HUD_HEIGHT, 0x080f1b)
          .setOrigin(0).setDepth(Depth.Hud + 1);
        const message = this.text((layout().width - 38) / 2, HUD_HEIGHT / 2, 'FULLSCREEN UNAVAILABLE', Ink.gold, 10)
          .setOrigin(0.5).setDepth(Depth.Hud + 2);
        this.time.delayedCall(3500, () => { message.destroy(); background.destroy(); });
      })
      .finally(() => { this.fullscreenBusy = false; });
  }

  private text(x: number, y: number, value: string, color: string, size = 12): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, bodyStyle(size, color)).setOrigin(0, 0.5).setDepth(Depth.Hud);
  }
}
