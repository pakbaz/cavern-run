import { AudioEngine } from './AudioEngine';
import { MusicDirector } from './MusicDirector';
import { Sfx } from './sfx';

export * from './musicMath';
export { AudioEngine } from './AudioEngine';
export { MusicDirector } from './MusicDirector';
export { Sfx } from './sfx';

/**
 * One shared audio stack for the whole game.
 *
 * Scenes come and go, but the `AudioContext` must not: browsers only let you
 * have a handful, and re-creating one loses the user gesture that unlocked it.
 */
export class AudioStack {
  readonly engine = new AudioEngine();
  readonly music = new MusicDirector(this.engine);
  readonly sfx = new Sfx(this.engine);

  unlock(): void {
    this.engine.unlock();
  }
}

let shared: AudioStack | null = null;

export function audio(): AudioStack {
  shared ??= new AudioStack();
  return shared;
}
