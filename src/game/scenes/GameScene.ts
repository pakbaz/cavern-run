import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey, WORLD_OFFSET_Y } from '../../config';
import { audio } from '../audio/index';
import { CaveOutcome } from '../engine/simTypes';
import { InputManager } from '../input/InputManager';
import { CAVE_COUNT } from '../levels/index';
import { RenderLayer } from '../render/index';
import { recordCaveBest, saveProgress } from '../state/profile';
import { RUN_STATE_KEY, type RunState } from './RunState';

/**
 * The cave itself.
 *
 * This scene owns very little logic: it feeds real elapsed time and the
 * current input into `CaveSession`, hands the resulting events to the
 * renderer and the sound effects, and reacts when the outcome stops being
 * "running". All the actual rules live in the pure engine.
 */
export class GameScene extends Phaser.Scene {
  private state!: RunState;
  private render!: RenderLayer;
  private controls!: InputManager;

  /**
   * Guards the one-way transition out of the cave. The engine already lets
   * the blast play out before it reports a death, so the moment the outcome
   * stops being "running" the scene acts on it.
   */
  private resolving = false;

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    this.state = this.registry.get(RUN_STATE_KEY) as RunState;
    const { session, settings } = this.state;

    // The playfield sits below the status bar, so the world camera is inset
    // rather than the world being pushed down.
    this.cameras.main.setViewport(0, WORLD_OFFSET_Y, GAME_WIDTH, GAME_HEIGHT - WORLD_OFFSET_Y);
    this.cameras.main.setBackgroundColor('#05070f');

    this.render = new RenderLayer(this, {
      lighting: settings.lighting,
      reducedMotion: settings.reducedMotion,
    });
    this.render.setCave(session.spec, session.simulation.cave, session.caveIndex);

    this.controls = new InputManager(this);

    this.resolving = false;

    this.scene.launch(SceneKey.Hud);
    audio().music.start(session.caveIndex, CAVE_COUNT);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  override update(_time: number, delta: number): void {
    const { session } = this.state;

    if (this.controls.consumePause() && !this.resolving) {
      this.pause();
      return;
    }

    if (this.controls.consumeRestart() && !this.resolving) {
      this.restart();
      return;
    }

    const input = this.controls.sample();
    const result = session.update(delta, input);
    if (result.ticks > 0) this.controls.consumeTick();

    audio().sfx.beginFrame();
    audio().sfx.handle(result.events);

    this.render.update(
      session.simulation.cave,
      session.simulation.runtime,
      session.tickAlpha,
      delta,
      result.events,
    );

    this.updateMusic();
    this.checkOutcome(result.outcome);
  }

  private updateMusic(): void {
    const { session } = this.state;
    const sim = session.simulation;

    audio().music.setState({
      difficulty: CAVE_COUNT <= 1 ? 0 : session.caveIndex / (CAVE_COUNT - 1),
      secondsLeft: sim.secondsLeft,
      timeLimit: session.spec.timeLimit,
      diamondsCollected: sim.runtime.diamondsCollected,
      diamondsRequired: session.spec.diamondsRequired,
      threatDistance: sim.nearestThreatDistance(),
    });
  }

  private checkOutcome(outcome: string): void {
    if (this.resolving || outcome === CaveOutcome.Running) return;
    this.resolving = true;

    if (outcome === CaveOutcome.Complete) {
      void this.completeCave();
    } else {
      this.fail();
    }
  }

  private async completeCave(): Promise<void> {
    const { session } = this.state;
    const spec = session.spec;

    audio().sfx.caveComplete();
    audio().music.stop();

    const result = session.finishCave();
    this.state.lastResult = result;
    if (result.extraLives > 0) audio().sfx.extraLife();

    await Promise.all([
      recordCaveBest({
        caveIndex: result.caveIndex,
        bestScore: result.caveScore + result.timeBonus,
        bestSecondsLeft: result.secondsLeft,
        diamonds: result.diamonds,
        completed: true,
      }),
      saveProgress(Math.min(result.caveIndex + 1, CAVE_COUNT - 1), result.totalScore),
    ]);

    void spec;
    this.scene.start(SceneKey.CaveComplete);
  }

  private fail(): void {
    const { session } = this.state;

    audio().sfx.died();
    audio().music.stop();

    if (session.loseLife()) {
      this.scene.start(SceneKey.CaveIntro);
    } else {
      audio().sfx.gameOver();
      this.scene.start(SceneKey.GameOver);
    }
  }

  private pause(): void {
    this.controls.reset();
    audio().engine.setMuted(true);
    this.scene.pause();
    this.scene.launch(SceneKey.Pause);
  }

  private restart(): void {
    this.resolving = true;
    audio().music.stop(true);
    // A deliberate restart still costs a life, so it cannot be used to farm
    // a cave for score with no downside.
    if (this.state.session.loseLife()) {
      this.scene.start(SceneKey.CaveIntro);
    } else {
      this.scene.start(SceneKey.GameOver);
    }
  }

  private teardown(): void {
    this.scene.stop(SceneKey.Hud);
    this.controls.destroy();
    this.render.destroy();
  }
}
