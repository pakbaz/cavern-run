import Phaser from 'phaser';

import { LAYOUT_CHANGED, layout, refreshLayout } from './layout';
import { SCENE_LIST } from './game/scenes';

function dismissBootSplash(): void {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('is-hidden');
  window.setTimeout(() => splash.remove(), 500);
}

function windowSize(): { w: number; h: number; dpr: number } {
  return {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function createGame(): Phaser.Game {
  const initial = windowSize();
  refreshLayout(initial.w, initial.h, initial.dpr);
  const { width, height } = layout();

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width,
    height,
    backgroundColor: '#05070d',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    powerPreference: 'high-performance',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
    },
    input: {
      keyboard: true,
      gamepad: true,
      touch: true,
    },
    // The simulation is driven by an explicit fixed-step accumulator, so
    // Phaser's own physics systems are deliberately left out.
    scene: SCENE_LIST,
  });
}

const game = createGame();

game.events.once(Phaser.Core.Events.READY, dismissBootSplash);

/**
 * Re-fit the canvas when the window changes shape.
 *
 * Rotating a phone or dragging a window across monitors changes how much cave
 * should be on screen. Only a change in the number of visible cells is worth
 * reacting to: resizing by a few pixels, or the address bar sliding away on
 * mobile, must not tear down and rebuild the scene mid-cave.
 */
let resizeTimer = 0;
function onWindowResize(): void {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const { w, h, dpr } = windowSize();
    if (!refreshLayout(w, h, dpr)) return;

    const { width, height } = layout();
    game.scale.setGameSize(width, height);
    game.scale.refresh();
    game.events.emit(LAYOUT_CHANGED, layout());
  }, 120);
}

window.addEventListener('resize', onWindowResize);
window.addEventListener('orientationchange', onWindowResize);

// Belt and braces: never leave the splash stuck over a working canvas.
window.setTimeout(dismissBootSplash, 6000);

/** Stop the audio clock and simulation while the tab is in the background. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.loop.sleep();
  } else {
    game.loop.wake();
  }
});

export default game;

