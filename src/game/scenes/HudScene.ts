import Phaser from 'phaser';

import { CONTROL_HEIGHT, Depth, HUD_HEIGHT, SceneKey, TIME_CRITICAL_SECONDS, TIME_PRESSURE_SECONDS } from '../../config';
import { layout } from '../../layout';
import { Dir, type Direction } from '../engine/tiles';
import { ControlEvent } from '../input/InputManager';
import { TextureKey } from '../render/TextureFactory';
import type { GameScene } from './GameScene';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { bodyStyle, Ink, pad, relayoutOnResize } from './ui';

/** Fixed instruments and pointer controls, both outside the scrolling cave. */
export class HudScene extends Phaser.Scene {
  private state!: RunState;
  private quota!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private lives!: Phaser.GameObjects.Text;
  private grabLabel!: Phaser.GameObjects.Text;
  private grabButton!: Phaser.GameObjects.Rectangle;
  private status!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: SceneKey.Hud, active: false });
  }

  create(): void {
    relayoutOnResize(this);
    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    const { width, height } = layout();
    const compact = width < 520;
    const bar = this.add.graphics().setDepth(Depth.Hud);
    bar.fillStyle(0x080f1b, 1);
    bar.fillRect(0, 0, width, HUD_HEIGHT);
    bar.fillRect(0, height - CONTROL_HEIGHT, width, CONTROL_HEIGHT);
    bar.lineStyle(1, 0x2e4a5c, 1);
    bar.lineBetween(0, HUD_HEIGHT - 2, width, HUD_HEIGHT - 2);
    bar.lineBetween(0, height - CONTROL_HEIGHT, width, height - CONTROL_HEIGHT);
    this.progress = this.add.rectangle(0, HUD_HEIGHT - 2, 1, 2, 0x68ded0).setOrigin(0).setDepth(Depth.Hud);

    const mid = HUD_HEIGHT / 2 - 1;
    this.add.image(16, mid, TextureKey.diamond(0)).setScale(0.55).setDepth(Depth.Hud);
    this.quota = this.text(30, mid, '', Ink.bright);
    this.add.image(108, mid, TextureKey.playerIdle(0)).setScale(0.5).setDepth(Depth.Hud);
    this.lives = this.text(120, mid, '', Ink.bright);
    this.text(width / 2, mid, `${compact ? '' : 'CAVE '}${this.state.session.spec.letter}`, Ink.accent).setOrigin(0.5);
    this.timer = this.text(width - 10, mid, '', Ink.bright).setOrigin(1, 0.5);
    this.score = this.text(width - 66, mid, '', Ink.gold).setOrigin(1, 0.5);
    this.buildControls();

    const release = (pointer: Phaser.Input.Pointer): void => this.emitControl(ControlEvent.Release, `button-${pointer.id}`);
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_UP, release);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    });
  }

  override update(): void {
    const { session } = this.state;
    const sim = session.simulation;
    const required = session.spec.diamondsRequired;
    const collected = sim.runtime.diamondsCollected;
    const open = collected >= required;
    this.quota.setText(`${collected}/${required}`).setColor(open ? Ink.gold : Ink.bright);
    this.progress.width = layout().width * Math.min(1, collected / required);
    this.progress.setFillStyle(open ? 0xf5c76c : 0x68ded0);
    const seconds = sim.secondsLeft;
    this.timer.setText(`${pad(seconds, 3)}s`).setColor(
      seconds <= TIME_CRITICAL_SECONDS ? Ink.danger : seconds <= TIME_PRESSURE_SECONDS ? Ink.gold : Ink.bright,
    );
    this.score.setText(pad(session.score + sim.runtime.caveScore, 6));
    this.lives.setText(`${session.lives}`);
    const game = this.scene.get(SceneKey.Game) as GameScene;
    const grab = game.isGrabMode;
    this.grabLabel.setText(grab ? 'GRAB ON' : 'GRAB');
    this.grabLabel.setColor(grab ? '#071319' : Ink.accent);
    this.grabButton.setFillStyle(grab ? 0x75e3ce : 0x142534);
    this.status.setText(grab ? 'GRAB MODE: DIG WITHOUT MOVING' : open ? 'QUOTA MET: FIND THE LIT EXIT' : 'HOLD ARROWS TO MOVE / TAP GRAB TO DIG IN PLACE');
  }

  private buildControls(): void {
    const { width, height } = layout();
    const arrowWidth = Math.min(56, (width - 154) / 4);
    const total = arrowWidth * 4 + 134;
    let x = (width - total) / 2;
    const y = height - CONTROL_HEIGHT + 26;
    const directions: ReadonlyArray<readonly [string, Direction]> = [
      ['<', Dir.Left], ['^', Dir.Up], ['v', Dir.Down], ['>', Dir.Right],
    ];
    for (const [label, dir] of directions) {
      const button = this.button(x, y, arrowWidth, label, 22);
      button.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        this.emitControl(ControlEvent.Direction, `button-${pointer.id}`, dir);
        button.setFillStyle(0x315569);
      });
      const release = (pointer: Phaser.Input.Pointer): void => {
        this.emitControl(ControlEvent.Release, `button-${pointer.id}`);
        button.setFillStyle(0x142534);
      };
      button.on(Phaser.Input.Events.POINTER_UP, release);
      button.on(Phaser.Input.Events.POINTER_OUT, release);
      button.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown) return;
        this.emitControl(ControlEvent.Direction, `button-${pointer.id}`, dir);
        button.setFillStyle(0x315569);
      });
      x += arrowWidth + 6;
    }
    this.grabButton = this.button(x, y, 66, '', 11);
    this.grabLabel = this.text(x + 33, y, 'GRAB', Ink.accent, 11).setOrigin(0.5);
    this.grabButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.emitControl(ControlEvent.Grab));
    x += 72;
    this.button(x, y, 44, 'II', 16)
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.emitControl(ControlEvent.Pause));
    this.status = this.text(width / 2, height - 7, '', Ink.dim, width < 520 ? 8 : 10).setOrigin(0.5);
  }

  private button(x: number, y: number, width: number, label: string, fontSize: number): Phaser.GameObjects.Rectangle {
    const button = this.add.rectangle(x + width / 2, y, width, 44, 0x142534)
      .setStrokeStyle(1, 0x38536a).setDepth(Depth.Hud).setInteractive({ useHandCursor: true });
    this.text(x + width / 2, y, label, Ink.bright, fontSize).setOrigin(0.5);
    return button;
  }

  private emitControl(event: string, ...args: unknown[]): void {
    if (this.scene.isActive(SceneKey.Game)) this.scene.get(SceneKey.Game).events.emit(event, ...args);
  }

  private text(x: number, y: number, value: string, color: string, size = 12): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, bodyStyle(size, color)).setOrigin(0, 0.5).setDepth(Depth.Hud);
  }
}
