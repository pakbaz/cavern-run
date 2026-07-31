import Phaser from 'phaser';

import { CAVES } from '../levels/index';
import type { Cave } from '../engine/Cave';
import type { CaveRuntime, SimEvent } from '../engine/simTypes';
import type { CaveSpec } from '../levels/caveFormat';
import { EffectsDirector } from './EffectsDirector';
import { LightingLayer } from './LightingLayer';
import { WorldRenderer } from './WorldRenderer';

export * from './renderMath';
export { generateTextures, TextureKey } from './TextureFactory';
export { WorldRenderer } from './WorldRenderer';
export { LightingLayer } from './LightingLayer';
export { EffectsDirector } from './EffectsDirector';

export interface RenderOptions {
  /** Dim the cave and rely on the helmet lamp. */
  lighting: boolean;
  /** Cut particle counts and suppress camera shake. */
  reducedMotion: boolean;
}

/**
 * One handle over the three presentation pieces, so scenes only deal with
 * "draw this cave" rather than wiring tiles, light and particles separately.
 */
export class RenderLayer {
  readonly world: WorldRenderer;
  readonly lighting: LightingLayer;
  readonly effects: EffectsDirector;

  /**
   * Phaser 4 deprecates the Canvas renderer, and the lamp is built out of
   * `erase` compositing that only behaves under WebGL. On the rare machine
   * that falls back to Canvas we drop the lighting rather than draw a black
   * rectangle over the cave.
   */
  private readonly lightingSupported: boolean;

  constructor(scene: Phaser.Scene, options: RenderOptions) {
    this.lightingSupported = scene.game.renderer.type === Phaser.WEBGL;
    this.world = new WorldRenderer(scene);
    this.lighting = new LightingLayer(scene);
    this.effects = new EffectsDirector(scene);
    this.applyOptions(options);
  }

  applyOptions(options: RenderOptions): void {
    this.lighting.setEnabled(options.lighting && this.lightingSupported);
    this.effects.setReducedMotion(options.reducedMotion);
  }

  /** Rebuild anything sized to the window after it changed shape. */
  resize(): void {
    this.world.resize();
    this.lighting.resize();
  }

  setCave(spec: CaveSpec, cave: Cave, caveIndex: number): void {
    this.world.setCave(spec, cave);
    this.lighting.setPalette(this.world.activePalette, caveIndex, CAVES.length);
  }

  update(cave: Cave, runtime: CaveRuntime, alpha: number, deltaMs: number, events: readonly SimEvent[]): void {
    this.effects.handle(events);
    this.world.draw(cave, runtime, alpha, deltaMs);
    this.lighting.draw(cave, this.world.playerScreenX, this.world.playerScreenY, runtime.ticks);
  }

  destroy(): void {
    this.effects.destroy();
    this.lighting.destroy();
    this.world.destroy();
  }
}
