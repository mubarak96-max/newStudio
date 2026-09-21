'use client';

import { useCallback, useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { StageFrame } from '@/components/books/pipeline/StageFrame';
import { StageActions, StageJobPanel, useStageJob } from '@/components/books/pipeline/StageJob';
import { useBookData } from '@/components/books/pipeline/useBookData';
import { CompositionCard, EntityVisualCard, ProfilePanel } from '@/components/books/visuals/VisualPanels';
import { ModelSection } from '@/components/books/model/ModelPrimitives';
import type { Book } from '@/lib/books';
import { loadVisualPlan } from '@/lib/visuals';

const typeFilters = ['all', 'character', 'location', 'object', 'group'] as const;

export function VisualsPage({ bookId }: { bookId: string }) {
  const load = useCallback(
    (book: Book) =>
      loadVisualPlan(bookId, { sourceId: book.activeSourceId, canonicalHash: book.canonical?.hash }),
    [bookId]
  );
  const { book, data: plan, loading, error, refresh, nameOf } = useBookData(bookId, load);
  const stage = useStageJob(bookId, book, 'visuals', refresh);
  const [filter, setFilter] = useState<(typeof typeFilters)[number]>('all');
  const entities = useMemo(
    () => (plan?.entities ?? []).filter((entity) => filter === 'all' || entity.type === filter),
    [plan, filter]
  );
  const compositions = plan?.compositions ?? [];

  return (
    <StageFrame
      bookId={bookId}
      book={book}
      loading={loading}
      title='Visuals'
      icon={Palette}
      subtitle={`${plan?.entities.length ?? 0} entity references · ${compositions.length} compositions planned`}
      error={error ?? stage.error}
      actions={
        <StageActions
          running={stage.running}
          failed={stage.job?.status === 'failed'}
          hasResult={Boolean(plan?.summary)}
          disabled={!book?.activeSourceId}
          startLabel='Plan visuals'
          onStart={stage.start}
          onResume={stage.resume}
        />
      }
    >
      <StageJobPanel job={stage.job} name='Visual planning' />
      {!plan?.summary ? (
        !stage.running && (
          <div className='rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground'>
            No visual plan yet. It starts automatically once Beats finish.
          </div>
        )
      ) : (
        <>
          <ProfilePanel profile={plan.summary.visualProfile} forecast={plan.summary.forecast} notes={plan.summary.notes} />

          <ModelSection title='Visual continuity bible' count={plan.entities.length}>
            <div className='flex flex-wrap gap-2'>
              {typeFilters.map((type) => (
                <button
                  key={type}
                  type='button'
                  onClick={() => setFilter(type)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                    filter === type
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {entities.map((entity) => (
              <EntityVisualCard key={entity.entityId} entity={entity} />
            ))}
          </ModelSection>

          <ModelSection title='Compositions' count={compositions.length}>
            {compositions.map((composition) => (
              <CompositionCard key={composition.compositionId} composition={composition} nameOf={nameOf} />
            ))}
          </ModelSection>
        </>
      )}
    </StageFrame>
  );
}
