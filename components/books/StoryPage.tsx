'use client';

import { useCallback } from 'react';
import { Clapperboard } from 'lucide-react';
import { EpisodeCard } from '@/components/books/story/EpisodeCard';
import { StoryMapPanel } from '@/components/books/story/StoryMapPanel';
import { StageFrame } from '@/components/books/pipeline/StageFrame';
import { StageActions, StageJobPanel, useStageJob } from '@/components/books/pipeline/StageJob';
import { useBookData } from '@/components/books/pipeline/useBookData';
import type { Book } from '@/lib/books';
import { loadStoryPlan } from '@/lib/story';

export function StoryPage({ bookId }: { bookId: string }) {
  const load = useCallback(
    (book: Book) =>
      loadStoryPlan(bookId, { sourceId: book.activeSourceId, canonicalHash: book.canonical?.hash }),
    [bookId]
  );
  const { book, data: plan, loading, error, refresh, nameOf } = useBookData(bookId, load);
  const stage = useStageJob(bookId, book, 'story', refresh);
  const episodes = plan?.episodes ?? [];
  const momentTotal = episodes.reduce((sum, episode) => sum + episode.momentCount, 0);

  return (
    <StageFrame
      bookId={bookId}
      book={book}
      loading={loading}
      title='Story'
      icon={Clapperboard}
      subtitle={`${episodes.length} episodes · ${momentTotal} moments`}
      error={error ?? stage.error}
      actions={
        <StageActions
          running={stage.running}
          failed={stage.job?.status === 'failed'}
          hasResult={episodes.length > 0}
          disabled={!book?.activeSourceId}
          startLabel='Plan story'
          onStart={stage.start}
          onResume={stage.resume}
        />
      }
    >
      <StageJobPanel job={stage.job} name='Story planning' />

      {plan?.storyMap ? (
        <StoryMapPanel
          storyMap={plan.storyMap}
          episodes={episodes}
          paragraphCount={book?.stats?.paragraphCount ?? episodes.at(-1)?.seqEnd ?? 0}
          nameOf={nameOf}
        />
      ) : (
        !stage.running && (
          <div className='rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground'>
            No story plan yet. It starts automatically when the Book Model finishes, or press Plan story.
          </div>
        )
      )}

      <div className='space-y-3'>
        {episodes.map((episode) => (
          <EpisodeCard
            key={`${episode.episodeId}-${episode.stageStatus.moments}`}
            bookId={bookId}
            episode={episode}
            nameOf={nameOf}
          />
        ))}
      </div>
    </StageFrame>
  );
}
