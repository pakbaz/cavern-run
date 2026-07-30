import { describe, expect, it } from 'vitest';

import { Dir } from '../engine/tiles';
import { DirectionLatch, stickDirection, swipeDirection } from './inputMath';

describe('DirectionLatch', () => {
  it('starts idle', () => {
    expect(new DirectionLatch().resolve()).toBeNull();
  });

  it('resolves a held direction', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Right);
    expect(latch.resolve()).toBe(Dir.Right);
  });

  it('lets the most recent press win', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Right);
    latch.press(Dir.Up);
    expect(latch.resolve()).toBe(Dir.Up);
  });

  it('falls back to the still-held direction on release', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Right);
    latch.press(Dir.Up);
    latch.release(Dir.Up);
    expect(latch.resolve()).toBe(Dir.Right);
  });

  it('does not duplicate a repeated press', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Left);
    latch.press(Dir.Left);
    latch.release(Dir.Left);
    latch.consume();
    expect(latch.resolve()).toBeNull();
  });

  it('buffers a tap shorter than one scan', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Down);
    latch.release(Dir.Down);
    expect(latch.resolve()).toBe(Dir.Down);
  });

  it('drops the buffered tap once consumed', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Down);
    latch.release(Dir.Down);
    latch.consume();
    expect(latch.resolve()).toBeNull();
  });

  it('keeps reporting a genuinely held key after consume', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Up);
    latch.consume();
    expect(latch.resolve()).toBe(Dir.Up);
  });

  it('ignores a release for a key that was never pressed', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Up);
    latch.release(Dir.Left);
    expect(latch.resolve()).toBe(Dir.Up);
  });

  it('clears everything', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Up);
    latch.press(Dir.Left);
    latch.clear();
    expect(latch.resolve()).toBeNull();
    expect(latch.isIdle).toBe(true);
  });

  it('re-pressing a held key promotes it to most recent', () => {
    const latch = new DirectionLatch();
    latch.press(Dir.Left);
    latch.press(Dir.Up);
    latch.press(Dir.Left);
    expect(latch.resolve()).toBe(Dir.Left);
  });
});

describe('stickDirection', () => {
  it('ignores the dead zone', () => {
    expect(stickDirection(0.1, -0.2)).toBeNull();
  });

  it('reads the dominant axis', () => {
    expect(stickDirection(0.9, 0.6)).toBe(Dir.Right);
    expect(stickDirection(-0.9, 0.6)).toBe(Dir.Left);
    expect(stickDirection(0.6, 0.9)).toBe(Dir.Down);
    expect(stickDirection(0.6, -0.9)).toBe(Dir.Up);
  });

  it('honours a custom dead zone', () => {
    expect(stickDirection(0.3, 0, 0.2)).toBe(Dir.Right);
    expect(stickDirection(0.3, 0, 0.8)).toBeNull();
  });
});

describe('swipeDirection', () => {
  it('ignores a tap', () => {
    expect(swipeDirection(3, 4)).toBeNull();
  });

  it('reads a horizontal swipe', () => {
    expect(swipeDirection(60, 10)).toBe(Dir.Right);
    expect(swipeDirection(-60, 10)).toBe(Dir.Left);
  });

  it('reads a vertical swipe', () => {
    expect(swipeDirection(10, 60)).toBe(Dir.Down);
    expect(swipeDirection(10, -60)).toBe(Dir.Up);
  });

  it('never returns a diagonal', () => {
    expect(swipeDirection(50, 50)).toBe(Dir.Down);
  });
});
