'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit } from 'lucide-react';
import { DashboardFrame } from '@/components/dashboard/DashboardFrame';
import { EntityDetail } from '@/components/books/model/EntityDetail';
import {
  AliasConflictPanel,
  ChapterPanel,
  CoveragePanel,
  DiagnosticsPanel,
  EventPanel,
  SceneStrip,
  WorldPanel,
} from '@/components/books/model/ModelOverview';
import { Panel } from '@/components/books/model/ModelPrimitives';
import { getBook, type Book } from '@/lib/books';
import { loadBookModel, type BookModel, type EntityType } from '@/lib/book-pipeline';
import { bookNavItems } from '@/lib/navigation';

const entityTypes: EntityType[] = ['character', 'location', 'object', 'group', 'concept'];
type Tab = 'entities' | 'events' | 'chapters' | 'coverage';
const tabs: { key: Tab; label: string }[] = [
  { key: 'entities', label: 'Entities' },
  { key: 'events', label: 'Events' },
  { key: 'chapters', label: 'Chapters' },
  { key: 'coverage', label: 'Coverage' },
];

export function BookModelPage({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [model, setModel] = useState<BookModel | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | EntityType>('all');
  const [tab, setTab] = useState<Tab>('entities');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBook(bookId), loadBookModel(bookId)])
      .then(([loadedBook, loadedModel]) => {
        if (cancelled) return;
        if (!loadedBook) throw new Error('This book no longer exists.');
        setBook(loadedBook);
        setModel(loadedModel);
        const ranked = [...loadedModel.entities].sort(
          (left, right) => right.mentionCount - left.mentionCount
        );
        setSelectedEntityId(ranked[0]?.entityId ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load Book Model.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of model?.entities ?? []) map.set(entity.entityId, entity.canonicalName);
    return map;
  }, [model]);
  const nameOf = useMemo(
    () => (entityId: string) => nameById.get(entityId) ?? entityId,
    [nameById]
  );

  const rankedEntities = useMemo(
    () =>
      [...(model?.entities ?? [])].sort(
        (left, right) => right.mentionCount - left.mentionCount || left.firstSeq - right.firstSeq
      ),
    [model]
  );
  const filteredEntities = useMemo(
    () => rankedEntities.filter((entity) => filter === 'all' || entity.type === filter),
    [rankedEntities, filter]
  );
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entity of rankedEntities) {
      counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    }
    return counts;
  }, [rankedEntities]);
  const selectedEntity =
    rankedEntities.find((entity) => entity.entityId === selectedEntityId) ?? null;

  if (loading) {
    return (
      <DashboardFrame navItems={bookNavItems(bookId)} roleLabel='Book Model'>
        <div className='dashboard-skeleton space-y-4'>
          <div className='h-8 w-48 animate-pulse rounded-lg bg-muted' />
          <div className='h-64 animate-pulse rounded-xl border border-border bg-card' />
        </div>
      </DashboardFrame>
    );
  }

  if (error || !book || !model) {
    return (
      <DashboardFrame navItems={bookNavItems(bookId)} roleLabel='Book Model'>
        <Link href={`/book/${bookId}`} className='text-sm text-primary hover:underline'>
          Back to book
        </Link>
        <div className='mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm'>
          {error ?? 'Book not found.'}
        </div>
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
      companyName={book.title}
      displayName={book.author}
      roleLabel='Book Model'
      navItems={bookNavItems(bookId)}
    >
      <section className='space-y-6'>
        <Link
          href={`/book/${bookId}`}
          className='inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='h-4 w-4' aria-hidden='true' />
          Back to dashboard
        </Link>

        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <div className='flex items-center gap-2'>
              <BrainCircuit className='h-5 w-5 text-primary' aria-hidden='true' />
              <h2 className='text-2xl font-semibold tracking-tight'>Book Model</h2>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {model.entities.length} entities · {model.events.length} events ·{' '}
              {model.sceneRanges.length} scenes ·{' '}
              {model.coverage
                ? `${model.coverage.annotated} of ${model.coverage.storyParagraphs} paragraphs annotated`
                : 'no coverage report'}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {tabs.map((item) => (
              <button
                key={item.key}
                type='button'
                onClick={() => setTab(item.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  tab === item.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {model.world && <WorldPanel world={model.world} />}

        {model.rollingSynopsis && <Panel title='Synopsis'>{model.rollingSynopsis}</Panel>}

        {model.aliasConflicts.length > 0 && (
          <AliasConflictPanel conflicts={model.aliasConflicts} nameOf={nameOf} />
        )}

        {tab === 'entities' &&
          (model.entities.length === 0 ? (
            <div className='rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground'>
              No Book Model exists yet. Save canonical text and run whole-book processing from
              Extraction.
            </div>
          ) : (
            <>
              <div className='flex flex-wrap gap-2'>
                {(['all', ...entityTypes] as const).map((type) => (
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
                    <span className='ml-1.5 opacity-70'>
                      {type === 'all' ? rankedEntities.length : (typeCounts.get(type) ?? 0)}
                    </span>
                  </button>
                ))}
              </div>
              <div className='grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]'>
                <div className='max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-2'>
                  {filteredEntities.map((entity) => (
                    <button
                      key={entity.entityId}
                      type='button'
                      onClick={() => setSelectedEntityId(entity.entityId)}
                      className={`mb-1 flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left ${
                        selectedEntityId === entity.entityId
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <span>
                        <span className='block text-sm font-medium'>{entity.canonicalName}</span>
                        <span className='mt-0.5 block text-xs text-muted-foreground'>
                          {entity.mentionCount} mentions · seq {entity.firstSeq}–{entity.lastSeq}
                        </span>
                      </span>
                      <span className='rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted-foreground'>
                        {entity.importance}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedEntity && <EntityDetail entity={selectedEntity} nameOf={nameOf} />}
              </div>
            </>
          ))}

        {tab === 'events' && <EventPanel events={model.events} nameOf={nameOf} />}

        {tab === 'chapters' && (
          <>
            {model.chapterSummaries.length > 0 && (
              <ChapterPanel chapters={model.chapterSummaries} />
            )}
            <SceneStrip scenes={model.sceneRanges} nameOf={nameOf} />
          </>
        )}

        {tab === 'coverage' && (
          <>
            {model.coverage && <CoveragePanel coverage={model.coverage} />}
            {model.diagnostics && (
              <DiagnosticsPanel diagnostics={model.diagnostics} nameOf={nameOf} />
            )}
          </>
        )}
      </section>
    </DashboardFrame>
  );
}
