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
  const root = document.getElementById('game-root');
  const bounds = root?.getBoundingClientRect();
  return {
    w: Math.min(bounds?.width ?? window.innerWidth, window.visualViewport?.width ?? window.innerWidth),
    h: Math.min(bounds?.height ?? window.innerHeight, window.visualViewport?.height ?? window.innerHeight),
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
      // Phaser tracks a single touch by default. The grab gesture needs two
      // fingers at once, and the third slot keeps a stray palm or thumb from
      // displacing one of them.
      activePointers: 3,
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
 * Follow the available screen, including mobile browser chrome and native
 * fullscreen. GameScene resizes in place, preserving the cave and its clock.
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
window.visualViewport?.addEventListener('resize', onWindowResize);
document.addEventListener('fullscreenchange', onWindowResize);

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
