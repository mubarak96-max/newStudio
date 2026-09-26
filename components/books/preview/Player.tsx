'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { continuesVisual } from '@/lib/camera-timeline';
import type { CameraPose, CompositionPlan } from '@/lib/story-types';
import type { PreviewBeat } from '@/lib/compose';
import { Layers, Subtitles } from './Stage';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Long enough to read the subtitles, and never cut the camera move short. */
function dwellMs(beat: PreviewBeat): number {
  const words = [beat.text.quote?.text ?? '', ...(beat.text.dialogue ?? []).map((line) => line.text), ...(beat.text.commentary ?? []).map((note) => note.text)]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(beat.camera.durationMs, (words / 200) * 60_000 + 1_500, 3_000);
}

function Frame({
  beat,
  composition,
  reducedMotion,
  nameOf,
  frozenPose,
  paused,
  progress,
  onPose,
}: {
  beat: PreviewBeat;
  composition: CompositionPlan | undefined;
  reducedMotion: boolean;
  nameOf: (entityId: string) => string;
  frozenPose?: CameraPose;
  paused?: boolean;
  progress?: number;
  onPose?: (pose: CameraPose) => void;
}) {
  const [tapped, setTapped] = useState<string | null>(null);
  const assembly = composition?.assembly;
  return (
    <div className='absolute inset-0'>
      {assembly?.status === 'composed' && assembly.masterUrl && composition?.shotSnapshot.direction && assembly.layers.some((layer) => layer.role === 'background') ? (
        <Layers assembly={assembly} beat={beat} reducedMotion={reducedMotion} frozenPose={frozenPose} paused={paused} progress={progress} onPose={onPose} />
      ) : (
        <div className='absolute inset-0 flex items-center justify-center bg-zinc-900 p-6 text-center text-xs text-zinc-400'>
          {composition ? `Awaiting validated scene: ${composition.shotSnapshot.description}` : 'No composition for this Beat.'}
        </div>
      )}
      {beat.inspectables.map((item) =>
        item.hotspot ? (
          <button
            key={item.entityId}
            type='button'
            onClick={() => setTapped(tapped === item.entityId ? null : item.entityId)}
            aria-label={`About ${nameOf(item.entityId)}`}
            className='absolute rounded-md border border-dashed border-white/40 hover:border-white/80'
            style={{
              left: `${item.hotspot.x * 100}%`,
              top: `${item.hotspot.y * 100}%`,
              width: `${item.hotspot.w * 100}%`,
              height: `${item.hotspot.h * 100}%`,
            }}
          >
            {tapped === item.entityId && (
              <span className='absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-white'>
                {nameOf(item.entityId)}
              </span>
            )}
          </button>
        ) : null
      )}
      <Subtitles beat={beat} />
    </div>
  );
}

/**
 * Studio preview of an Episode on a 9:16 phone frame: Beats in reading order,
 * each with its camera move, transition and subtitles. Readers advance with
 * the arrows, the keyboard or a tap; Play advances on its own.
 */
