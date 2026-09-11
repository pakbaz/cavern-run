import type Phaser from 'phaser';
import { expect, it, vi } from 'vitest';
import { TILE_SIZE } from '../../config';
import { Cave } from '../engine/Cave';
import { Tile } from '../engine/tiles';
import { LightingLayer } from './LightingLayer';
import { lampCone } from './renderMath';

vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1, ERASE: 2 } } }));
vi.mock('./TextureFactory', () => ({ TextureKey: { glow: 'glow' } }));

it.each([32, 64, 128])('uses the real %spx glow source for its physical light radius', (sourceSize) => {
  const stamp = vi.fn();
  const shape = () => ({
    width: sourceSize,
    setOrigin() { return this; }, setScrollFactor() { return this; },
    setDepth() { return this; }, setBlendMode() { return this; },
    setTint() { return this; }, setVisible() { return this; },
    setPosition() { return this; }, setScale() { return this; },
    setAlpha() { return this; }, setRenderMode() {},
    clear() {}, fill() {}, lineStyle() {}, strokeRect() {}, render() {},
    stamp,
  });
  const scene = {
    add: { renderTexture: shape, graphics: shape, image: shape },
    cameras: { main: { scrollX: 0, scrollY: 0 } },
  } as unknown as Phaser.Scene;
  const layer = new LightingLayer(scene);
  const cave = Cave.fromTiles(40, 22, new Array(880).fill(Tile.Empty));
  layer.draw(cave, 100, 100, 0);

  const cone = lampCone(100, 100, 1, 4.2, TILE_SIZE);
  const options = stamp.mock.calls[1][4];
  expect(options.scaleY * sourceSize / 2).toBeCloseTo(cone.radiusY * TILE_SIZE);
  expect(options.scaleX * sourceSize / 2).toBeCloseTo(cone.radiusX * TILE_SIZE);
});
