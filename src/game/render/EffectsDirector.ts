import Phaser from 'phaser';

import { Depth, TILE_SIZE } from '../../config';
import { Tile } from '../engine/tiles';
import type { SimEvent } from '../engine/simTypes';
import { TextureKey } from './TextureFactory';

/**
 * Turns simulation events into things you can see.
 *
 * The simulation never knows this exists: it reports what happened, and this
 * class decides that a dig throws dirt, a landing boulder kicks up a puff, and
 * an explosion is worth a shockwave, a wash of light across the whole screen
 * and a shake of the camera.
 *
 * A scan can report a dozen explosions at once when a chain reaction goes off.
 * Particles are cheap enough to fire for every one of them, but a ring and a
 * screen flash per cell would be both expensive and unreadable, so those are
 * budgeted to one per scan.
 */
export class EffectsDirector {
  private readonly scene: Phaser.Scene;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;

  /** Ring sprites recycled for shockwaves, so a chain reaction allocates nothing. */
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private flash: Phaser.GameObjects.Rectangle | null = null;

  private reducedMotion = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.dust = scene.add
      .particles(0, 0, TextureKey.dust, {
        lifespan: { min: 220, max: 460 },
        speed: { min: 15, max: 60 },
        scale: { start: 0.95, end: 0 },
        alpha: { start: 0.75, end: 0 },
        rotate: { min: -90, max: 90 },
        gravityY: 90,
        emitting: false,
      })
      .setDepth(Depth.Particles);

