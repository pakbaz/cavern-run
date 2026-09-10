import type Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dir } from '../engine/tiles';
import { ControlEvent, InputManager } from './InputManager';

vi.mock('phaser', () => ({
  default: {
    Input: { Events: { POINTER_DOWN: 'down', POINTER_MOVE: 'move', POINTER_UP: 'up', POINTER_UP_OUTSIDE: 'upoutside' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  },
}));

type Listener = (...args: never[]) => void;
class Events {
  private listeners = new Map<string, { listener: Listener; context: unknown; once: boolean }[]>();
  on(name: string, listener: Listener, context?: unknown): void {
    const entries = this.listeners.get(name) ?? [];
    entries.push({ listener, context, once: false });
    this.listeners.set(name, entries);
  }
  once(name: string, listener: Listener, context?: unknown): void {
    this.on(name, listener, context);
    this.listeners.get(name)!.at(-1)!.once = true;
  }
  off(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((entry) => entry.listener !== listener));
  }
  emit(name: string, ...args: unknown[]): void {
    for (const entry of [...this.listeners.get(name) ?? []]) {
      if (entry.once) this.off(name, entry.listener);
      entry.listener.apply(entry.context, args as never[]);
    }
  }
  count(name: string): number { return this.listeners.get(name)?.length ?? 0; }
}

const managers: InputManager[] = [];
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
});
afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
  vi.unstubAllGlobals();
});

