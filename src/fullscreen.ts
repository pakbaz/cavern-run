interface FullscreenTarget {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
}

interface FullscreenHost {
  readonly fullscreenElement: object | null;
  readonly fullscreenEnabled: boolean;
  exitFullscreen(): Promise<void>;
}

/** Call directly from a tap or click so the browser retains user activation. */
export async function toggleFullscreen(
  target: FullscreenTarget,
  host: FullscreenHost = document,
): Promise<void> {
  if (host.fullscreenElement) {
    await host.exitFullscreen();
    return;
  }
  if (!host.fullscreenEnabled || !target.requestFullscreen) {
    throw new Error('Fullscreen is unavailable in this browser');
  }
  await target.requestFullscreen({ navigationUI: 'hide' });
}
