'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { loadMoments, type Episode, type Moment } from '@/lib/story';
import { Badge, ModelSection } from '@/components/books/model/ModelPrimitives';
import { MomentCard } from './MomentCard';

type Props = {
  bookId: string;
  episode: Episode;
  nameOf: (entityId: string) => string;
};

export function EpisodeCard({ bookId, episode, nameOf }: Props) {
  const [open, setOpen] = useState(false);
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plan = episode.storyPlan;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !moments && episode.stageStatus.moments === 'done') {
      loadMoments(bookId, episode.episodeId)
        .then(setMoments)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load moments.'));
    }
  };

  return (
    <div className='rounded-xl border border-border bg-card'>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        className='flex w-full items-start justify-between gap-4 p-5 text-left'
      >
        <span className='min-w-0'>
          <span className='block text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            Episode {episode.order}
          </span>
          <span className='mt-1 block text-base font-semibold'>{episode.title}</span>
          <span className='mt-1 block text-xs text-muted-foreground'>
            seq {episode.seqStart}–{episode.seqEnd} · {episode.wordCount.toLocaleString()} words · about{' '}
            {Math.max(1, Math.round(episode.wordCount / 230))} min · {episode.momentCount} moments
          </span>
        </span>
        <span className='flex flex-wrap items-center justify-end gap-1'>
          <Badge tone={episode.stageStatus.moments === 'done' ? 'neutral' : 'warn'}>
            moments {episode.stageStatus.moments}
          </Badge>
          {episode.warnings.length > 0 && <Badge tone='warn'>{episode.warnings.length} warnings</Badge>}
          <ChevronDown
            aria-hidden='true'
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className='space-y-5 border-t border-border p-5'>
          <p className='text-sm'>{episode.summary}</p>
          {plan && (
            <dl className='grid gap-4 text-sm sm:grid-cols-2'>
              {[
                { label: 'Arc', value: plan.arc },
                { label: 'Emotional progression', value: plan.emotionalProgression },
                { label: 'Opening state', value: plan.openingState },
                { label: 'Ending state', value: plan.endingState },
                { label: 'Visual strategy', value: plan.visualStrategy },
              ]
                .filter((row) => row.value)
                .map((row) => (
                  <div key={row.label}>
                    <dt className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                      {row.label}
                    </dt>
                    <dd className='mt-1'>{row.value}</dd>
                  </div>
                ))}
            </dl>
          )}
          {plan && plan.revealProgression.length > 0 && (
            <ModelSection title='Reveals' count={plan.revealProgression.length}>
              <ul className='list-disc space-y-1 pl-5 text-sm'>
                {plan.revealProgression.map((reveal) => (
                  <li key={reveal}>{reveal}</li>
                ))}
              </ul>
            </ModelSection>
          )}
          {episode.warnings.length > 0 && (
            <ul className='space-y-1 text-xs text-amber-600'>
              {episode.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <ModelSection title='Moments' count={episode.momentCount}>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            {episode.stageStatus.moments !== 'done' &&
              plan?.momentOutline.map((item) => (
                <div key={item.momentId} className='rounded-lg border border-dashed border-border p-3 text-sm'>
                  <span className='font-medium'>{item.title}</span>
                  <span className='ml-2 text-xs text-muted-foreground'>
                    seq {item.seqStart}–{item.seqEnd} · {item.purpose}
                  </span>
                </div>
              ))}
            {episode.stageStatus.moments === 'done' && !moments && !error && (
              <div className='h-16 animate-pulse rounded-lg bg-muted' />
            )}
            {moments?.map((moment) => (
              <MomentCard key={moment.momentId} bookId={bookId} moment={moment} nameOf={nameOf} />
            ))}
          </ModelSection>
        </div>
      )}
    </div>
  );
}