function harness() {
  const keyboard = new Events();
  const events = new Events();
  const pad = { up: false, down: false, left: false, right: false, leftStick: { x: 0, y: 0 }, buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const input = Object.assign(new Events(), { keyboard, gamepad: { getPad: () => pad } });
  const canvas = new EventTarget();
  const manager = new InputManager({ input, events, game: { canvas } } as unknown as Phaser.Scene, {
    contains: (x, y) => x >= 0 && x < 400 && y >= 32 && y < 400,
    playerPosition: () => ({ x: 100, y: 100 }),
  });
  managers.push(manager);
  const key = (code: string, down = true, repeat = false): void => {
    keyboard.emit(down ? 'keydown' : 'keyup', { code, repeat, preventDefault: vi.fn() });
  };
  return { manager, input, events, canvas, keyboard, key, pad };
}

function pointer(id: number, x = 100, y = 100, touch = true, right = false) {
  return { id, x, y, wasTouch: touch, isDown: true, rightButtonDown: () => right };
}

describe('InputManager integration', () => {
  it('buffers a quick dock tap exactly once with grab mode', () => {
    const { manager, events } = harness();
    events.emit(ControlEvent.Grab);
    events.emit(ControlEvent.Direction, 'button-1', Dir.Right);
    events.emit(ControlEvent.Release, 'button-1');
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: true });
    manager.consumeTick();
    expect(manager.sample()).toEqual({ dir: null, grab: true });
  });

  it('switches grab mode without cancelling a physically held dock arrow', () => {
    const { manager, events } = harness();
    events.emit(ControlEvent.Direction, 'button-1', Dir.Right);
    manager.consumeTick();
    events.emit(ControlEvent.Grab);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: true });
    events.emit(ControlEvent.Grab);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: false });
    events.emit(ControlEvent.Release, 'button-1');
    expect(manager.sample().dir).toBeNull();
  });

  it('does not let dock touches steer the cave or confirm a menu', () => {
    const { manager, input } = harness();
    const finger = pointer(1, 50, 430);
    input.emit('down', finger);
    finger.x = 150;
    input.emit('move', finger);
    input.emit('up', finger);
    expect(manager.sample().dir).toBeNull();
    expect(manager.consumeConfirm()).toBe(false);
  });

  it('buffers quick swipes and preserves two-finger grab on release', () => {
    const { manager, input } = harness();
    const anchor = pointer(1);
    const finger = pointer(2);
    input.emit('down', anchor);
    input.emit('down', finger);
    finger.x += 50;
    input.emit('move', finger);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: true });
    manager.consumeTick();
    input.emit('up', anchor);
    expect(manager.sample().dir).toBeNull();
    input.emit('up', finger);
    expect(manager.consumeConfirm()).toBe(false);
    input.emit('down', finger);
    finger.x += 50;
    input.emit('move', finger);
    input.emit('up', finger);
    expect(manager.sample().dir).toBe(Dir.Right);
    manager.consumeTick();
    expect(manager.sample().dir).toBeNull();
  });

  it('steers toward the mouse and supports right-button grab', () => {
    const { manager, input } = harness();
    const mouse = pointer(0, 164, 100, false, true);
    input.emit('down', mouse);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: true });
    mouse.isDown = false;
    input.emit('upoutside', mouse);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: true });
    manager.consumeTick();
    expect(manager.sample().dir).toBeNull();
  });

  it('continues steering when one mouse button is released while another stays held', () => {
    const { manager, input } = harness();
    const mouse = pointer(0, 164, 100, false, true);
    input.emit('down', mouse);
    manager.consumeTick();
    mouse.rightButtonDown = () => false;
    input.emit('up', mouse);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: false });
    manager.consumeTick();
    expect(manager.sample().dir).toBe(Dir.Right);
    mouse.isDown = false;
    input.emit('up', mouse);
    expect(manager.sample().dir).toBeNull();
  });

  it('stops mouse steering when the cursor leaves the playfield', () => {
    const { manager, input } = harness();
    const mouse = pointer(0, 164, 100, false);
    input.emit('down', mouse);
    manager.consumeTick();
    mouse.y = 500;
    expect(manager.sample().dir).toBeNull();
  });

  it('does not let keyboard autorepeat steal the latest turn', () => {
    const { manager, key } = harness();
    key('ArrowRight');
    key('ArrowUp');
    key('ArrowRight', true, true);
    expect(manager.sample().dir).toBe(Dir.Up);
  });

  it('keeps aliases and simultaneous grab modifiers held independently', () => {
    const { manager, key } = harness();
    key('ArrowRight');
    key('KeyD');
    manager.consumeTick();
    key('ArrowRight', false);
    expect(manager.sample().dir).toBe(Dir.Right);
    key('ShiftLeft');
    key('ControlRight');
    key('ShiftLeft', false);
    expect(manager.sample().grab).toBe(true);
  });

  it('retains grab on a short keyboard tap after both keys are released', () => {
    const { manager, key } = harness();
    key('ShiftLeft');
    key('ArrowRight');
    key('ArrowRight', false);
    key('ShiftLeft', false);
    expect(manager.sample()).toEqual({ dir: Dir.Right, grab: true });
    manager.consumeTick();
    expect(manager.sample()).toEqual({ dir: null, grab: false });
  });

  it('does not repeatedly pause while a gamepad button stays held', () => {
    const { manager, pad } = harness();
    pad.buttons[9].pressed = true;
    manager.sample();
    expect(manager.consumePause()).toBe(true);
    manager.reset();
    manager.sample();
    expect(manager.consumePause()).toBe(false);
    pad.buttons[9].pressed = false;
    manager.sample();
    pad.buttons[9].pressed = true;
    manager.sample();
    expect(manager.consumePause()).toBe(true);
  });

  it('clears movement and queued actions on pointer cancellation', () => {
    const { manager, events, canvas, key } = harness();
    key('ArrowRight');
    events.emit(ControlEvent.Pause);
    events.emit(ControlEvent.Direction, 'button-1', Dir.Down);
    canvas.dispatchEvent(new Event('pointercancel'));
    expect(manager.sample().dir).toBeNull();
    expect(manager.consumePause()).toBe(false);
  });

  it('unhooks scene and browser listeners exactly once on shutdown', () => {
    const { manager, events, input, keyboard } = harness();
    events.emit('shutdown');
    manager.destroy();
    expect(events.count('destroy')).toBe(0);
    expect(events.count(ControlEvent.Direction)).toBe(0);
    expect(input.count('down')).toBe(0);
    expect(keyboard.count('keydown')).toBe(0);
  });
});