    this.sparks = scene.add
      .particles(0, 0, TextureKey.spark, {
        lifespan: { min: 180, max: 440 },
        speed: { min: 25, max: 120 },
        scale: { start: 0.85, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(Depth.Particles);

    this.shards = scene.add
      .particles(0, 0, TextureKey.shard, {
        lifespan: { min: 260, max: 620 },
        speed: { min: 30, max: 100 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 140,
        tint: [0xffffff, 0x9df0ff, 0x5fd0ff],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(Depth.Particles);

    this.debris = scene.add
      .particles(0, 0, TextureKey.dust, {
        lifespan: { min: 320, max: 820 },
        speed: { min: 60, max: 220 },
        scale: { start: 1.5, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 240,
        tint: [0xffe9a0, 0xff8a3a, 0x8a5a3a, 0x4a3a30],
        emitting: false,
      })
      .setDepth(Depth.Particles);

    // Smoke lingers after the fire has gone out, which is what stops a blast
    // from vanishing the instant the explosion tiles clear.
    this.smoke = scene.add
      .particles(0, 0, TextureKey.smoke, {
        lifespan: { min: 700, max: 1400 },
        speed: { min: 8, max: 42 },
        scale: { start: 0.5, end: 1.6 },
        alpha: { start: 0.5, end: 0 },
        gravityY: -18,
        tint: [0x6a6a76, 0x3a3a44],
        emitting: false,
      })
      .setDepth(Depth.Particles);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /** Fire the visuals for one scan's worth of events. */
  handle(events: readonly SimEvent[]): void {
    let bigEffectSpent = false;

    for (const event of events) {
      switch (event.type) {
        case 'dig':
          this.dust.emitParticleAt(centre(event.x), centre(event.y), this.count(6));
          break;

        case 'push':
          this.dust.emitParticleAt(centre(event.x), centre(event.y) + 10, this.count(5));
          break;

        case 'land':
          if (event.tile === Tile.Diamond) {
            this.shards.emitParticleAt(centre(event.x), centre(event.y), this.count(4));
          } else {
            // Dirt squirts sideways from under the rock rather than upward.
            this.dust.emitParticleAt(centre(event.x) - 10, centre(event.y) + 12, this.count(4));
            this.dust.emitParticleAt(centre(event.x) + 10, centre(event.y) + 12, this.count(4));
            this.shake(0.0016, 70);
          }
          break;

        case 'diamond':
          this.shards.emitParticleAt(centre(event.x), centre(event.y), this.count(12));
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(6));
          this.ring(centre(event.x), centre(event.y), 0x9df0ff, 1.4, 320);
          break;

        case 'explode':
          this.debris.emitParticleAt(centre(event.x), centre(event.y), this.count(16));
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(10));
          this.smoke.emitParticleAt(centre(event.x), centre(event.y), this.count(4));
          if (!bigEffectSpent) {
            bigEffectSpent = true;
            this.ring(centre(event.x), centre(event.y), 0xffc86a, 3.4, 460);
            this.screenFlash(0xffb347, 0.28, 220);
            this.shake(0.006, 220);
          }
          break;

        case 'magicWallStart':
        case 'magicWallConvert':
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(7));
          break;

        case 'slime':
          this.dust.emitParticleAt(centre(event.x), centre(event.y), this.count(4));
          break;

        case 'exitOpen':
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(26));
          this.ring(centre(event.x), centre(event.y), 0x9dffd8, 4.5, 700);
          this.screenFlash(0x9dffd8, 0.2, 320);
          this.shake(0.003, 180);
          break;

        case 'playerBorn':
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(22));
          this.ring(centre(event.x), centre(event.y), 0xfff6c2, 2.6, 420);
          break;

        case 'playerDied':
          this.debris.emitParticleAt(centre(event.x), centre(event.y), this.count(24));
          this.smoke.emitParticleAt(centre(event.x), centre(event.y), this.count(6));
          this.ring(centre(event.x), centre(event.y), 0xff6a4a, 4, 560);
          this.screenFlash(0xff3a2a, 0.34, 300);
          this.shake(0.009, 320);
          break;

        default:
          break;
      }
    }
  }

  destroy(): void {
    this.dust.destroy();
    this.sparks.destroy();
    this.shards.destroy();
    this.debris.destroy();
    this.smoke.destroy();
    for (const ring of this.rings) ring.destroy();
    this.rings.length = 0;
    this.flash?.destroy();
    this.flash = null;
  }

  private count(n: number): number {
    return this.reducedMotion ? Math.max(1, Math.round(n / 3)) : n;
  }

  private shake(intensity: number, duration: number): void {
    if (this.reducedMotion) return;
    this.scene.cameras.main.shake(duration, intensity, false);
  }

  /**
   * An expanding shockwave. Additive, so it brightens whatever it passes over
   * and disappears cleanly at the end of its life instead of leaving a smudge.
   */
  private ring(x: number, y: number, tint: number, cells: number, duration: number): void {
    if (this.reducedMotion) return;

    const image = this.freeRing();
    image
      .setPosition(x, y)
      .setTint(tint)
      .setAlpha(0.85)
      .setDisplaySize(TILE_SIZE * 0.5, TILE_SIZE * 0.5)
      .setVisible(true);

    const target = cells * TILE_SIZE;
    this.scene.tweens.add({
      targets: image,
      displayWidth: target,
      displayHeight: target,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => image.setVisible(false),
    });
  }

  private freeRing(): Phaser.GameObjects.Image {
    for (const ring of this.rings) if (!ring.visible) return ring;
    const created = this.scene.add
      .image(0, 0, TextureKey.ring)
      .setOrigin(0.5, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(Depth.Particles)
      .setVisible(false);
    this.rings.push(created);
    return created;
  }

  /** A wash of light over the whole viewport, pinned to the screen. */
  private screenFlash(tint: number, peak: number, duration: number): void {
    if (this.reducedMotion) return;

    const camera = this.scene.cameras.main;
    if (!this.flash) {
      this.flash = this.scene.add
        .rectangle(0, 0, camera.width, camera.height, 0xffffff)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(Depth.Overlay);
    }

    this.flash.setSize(camera.width, camera.height);
    this.flash.setFillStyle(tint);
    this.flash.setAlpha(peak);
    this.scene.tweens.add({
      targets: this.flash,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
    });
  }
}

function centre(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}
