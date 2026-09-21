'use client';

import { useCallback } from 'react';
import { Film } from 'lucide-react';
import { BeatEpisode } from '@/components/books/beats/BeatEpisode';
import { StageFrame } from '@/components/books/pipeline/StageFrame';
import { StageActions, StageJobPanel, useStageJob } from '@/components/books/pipeline/StageJob';
import { useBookData } from '@/components/books/pipeline/useBookData';
import type { Book } from '@/lib/books';
import { loadStoryPlan } from '@/lib/story';

export function BeatsPage({ bookId }: { bookId: string }) {
  const load = useCallback(
    (book: Book) =>
      loadStoryPlan(bookId, { sourceId: book.activeSourceId, canonicalHash: book.canonical?.hash }),
    [bookId]
  );
  const { book, data: plan, loading, error, refresh, nameOf } = useBookData(bookId, load);
  const stage = useStageJob(bookId, book, 'beats', refresh);
  const episodes = plan?.episodes ?? [];
  const beatTotal = episodes.reduce((sum, episode) => sum + (episode.beatCount ?? 0), 0);
  const withBeats = episodes.filter((episode) => episode.stageStatus.beats === 'done').length;

  return (
    <StageFrame
      bookId={bookId}
      book={book}
      loading={loading}
      title='Beats'
      icon={Film}
      subtitle={`${beatTotal} Reading Beats · ${withBeats} of ${episodes.length} episodes built`}
      error={error ?? stage.error}
      actions={
        <StageActions
          running={stage.running}
          failed={stage.job?.status === 'failed'}
          hasResult={beatTotal > 0}
          disabled={episodes.length === 0}
          startLabel='Build Beats'
          onStart={stage.start}
          onResume={stage.resume}
        />
      }
    >
      <StageJobPanel job={stage.job} name='Beat building' />
      {episodes.length === 0 ? (
        <div className='rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground'>
          No story plan yet. Beats start automatically once Story planning finishes.
        </div>
      ) : (
        <div className='space-y-3'>
          {episodes.map((episode) => (
            <BeatEpisode
              key={`${episode.episodeId}-${episode.stageStatus.beats ?? 'pending'}`}
              bookId={bookId}
              episode={episode}
              nameOf={nameOf}
            />
          ))}
        </div>
      )}
    </StageFrame>
  );
}
