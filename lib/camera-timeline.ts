import type { Beat, CameraPose } from './story-types.ts';

export function cameraAt(from: CameraPose, to: CameraPose, progress: number, easing: Beat['camera']['easing']): CameraPose {
  const t = Math.max(0, Math.min(1, progress));
  const amount = easing === 'linear' ? t : t * t * (3 - 2 * t);
  const lerp = (a: number, b: number) => a + (b - a) * amount;
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), zoom: lerp(from.zoom, to.zoom), rotate: lerp(from.rotate, to.rotate) };
}

export function cameraLeg(camera: Beat['camera'], current: CameraPose | null): { from: CameraPose; to: CameraPose } {
  const from = current ?? camera.from;
  return { from, to: camera.move === 'hold' ? from : camera.to };
}

export function continuesVisual(previous: Pick<Beat, 'compositionId'> | undefined, next: Pick<Beat, 'compositionId'>): boolean {
  return Boolean(previous?.compositionId && previous.compositionId === next.compositionId);
}

export function linkCamera(previous: Beat | null, beat: Beat): void {
  if (!previous || !continuesVisual(previous, beat)) return;
  const delta = { x: beat.camera.to.x - beat.camera.from.x, y: beat.camera.to.y - beat.camera.from.y, zoom: beat.camera.to.zoom - beat.camera.from.zoom };
  beat.camera.from = { ...previous.camera.to };
  // A hold must stay exactly where the previous movement ended.
  if (beat.camera.move === 'hold') beat.camera.to = { ...previous.camera.to };
  else if (!beat.camera.focusEntityId) beat.camera.to = { ...beat.camera.to, x: previous.camera.to.x + delta.x, y: previous.camera.to.y + delta.y, zoom: previous.camera.to.zoom + delta.zoom };
  beat.transitionIn = { type: 'cut', durationMs: 0 };
}
