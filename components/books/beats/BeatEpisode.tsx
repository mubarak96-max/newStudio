'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { loadMoments, type Episode, type Moment } from '@/lib/story';
import { Badge } from '@/components/books/model/ModelPrimitives';
import { BeatCard } from './BeatCard';

function MomentBeats({ moment, nameOf }: { moment: Moment; nameOf: (entityId: string) => string }) {
  const coverage = moment.beatCoverage;
  const represented = coverage ? coverage.storyParagraphs - coverage.representedByFallback.length : 0;
  return (
    <div className='space-y-2 rounded-lg border border-border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm font-medium'>
          {moment.order}. {moment.title}
        </p>
        {coverage && (
          <span className='flex flex-wrap gap-1'>
            <Badge tone={coverage.representedByFallback.length > 0 ? 'warn' : 'neutral'}>
              {represented}/{coverage.storyParagraphs} paragraphs by model
            </Badge>
            <Badge>
              {coverage.wordsShownVerbatim}/{coverage.words} words verbatim
            </Badge>
          </span>
        )}
      </div>
      {coverage?.warnings.map((warning) => (
        <p key={warning} className='text-xs text-amber-600'>
          {warning}
        </p>
      ))}
      {moment.readingBeats.length === 0 ? (
        <p className='text-xs text-muted-foreground'>No Beats yet.</p>
      ) : (
        moment.readingBeats.map((beat) => <BeatCard key={beat.id} beat={beat} nameOf={nameOf} />)
      )}
    </div>
  );
}

export function BeatEpisode({
  bookId,
  episode,
  nameOf,
}: {
  bookId: string;
  episode: Episode;
  nameOf: (entityId: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !moments) {
      loadMoments(bookId, episode.episodeId)
        .then(setMoments)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load Beats.'));
    }
  };

  return (
    <div className='rounded-xl border border-border bg-card'>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        className='flex w-full items-center justify-between gap-4 p-5 text-left'
      >
        <span className='min-w-0'>
          <span className='block text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            Episode {episode.order}
          </span>
          <span className='mt-1 block text-base font-semibold'>{episode.title}</span>
        </span>
        <span className='flex flex-wrap items-center justify-end gap-1'>
          <Badge tone={episode.stageStatus.beats === 'done' ? 'neutral' : 'warn'}>
            {episode.stageStatus.beats === 'done' ? `${episode.beatCount ?? 0} beats` : 'beats pending'}
          </Badge>
          <ChevronDown
            aria-hidden='true'
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && (
        <div className='space-y-3 border-t border-border p-5'>
          {error && <p className='text-xs text-destructive'>{error}</p>}
          {!moments && !error && <div className='h-16 animate-pulse rounded-lg bg-muted' />}
          {moments?.map((moment) => (
            <MomentBeats key={moment.momentId} moment={moment} nameOf={nameOf} />
          ))}
        </div>
      )}
    </div>
  );
}
