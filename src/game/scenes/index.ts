import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../../config';

/**
 * Temporary placeholder so the project builds and runs while the real scene
 * shell is assembled. Replaced by BootScene/TitleScene/GameScene et al.
 */
export class PlaceholderScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'CAVERN RUN', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#cfe4ff',
      })
      .setOrigin(0.5);
  }
}

export const SCENE_LIST: Array<new () => Phaser.Scene> = [PlaceholderScene];
