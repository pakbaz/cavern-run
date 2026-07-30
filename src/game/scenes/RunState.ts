import { CaveSession } from '../engine/CaveSession';
import type { CaveResult } from '../engine/CaveSession';
import { CAVES } from '../levels/index';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';

/**
 * Everything that outlives a single scene.
 *
 * Phaser scenes are created and torn down constantly -- every cave transition
 * destroys and rebuilds GameScene -- so the run itself lives here on the
 * registry instead, and scenes reach for it rather than passing it down a
 * chain of `scene.start` payloads.
 */
export class RunState {
  session: CaveSession;
  settings: Settings = { ...DEFAULT_SETTINGS };

  /** Result of the cave just finished, for the tally screen to read. */
  lastResult: CaveResult | null = null;

  /** True once the player has cleared the final cave. */
  won = false;

  constructor() {
    this.session = new CaveSession(CAVES);
  }

  newRun(): CaveSession {
    this.session = new CaveSession(CAVES);
    this.lastResult = null;
    this.won = false;
    return this.session;
  }
}

export const RUN_STATE_KEY = 'runState';
