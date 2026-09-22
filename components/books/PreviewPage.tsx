'use client';

import { useCallback, useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Player } from '@/components/books/preview/Player';
import { StageFrame } from '@/components/books/pipeline/StageFrame';
import { StageJobPanel, useStageJob } from '@/components/books/pipeline/StageJob';
import { useBookData } from '@/components/books/pipeline/useBookData';
import { Badge } from '@/components/books/model/ModelPrimitives';
import type { Book } from '@/lib/books';
import { loadEpisodePreview, type EpisodePreview } from '@/lib/compose';
import { loadStoryPlan } from '@/lib/story';

export function PreviewPage({ bookId }: { bookId: string }) {
  const load = useCallback(
    (book: Book) => loadStoryPlan(bookId, { sourceId: book.activeSourceId, canonicalHash: book.canonical?.hash }),
    [bookId]
  );
  const { book, data: plan, loading, error, nameOf } = useBookData(bookId, load);
  const episodes = plan?.episodes ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const episodeId = chosen ?? episodes[0]?.episodeId ?? null;
  const [preview, setPreview] = useState<EpisodePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!episodeId) return;
    let cancelled = false;
    loadEpisodePreview(bookId, episodeId)
      .then((loaded) => {
        if (!cancelled) setPreview(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Could not load the episode.');
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, episodeId, version]);

  // Reload the episode as the assembly job reports progress, so fixed compositions appear.
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const stage = useStageJob(bookId, book, 'compose', reload);

  const compositions = preview ? [...preview.compositions.values()] : [];
  const composed = compositions.filter((composition) => composition.assembly?.status === 'composed').length;
  const withIssues = compositions.filter((composition) => composition.assembly?.status === 'issues');
  const episode = episodes.find((item) => item.episodeId === episodeId);

  return (
    <StageFrame
      bookId={bookId}
      book={book}
      loading={loading}
      title='Preview'
      icon={Smartphone}
      subtitle='The 2.5D episode as a reader sees it on a phone'
      error={error ?? stage.error ?? previewError}
      actions={
        <button
          type='button'
          disabled={!episodeId || stage.running}
          onClick={() => stage.start({ episodeId })}
          className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50'
        >
          {composed > 0 ? 'Re-assemble 2.5D' : 'Assemble 2.5D'}
        </button>
      }
    >
      <div className='flex flex-wrap gap-2'>
        {episodes.map((item) => (
          <button
            key={item.episodeId}
            type='button'
            onClick={() => {
              setChosen(item.episodeId);
              setPreview(null);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              item.episodeId === episodeId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Episode {item.order}
          </button>
        ))}
      </div>

      <StageJobPanel job={stage.job} name='2.5D assembly' />

      {episode && preview && (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='font-semibold'>{episode.title}</span>
          <Badge>{preview.beats.length} beats</Badge>
          <Badge tone={composed === compositions.length ? 'neutral' : 'warn'}>
            {composed} of {compositions.length} compositions assembled
          </Badge>
          {composed < compositions.length && !stage.running && (
            <span className='text-xs text-muted-foreground'>
              Press Assemble 2.5D once this episode&apos;s layers are approved on the Images page.
            </span>
          )}
        </div>
      )}

      {withIssues.length > 0 && (
        <div className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs'>
          <p className='font-medium'>Some compositions need attention</p>
          <ul className='mt-2 space-y-1'>
            {withIssues.map((composition) => (
              <li key={composition.compositionId}>
                <span className='font-medium'>{composition.shotSnapshot.description.slice(0, 80)}</span>
                {' — '}
                {composition.assembly?.issues.join(' ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview ? (
        <Player key={episodeId} beats={preview.beats} compositions={preview.compositions} nameOf={nameOf} />
      ) : (
        episodeId && <div className='mx-auto h-96 w-56 animate-pulse rounded-2xl bg-muted' />
      )}
    </StageFrame>
  );
}