export function Player({
  beats,
  compositions,
  nameOf,
}: {
  beats: PreviewBeat[];
  compositions: Map<string, CompositionPlan>;
  nameOf: (entityId: string) => string;
}) {
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<{ index: number; pose: CameraPose } | null>(null);
  const actualPose = useRef<CameraPose | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);
  const [scrub, setScrub] = useState<number | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  );
  const beat = beats[index];

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= beats.length || next === index) return;
      const changed = !continuesVisual(beats[index], beats[next]!);
      setPrevious(changed ? { index, pose: actualPose.current ?? beats[index]!.camera.from } : null);
      if (changed) actualPose.current = null;
      setScrub(undefined);
      setPaused(false);
      setIndex(next);
    },
    [beats, index]
  );

  const seek = useCallback((value: number) => {
    const bounded = Math.max(0, Math.min(beats.length - 0.001, value));
    const next = Math.floor(bounded);
    if (!beats[next]) return;
    go(next);
    setScrub(bounded - next);
    setPaused(true);
    setPlaying(false);
  }, [beats, go]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      seek(index + (scrub ?? 0) + event.deltaY * (event.deltaMode === 1 ? 0.025 : 0.002));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [index, scrub, seek]);

  useEffect(() => {
    const upcoming = new Set(beats.slice(index, index + 4).map((beat) => beat.compositionId));
    for (const id of upcoming) for (const layer of (id ? compositions.get(id)?.assembly?.layers : []) ?? []) {
      const image = new window.Image();
      image.src = layer.url;
      void image.decode().catch(() => undefined);
    }
  }, [index, beats, compositions]);

  useEffect(() => {
    if (previous === null || !beat) return;
    const timer = setTimeout(() => setPrevious(null), Math.max(beat.transitionIn.durationMs, 1));
    return () => clearTimeout(timer);
  }, [previous, beat]);

  useEffect(() => {
    if (!playing || !beat) return;
    const timer = setTimeout(() => {
      if (index + 1 < beats.length) go(index + 1);
      else setPlaying(false);
    }, dwellMs(beat));
    return () => clearTimeout(timer);
  }, [playing, beat, index, beats.length, go]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowRight') go(index + 1);
      if (event.key === 'ArrowLeft') go(index - 1);
      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
        setPaused(playing);
        setScrub(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, playing]);

  const moments = useMemo(() => {
    const seen = new Map<string, { title: string; order: number; first: number }>();
    beats.forEach((item, position) => {
      if (!seen.has(item.momentId)) seen.set(item.momentId, { title: item.momentTitle, order: item.momentOrder, first: position });
    });
    return [...seen.entries()];
  }, [beats]);

  if (!beat) return <p className='text-sm text-muted-foreground'>This Episode has no Beats yet.</p>;
  const outgoing = previous !== null ? beats[previous.index] : null;
  const transition = beat.transitionIn;
  const animated = !reducedMotion && transition.type !== 'cut' && outgoing && !continuesVisual(outgoing, beat);

  return (
    <div className='flex flex-col items-center gap-3'>
      <div
        className='relative w-full max-w-[min(420px,calc(80vh*9/16))] overflow-hidden rounded-2xl bg-black shadow-xl'
        ref={viewport}
        style={{ aspectRatio: '9 / 16', touchAction: 'none' }}
        onTouchStart={(event) => { touchY.current = event.touches[0]?.clientY ?? null; }}
        onTouchMove={(event) => {
          const y = event.touches[0]?.clientY;
          if (y !== undefined && touchY.current !== null) seek(index + (scrub ?? 0) + (touchY.current - y) * 0.006);
          touchY.current = y ?? null;
        }}
        onTouchEnd={() => { touchY.current = null; }}
      >
        <div key={beat.compositionId ?? beat.id} className='absolute inset-0'>
          <Frame beat={beat} composition={beat.compositionId ? compositions.get(beat.compositionId) : undefined} reducedMotion={reducedMotion} nameOf={nameOf} paused={paused} progress={scrub} onPose={(pose) => { actualPose.current = pose; }} />
        </div>
        {animated && outgoing && (
          <div
            key={`out-${outgoing.id}`}
            className='pointer-events-none absolute inset-0'
            style={{
              animation: `preview-fade-out ${transition.durationMs}ms ease-in-out forwards`,
            }}
          >
            <Frame beat={outgoing} composition={outgoing.compositionId ? compositions.get(outgoing.compositionId) : undefined} reducedMotion nameOf={nameOf} frozenPose={previous!.pose} />
          </div>
        )}
        <button
          type='button'
          aria-label='Next beat'
          onClick={() => go(index + 1)}
          className='absolute inset-y-0 right-0 w-1/4'
        />
        <button
          type='button'
          aria-label='Previous beat'
          onClick={() => go(index - 1)}
          className='absolute inset-y-0 left-0 w-1/4'
        />
      </div>

      <input type='range' min={0} max={Math.max(0, beats.length - 0.001)} step={0.001} value={index + (scrub ?? 0)} aria-label='Explore the story' className='w-full max-w-[420px]' onChange={(event) => seek(Number(event.target.value))} />
      <div className='flex items-center gap-2'>
        <button type='button' onClick={() => go(index - 1)} disabled={index === 0} className='rounded-full border border-border p-2 disabled:opacity-40' aria-label='Previous'>
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
        </button>
        <button type='button' onClick={() => { setPlaying((value) => !value); setPaused(playing); setScrub(undefined); }} className='rounded-full bg-primary p-2 text-primary-foreground' aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className='h-4 w-4' aria-hidden='true' /> : <Play className='h-4 w-4' aria-hidden='true' />}
        </button>
        <button type='button' onClick={() => go(index + 1)} disabled={index === beats.length - 1} className='rounded-full border border-border p-2 disabled:opacity-40' aria-label='Next'>
          <ChevronRight className='h-4 w-4' aria-hidden='true' />
        </button>
      </div>
      <p className='text-xs text-muted-foreground'>
        Beat {index + 1} of {beats.length} · Moment {beat.momentOrder}: {beat.momentTitle} · {beat.camera.move}, {transition.type}
        {reducedMotion ? ' · reduced motion' : ''}
      </p>
      <select
        value={beat.momentId}
        onChange={(event) => {
          const target = moments.find(([id]) => id === event.target.value);
          if (target) go(target[1].first);
        }}
        className='rounded-lg border border-border bg-background px-3 py-1.5 text-xs'
        aria-label='Jump to moment'
      >
        {moments.map(([id, info]) => (
          <option key={id} value={id}>
            Moment {info.order}: {info.title}
          </option>
        ))}
      </select>
    </div>
  );
}
