import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { SCENE_LIST } from './game/scenes';

function dismissBootSplash(): void {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('is-hidden');
  window.setTimeout(() => splash.remove(), 500);
}

function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#05070d',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    powerPreference: 'high-performance',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
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

