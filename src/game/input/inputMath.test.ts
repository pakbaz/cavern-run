import { describe, expect, it } from 'vitest';

import { Dir } from '../engine/tiles';
import { DirectionLatch, stickDirection, swipeDirection, touchCommand } from './inputMath';

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

describe('touchCommand', () => {
  const still = (id: number) => ({ id, dx: 0, dy: 0 });

  it('does nothing with no fingers down', () => {
    expect(touchCommand([])).toEqual({ dir: null, grab: false });
  });

  it('walks on a one-finger swipe', () => {
    expect(touchCommand([{ id: 1, dx: 40, dy: 2 }])).toEqual({ dir: Dir.Right, grab: false });
    expect(touchCommand([{ id: 1, dx: -3, dy: -40 }])).toEqual({ dir: Dir.Up, grab: false });
  });

  it('ignores a one-finger tap that never travelled', () => {
    expect(touchCommand([still(1)])).toEqual({ dir: null, grab: false });
  });

  it('grabs when a second finger is held and the other swipes', () => {
    // The classic reason to do this: clear the dirt beside you without
    // stepping into the gap you just made.
    expect(touchCommand([still(1), { id: 2, dx: 0, dy: 40 }])).toEqual({
      dir: Dir.Down,
      grab: true,
    });
  });

  it('does not care which finger is the anchor', () => {
    const held = still(1);
    const swiped = { id: 2, dx: -40, dy: 0 };

    // Same gesture, fingers reported in either order, and either one can be
    // the one that moves: a left-handed player does this the other way round.
    expect(touchCommand([held, swiped])).toEqual({ dir: Dir.Left, grab: true });
    expect(touchCommand([swiped, held])).toEqual({ dir: Dir.Left, grab: true });
    expect(touchCommand([{ id: 1, dx: -40, dy: 0 }, still(2)])).toEqual({
      dir: Dir.Left,
      grab: true,
    });
  });

  it('takes the direction from the finger that moved furthest', () => {
    // Anchors drift a little under a resting finger; that drift must not win.
    const drifting = { id: 1, dx: 6, dy: -4 };
    const swiped = { id: 2, dx: 0, dy: 44 };

    expect(touchCommand([drifting, swiped]).dir).toBe(Dir.Down);
  });

  it('still grabs while the swiping finger is below the threshold', () => {
    // Two fingers down is already the intent to grab, so the modifier holds
    // even before the swipe is long enough to name a direction.
    expect(touchCommand([still(1), { id: 2, dx: 5, dy: 0 }])).toEqual({
      dir: null,
      grab: true,
    });
  });

  it('keeps grabbing with three fingers down', () => {
    expect(touchCommand([still(1), still(2), { id: 3, dx: 40, dy: 0 }])).toEqual({
      dir: Dir.Right,
      grab: true,
    });
  });

  it('honours a custom threshold', () => {
    expect(touchCommand([{ id: 1, dx: 12, dy: 0 }], 8).dir).toBe(Dir.Right);
    expect(touchCommand([{ id: 1, dx: 12, dy: 0 }], 30).dir).toBe(null);
  });
});
