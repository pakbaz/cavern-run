import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleFullscreen } from './fullscreen';

afterEach(() => vi.unstubAllGlobals());

describe('native fullscreen', () => {
  it('keeps the safe-area game container inset by fullscreening the document', async () => {
    const root = { requestFullscreen: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('document', {
      documentElement: root, fullscreenElement: null, fullscreenEnabled: true,
      exitFullscreen: vi.fn(),
    });
    await toggleFullscreen();
    expect(root.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('requests fullscreen on the whole game container from a user action', async () => {
    const target = { requestFullscreen: vi.fn().mockResolvedValue(undefined) };
    const host = { fullscreenElement: null, fullscreenEnabled: true, exitFullscreen: vi.fn() };
    await toggleFullscreen(target, host);
    expect(target.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('exits fullscreen instead of requesting it again', async () => {
    const target = { requestFullscreen: vi.fn() };
    const host = { fullscreenElement: {}, fullscreenEnabled: true, exitFullscreen: vi.fn().mockResolvedValue(undefined) };
    await toggleFullscreen(target, host);
    expect(host.exitFullscreen).toHaveBeenCalledOnce();
    expect(target.requestFullscreen).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers rather than pretending fullscreen worked', async () => {
    const target = { requestFullscreen: vi.fn() };
    const host = { fullscreenElement: null, fullscreenEnabled: false, exitFullscreen: vi.fn() };
    await expect(toggleFullscreen(target, host)).rejects.toThrow('Fullscreen is unavailable');
    expect(target.requestFullscreen).not.toHaveBeenCalled();
  });

  it('propagates a denied browser request for the UI to report', async () => {
    const target = { requestFullscreen: vi.fn().mockRejectedValue(new Error('Permission denied')) };
    const host = { fullscreenElement: null, fullscreenEnabled: true, exitFullscreen: vi.fn() };
    await expect(toggleFullscreen(target, host)).rejects.toThrow('Permission denied');
  });
});
