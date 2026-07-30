import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../../config';
import { audio } from '../audio/index';
import { generateTextures } from '../render/TextureFactory';
import { loadSettings } from '../state/settings';
import { RUN_STATE_KEY, RunState } from './RunState';
import { FONT, Ink } from './ui';

const POSTER_KEY = 'cr.poster';

/**
 * Bakes every texture, restores settings, then hands off to the title.
 *
 * All the in-game art is generated here rather than loaded, so the only real
 * download is the poster. That runs to a few hundred kilobytes, and the
 * title screen is designed to work without it, so a failed or slow fetch
 * never blocks the game from starting.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    const status = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'CARVING CAVES...', {
        fontFamily: FONT,
        fontSize: '16px',
        color: Ink.body,
      })
      .setOrigin(0.5);

    // `BASE_URL` keeps this correct when the game is served from a subpath,
    // which is how it will be deployed on most static hosts.
    this.load.image(POSTER_KEY, `${import.meta.env.BASE_URL}poster.jpg`);

    this.load.once(Phaser.Loader.Events.COMPLETE, () => status.destroy());
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      // The title screen falls back to a painted backdrop.
      status.destroy();
    });
  }

  async create(): Promise<void> {
    generateTextures(this);

    const state = new RunState();
    this.registry.set(RUN_STATE_KEY, state);

    state.settings = await loadSettings();
    audio().engine.setMusicVolume(state.settings.musicVolume);
    audio().engine.setSfxVolume(state.settings.sfxVolume);

    this.scene.start(SceneKey.Title);
  }
}

export { POSTER_KEY };
