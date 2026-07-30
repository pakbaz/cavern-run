import Phaser from 'phaser';

import { Dir, type Direction } from '../engine/tiles';
import type { PlayerInput } from '../engine/simTypes';
import { DirectionLatch, stickDirection, touchCommand, type TouchDrag } from './inputMath';

export { DirectionLatch, stickDirection, swipeDirection, touchCommand } from './inputMath';

/** Keyboard bindings, listed so the README and the settings screen agree. */
const DIRECTION_KEYS: ReadonlyArray<readonly [string, Direction]> = [
  ['ArrowUp', Dir.Up],
  ['ArrowRight', Dir.Right],
  ['ArrowDown', Dir.Down],
  ['ArrowLeft', Dir.Left],
  ['KeyW', Dir.Up],
  ['KeyD', Dir.Right],
  ['KeyS', Dir.Down],
  ['KeyA', Dir.Left],
];

const GRAB_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const RESTART_KEYS = new Set(['KeyR']);
const CONFIRM_KEYS = new Set(['Enter', 'Space', 'NumpadEnter']);

/** Travel, in pixels, beyond which a touch stops counting as a tap. */
const TAP_SLOP = 12;

/** Gamepad face/shoulder buttons that act as grab. */
const GAMEPAD_GRAB_BUTTONS = [0, 2, 4, 5, 6, 7];
const GAMEPAD_PAUSE_BUTTONS = [9];
const GAMEPAD_RESTART_BUTTONS = [8];

/**
 * Every way of steering the miner, funnelled into one `PlayerInput`.
 *
 * Keyboard, gamepad and touch are all live simultaneously -- there is no mode
 * to select, and picking up a controller mid-run just works. One-shot actions
 * (pause, restart, confirm) are edge-triggered and must be consumed by the
 * caller so a single press cannot fire twice.
 */
export class InputManager {
  private readonly scene: Phaser.Scene;
  private readonly latch = new DirectionLatch();

  private keyboardGrab = false;
  private pausePressed = false;
  private restartPressed = false;
  private confirmPressed = false;

  /**
   * Every finger currently on the glass, in the order they landed, with where
   * each one started. Tracking all of them is what makes the two-finger grab
   * possible; the first one alone is an ordinary swipe.
   */
  private readonly touches = new Map<number, { originX: number; originY: number; x: number; y: number }>();

  /** The finger that landed first, which is the one a tap is judged by. */
  private primaryTouch: number | null = null;
  private primaryMoved = false;

  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.onKeyDown = (event) => this.handleKey(event, true);
    this.onKeyUp = (event) => this.handleKey(event, false);
    // A key held while the tab loses focus never sends its keyup, which would
    // leave the miner walking into a wall forever.
    this.onBlur = () => this.reset();

    const keyboard = scene.input.keyboard;
    keyboard?.on('keydown', this.onKeyDown);
    keyboard?.on('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  /** The input to feed the next simulation scan. */
  sample(): PlayerInput {
    const pad = this.readGamepad();
    const touch = this.readTouch();
    return {
      dir: pad.dir ?? touch.dir ?? this.latch.resolve(),
      grab: this.keyboardGrab || touch.grab || pad.grab,
    };
  }

  private readTouch(): { dir: Direction | null; grab: boolean } {
    if (this.touches.size === 0) return { dir: null, grab: false };

    const drags: TouchDrag[] = [];
    for (const [id, touch] of this.touches) {
      drags.push({ id, dx: touch.x - touch.originX, dy: touch.y - touch.originY });
    }
    return touchCommand(drags);
  }

  /** Tell the latch a scan has been consumed, so buffered taps expire. */
  consumeTick(): void {
    this.latch.consume();
  }

  /** True once per press. */
  consumePause(): boolean {
    const pressed = this.pausePressed;
    this.pausePressed = false;
    return pressed;
  }

  consumeRestart(): boolean {
    const pressed = this.restartPressed;
    this.restartPressed = false;
    return pressed;
  }

  consumeConfirm(): boolean {
    const pressed = this.confirmPressed;
    this.confirmPressed = false;
    return pressed;
  }

  /** Drop all held state -- used on pause, death and scene changes. */
  reset(): void {
    this.latch.clear();
    this.keyboardGrab = false;
    this.touches.clear();
    this.primaryTouch = null;
    this.primaryMoved = false;
  }

  destroy(): void {
    const keyboard = this.scene.input.keyboard;
    keyboard?.off('keydown', this.onKeyDown);
    keyboard?.off('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);

    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);
  }

  private handleKey(event: KeyboardEvent, down: boolean): void {
    const code = event.code;

    for (const [key, dir] of DIRECTION_KEYS) {
      if (key !== code) continue;
      // Stop the arrow keys scrolling the page under the canvas.
      event.preventDefault();
      if (down) this.latch.press(dir);
      else this.latch.release(dir);
      return;
    }

    if (GRAB_KEYS.has(code)) {
      this.keyboardGrab = down;
      return;
    }

    if (!down) return;

    if (PAUSE_KEYS.has(code)) {
      event.preventDefault();
      this.pausePressed = true;
    } else if (RESTART_KEYS.has(code)) {
      this.restartPressed = true;
    } else if (CONFIRM_KEYS.has(code)) {
      event.preventDefault();
      this.confirmPressed = true;
    }
  }

  private readGamepad(): { dir: Direction | null; grab: boolean } {
    const pad = this.scene.input.gamepad?.getPad(0);
    if (!pad) return { dir: null, grab: false };

    let dir: Direction | null = null;
    if (pad.up) dir = Dir.Up;
    else if (pad.right) dir = Dir.Right;
    else if (pad.down) dir = Dir.Down;
    else if (pad.left) dir = Dir.Left;

    dir ??= stickDirection(pad.leftStick.x, pad.leftStick.y);

    for (const button of GAMEPAD_PAUSE_BUTTONS) {
      if (pad.buttons[button]?.pressed) this.pausePressed = true;
    }
    for (const button of GAMEPAD_RESTART_BUTTONS) {
      if (pad.buttons[button]?.pressed) this.restartPressed = true;
    }

    const grab = GAMEPAD_GRAB_BUTTONS.some((button) => pad.buttons[button]?.pressed === true);
    return { dir, grab };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.touches.set(pointer.id, {
      originX: pointer.x,
      originY: pointer.y,
      x: pointer.x,
      y: pointer.y,
    });

    if (this.primaryTouch === null) {
      this.primaryTouch = pointer.id;
      this.primaryMoved = false;
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const touch = this.touches.get(pointer.id);
    if (!touch || !pointer.isDown) return;

    touch.x = pointer.x;
    touch.y = pointer.y;

    if (pointer.id === this.primaryTouch && !this.primaryMoved) {
      const travelled = Math.abs(pointer.x - touch.originX) + Math.abs(pointer.y - touch.originY);
      if (travelled >= TAP_SLOP) this.primaryMoved = true;
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.touches.delete(pointer.id);

    if (pointer.id !== this.primaryTouch) return;

    // A tap that never travelled is a confirm, which is how the touch player
    // gets through the title and cave-intro screens. Lifting a finger that was
    // part of a two-finger grab is not a tap, so the gesture cannot leak into
    // the menus underneath.
    if (!this.primaryMoved && this.touches.size === 0) this.confirmPressed = true;

    // Whichever finger is left becomes the one a tap would be judged by.
    this.primaryTouch = this.touches.keys().next().value ?? null;
    this.primaryMoved = this.primaryTouch !== null;
  }
}
