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
 * an explosion is worth shaking the camera for.
 */
export class EffectsDirector {
  private readonly scene: Phaser.Scene;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly debris: Phaser.GameObjects.Particles.ParticleEmitter;

  private reducedMotion = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.dust = scene.add
      .particles(0, 0, TextureKey.dust, {
        lifespan: { min: 220, max: 420 },
        speed: { min: 15, max: 55 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.75, end: 0 },
        gravityY: 90,
        emitting: false,
      })
      .setDepth(Depth.Particles);

    this.sparks = scene.add
      .particles(0, 0, TextureKey.spark, {
        lifespan: { min: 180, max: 420 },
        speed: { min: 25, max: 110 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(Depth.Particles);

    this.shards = scene.add
      .particles(0, 0, TextureKey.shard, {
        lifespan: { min: 260, max: 560 },
        speed: { min: 30, max: 90 },
        scale: { start: 1, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 140,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(Depth.Particles);

    this.debris = scene.add
      .particles(0, 0, TextureKey.dust, {
        lifespan: { min: 320, max: 780 },
        speed: { min: 60, max: 200 },
        scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 220,
        tint: [0xffe9a0, 0xff8a3a, 0x8a5a3a],
        emitting: false,
      })
      .setDepth(Depth.Particles);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /** Fire the visuals for one scan's worth of events. */
  handle(events: readonly SimEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'dig':
          this.dust.emitParticleAt(centre(event.x), centre(event.y), this.count(5));
          break;

        case 'push':
          this.dust.emitParticleAt(centre(event.x), centre(event.y) + 10, this.count(4));
          break;

        case 'land':
          if (event.tile === Tile.Diamond) {
            this.shards.emitParticleAt(centre(event.x), centre(event.y), this.count(3));
          } else {
            this.dust.emitParticleAt(centre(event.x), centre(event.y) + 12, this.count(7));
            this.shake(0.0016, 70);
          }
          break;

        case 'diamond':
          this.shards.emitParticleAt(centre(event.x), centre(event.y), this.count(10));
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(5));
          break;

        case 'explode':
          this.debris.emitParticleAt(centre(event.x), centre(event.y), this.count(16));
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(10));
          this.shake(0.006, 220);
          break;

        case 'magicWallStart':
        case 'magicWallConvert':
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(6));
          break;

        case 'slime':
          this.dust.emitParticleAt(centre(event.x), centre(event.y), this.count(4));
          break;

        case 'exitOpen':
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(24));
          this.shake(0.003, 180);
          break;

        case 'playerBorn':
          this.sparks.emitParticleAt(centre(event.x), centre(event.y), this.count(20));
          break;

        case 'playerDied':
          this.debris.emitParticleAt(centre(event.x), centre(event.y), this.count(22));
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
  }

  private count(n: number): number {
    return this.reducedMotion ? Math.max(1, Math.round(n / 3)) : n;
  }

  private shake(intensity: number, duration: number): void {
    if (this.reducedMotion) return;
    this.scene.cameras.main.shake(duration, intensity, false);
  }
}

function centre(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}
