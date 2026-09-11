import type Phaser from 'phaser';
import { expect, it, vi } from 'vitest';
import { LAYOUT_CHANGED } from '../../layout';
import { onLayoutChanged } from './ui';

vi.mock('phaser', () => ({
  default: { Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } },
}));

it('removes both lifecycle hooks when a responsive scene shuts down', () => {
  const events = { once: vi.fn(), off: vi.fn() };
  const gameEvents = { on: vi.fn(), off: vi.fn() };
  const scene = { events, game: { events: gameEvents } } as unknown as Phaser.Scene;
  const handler = vi.fn();
  onLayoutChanged(scene, handler);
  const cleanup = events.once.mock.calls.find(([event]) => event === 'shutdown')![1];
  cleanup();
  expect(gameEvents.off).toHaveBeenCalledWith(LAYOUT_CHANGED, handler);
  expect(events.off).toHaveBeenCalledWith('shutdown', cleanup);
  expect(events.off).toHaveBeenCalledWith('destroy', cleanup);
});
