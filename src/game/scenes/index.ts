import type Phaser from 'phaser';

import { BootScene } from './BootScene';
import { CaveCompleteScene } from './CaveCompleteScene';
import { CaveIntroScene } from './CaveIntroScene';
import { GameOverScene } from './GameOverScene';
import { GameScene } from './GameScene';
import { HudScene } from './HudScene';
import { PauseScene } from './PauseScene';
import { TitleScene } from './TitleScene';

export { BootScene } from './BootScene';
export { TitleScene } from './TitleScene';
export { CaveIntroScene } from './CaveIntroScene';
export { GameScene } from './GameScene';
export { HudScene } from './HudScene';
export { PauseScene } from './PauseScene';
export { CaveCompleteScene } from './CaveCompleteScene';
export { GameOverScene } from './GameOverScene';
export { RunState, RUN_STATE_KEY } from './RunState';

/** Boot runs first; the rest are started explicitly. */
export const SCENE_LIST: Array<new () => Phaser.Scene> = [
  BootScene,
  TitleScene,
  CaveIntroScene,
  GameScene,
  HudScene,
  PauseScene,
  CaveCompleteScene,
  GameOverScene,
];
