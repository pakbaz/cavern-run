import Phaser from 'phaser';

import { layout } from '../../layout';

import {
  Depth,
  HUD_HEIGHT,
  SceneKey,
  TIME_CRITICAL_SECONDS,
  TIME_PRESSURE_SECONDS,
} from '../../config';
import { TextureKey } from '../render/TextureFactory';
import { RUN_STATE_KEY, type RunState } from './RunState';
import { bodyStyle, FONT, Ink, pad, relayoutOnResize } from './ui';

/**
 * The status bar: diamonds needed, time, score and lives.
 *
 * Runs as its own scene so it is not inside the world camera and does not
 * scroll with the cave. It reads the session every frame rather than
 * listening for events, which keeps it trivially in sync.
 */
export class HudScene extends Phaser.Scene {
  private state!: RunState;

  private quota!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private caveLabel!: Phaser.GameObjects.Text;
  private lives: Phaser.GameObjects.Image[] = [];

  constructor() {
    super({ key: SceneKey.Hud, active: false });
  }

  create(): void {
    relayoutOnResize(this);
    // The HUD is re-launched for every cave and rebuilt on rotation, and the
    // scene instance outlives both. Phaser destroys the old game objects, but
    // the array still holds them, so without this the row of spare-life heads
    // would grow by nine each visit and `syncLives` would be toggling the
    // dead ones from the previous cave.
    this.lives = [];
    this.state = this.registry.get(RUN_STATE_KEY) as RunState;

    const bar = this.add.graphics().setDepth(Depth.Hud);
    bar.fillStyle(0x080d18, 0.96);
    bar.fillRect(0, 0, layout().width, HUD_HEIGHT);
    bar.lineStyle(2, 0x1d2b40, 1);
    bar.lineBetween(0, HUD_HEIGHT, layout().width, HUD_HEIGHT);

    const mid = HUD_HEIGHT / 2;

    this.add.image(16, mid, TextureKey.diamond(0)).setScale(0.55).setDepth(Depth.Hud);
    this.quota = this.text(30, mid, '0/0', Ink.bright).setDepth(Depth.Hud);

    this.caveLabel = this.text(layout().width / 2, mid, '', Ink.accent).setOrigin(0.5, 0.5).setDepth(Depth.Hud);

    this.timer = this.text(layout().width - 12, mid, '000', Ink.bright).setOrigin(1, 0.5).setDepth(Depth.Hud);
    this.score = this.text(layout().width - 74, mid, '000000', Ink.gold).setOrigin(1, 0.5).setDepth(Depth.Hud);

    this.buildLives();
  }

  override update(): void {
    const { session } = this.state;
    const sim = session.simulation;

    const required = session.spec.diamondsRequired;
    const collected = sim.runtime.diamondsCollected;
    this.quota.setText(`${collected}/${required}`);
    // Turn gold the moment the exit is actually reachable.
    this.quota.setColor(collected >= required ? Ink.gold : Ink.bright);

    const seconds = sim.secondsLeft;
    this.timer.setText(pad(seconds, 3));
    this.timer.setColor(
      seconds <= TIME_CRITICAL_SECONDS
        ? Ink.danger
        : seconds <= TIME_PRESSURE_SECONDS
          ? Ink.gold
          : Ink.bright,
    );

    // Score climbs live as diamonds are taken. The cave's points are only
    // banked into the session at the exit, so show the sum of both or the
    // counter would sit still for a whole cave.
    this.score.setText(pad(session.score + sim.runtime.caveScore, 6));
    this.caveLabel.setText(`CAVE ${session.spec.letter}`);

    this.syncLives(session.lives);
  }

  private buildLives(): void {
    // A row of miner heads, classic-arcade style. Built once at the maximum
    // and shown or hidden, so earning an extra life costs no allocation.
    for (let i = 0; i < 9; i += 1) {
      this.lives.push(
        this.add
          .image(96 + i * 14, HUD_HEIGHT / 2, TextureKey.playerIdle(0))
          .setScale(0.4)
          .setDepth(Depth.Hud)
          .setVisible(false),
      );
    }
  }

  private syncLives(count: number): void {
    // The head you are currently using is not shown, matching the original.
    const spare = Math.max(0, count - 1);
    this.lives.forEach((icon, index) => icon.setVisible(index < spare));
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, { ...bodyStyle(13, color), fontFamily: FONT }).setOrigin(0, 0.5);
  }
}
