import Phaser from 'phaser';

import { Dir, type Direction } from '../engine/tiles';
import type { PlayerInput } from '../engine/simTypes';
import { DirectionLatch, stickDirection, swipeDirection } from './inputMath';

export { DirectionLatch, stickDirection, swipeDirection } from './inputMath';

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

  private touchId: number | null = null;
  private touchOriginX = 0;
  private touchOriginY = 0;
  private touchDir: Direction | null = null;
  private touchGrab = false;

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
    return {
      dir: pad.dir ?? this.touchDir ?? this.latch.resolve(),
      grab: this.keyboardGrab || this.touchGrab || pad.grab,
    };
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
    this.touchId = null;
    this.touchDir = null;
    this.touchGrab = false;
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
    if (this.touchId !== null) {
      // A second finger anywhere on screen is the grab modifier.
      this.touchGrab = true;
      return;
    }
    this.touchId = pointer.id;
    this.touchOriginX = pointer.x;
    this.touchOriginY = pointer.y;
    this.touchDir = null;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.touchId || !pointer.isDown) return;
    this.touchDir = swipeDirection(pointer.x - this.touchOriginX, pointer.y - this.touchOriginY);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.touchId) {
      this.touchGrab = false;
      return;
    }
    // A tap that never became a swipe is a confirm, which is how the touch
    // player gets through the title and cave-intro screens.
    if (this.touchDir === null) this.confirmPressed = true;
    this.touchId = null;
    this.touchDir = null;
    this.touchGrab = false;
  }
}
