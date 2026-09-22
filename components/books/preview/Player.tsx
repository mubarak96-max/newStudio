'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { CompositionPlan } from '@/lib/story-types';
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
}: {
  beat: PreviewBeat;
  composition: CompositionPlan | undefined;
  reducedMotion: boolean;
  nameOf: (entityId: string) => string;
}) {
  const [tapped, setTapped] = useState<string | null>(null);
  const assembly = composition?.assembly;
  return (
    <div className='absolute inset-0'>
      {assembly && assembly.layers.some((layer) => layer.role === 'background') ? (
        <Layers assembly={assembly} beat={beat} reducedMotion={reducedMotion} />
      ) : (
        <div className='absolute inset-0 flex items-center justify-center bg-zinc-900 p-6 text-center text-xs text-zinc-400'>
          {composition ? `Not assembled yet: ${composition.shotSnapshot.description}` : 'No composition for this Beat.'}
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
  const [previous, setPrevious] = useState<number | null>(null);
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
      setPrevious(index);
      setIndex(next);
    },
    [beats.length, index]
  );

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  const moments = useMemo(() => {
    const seen = new Map<string, { title: string; order: number; first: number }>();
    beats.forEach((item, position) => {
      if (!seen.has(item.momentId)) seen.set(item.momentId, { title: item.momentTitle, order: item.momentOrder, first: position });
    });
    return [...seen.entries()];
  }, [beats]);

  if (!beat) return <p className='text-sm text-muted-foreground'>This Episode has no Beats yet.</p>;
  const outgoing = previous !== null ? beats[previous] : null;
  const transition = beat.transitionIn;
  const animated = !reducedMotion && transition.type !== 'cut' && outgoing;

  return (
    <div className='flex flex-col items-center gap-3'>
      <div
        className='relative w-full max-w-[min(420px,calc(80vh*9/16))] overflow-hidden rounded-2xl bg-black shadow-xl'
        style={{ aspectRatio: '9 / 16' }}
      >
        <div key={beat.id} className='absolute inset-0'>
          <Frame beat={beat} composition={beat.compositionId ? compositions.get(beat.compositionId) : undefined} reducedMotion={reducedMotion} nameOf={nameOf} />
        </div>
        {animated && outgoing && (
          <div
            key={`out-${outgoing.id}`}
            className='pointer-events-none absolute inset-0'
            style={{
              animation: `${transition.type === 'slide' ? 'preview-slide-out' : transition.type === 'zoomThrough' ? 'preview-zoom-out' : 'preview-fade-out'} ${transition.durationMs}ms ease-in-out forwards`,
            }}
          >
            <Frame beat={outgoing} composition={outgoing.compositionId ? compositions.get(outgoing.compositionId) : undefined} reducedMotion nameOf={nameOf} />
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

      <div className='flex items-center gap-2'>
        <button type='button' onClick={() => go(index - 1)} disabled={index === 0} className='rounded-full border border-border p-2 disabled:opacity-40' aria-label='Previous'>
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
        </button>
        <button type='button' onClick={() => setPlaying((value) => !value)} className='rounded-full bg-primary p-2 text-primary-foreground' aria-label={playing ? 'Pause' : 'Play'}>
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
