'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit } from 'lucide-react';
import { DashboardFrame } from '@/components/dashboard/DashboardFrame';
import { getBook, type Book } from '@/lib/books';
import {
  loadBookModel,
  type BookModelEntity,
  type BookModelEvent,
} from '@/lib/book-pipeline';
import { bookNavItems } from '@/lib/navigation';

export function BookModelPage({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [entities, setEntities] = useState<BookModelEntity[]>([]);
  const [events, setEvents] = useState<BookModelEvent[]>([]);
  const [rollingSynopsis, setRollingSynopsis] = useState('');
  const [aliasConflicts, setAliasConflicts] = useState<
    { alias: string; entityIds: string[]; paragraphIds: string[] }[]
  >([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | BookModelEntity['type']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBook(bookId), loadBookModel(bookId)])
      .then(([loadedBook, model]) => {
        if (cancelled) return;
        if (!loadedBook) throw new Error('This book no longer exists.');
        setBook(loadedBook);
        setEntities(model.entities);
        setEvents(model.events);
        setRollingSynopsis(model.rollingSynopsis);
        setAliasConflicts(model.aliasConflicts);
        setSelectedEntityId(model.entities[0]?.entityId ?? null);
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

  const filteredEntities = useMemo(
    () => entities.filter((entity) => filter === 'all' || entity.type === filter),
    [entities, filter]
  );
  const selectedEntity = entities.find((entity) => entity.entityId === selectedEntityId) ?? null;

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

  if (error || !book) {
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
              {entities.length} entities and {events.length} source-grounded events.
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {(['all', 'character', 'location', 'object', 'group'] as const).map((type) => (
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
        </div>

        {rollingSynopsis && (
          <div className='rounded-xl border border-border bg-card p-6'>
            <h3 className='text-sm font-semibold'>Rolling synopsis</h3>
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>{rollingSynopsis}</p>
          </div>
        )}

        {aliasConflicts.length > 0 && (
          <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-6'>
            <h3 className='text-sm font-semibold'>Alias conflicts requiring review</h3>
            <div className='mt-3 space-y-2'>
              {aliasConflicts.map((conflict) => (
                <EvidenceRow
                  key={`${conflict.alias}-${conflict.entityIds.join('-')}`}
                  title={conflict.alias}
                  detail={conflict.entityIds.join(' or ')}
                  paragraphIds={conflict.paragraphIds}
                />
              ))}
            </div>
          </div>
        )}

        {entities.length === 0 ? (
          <div className='rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground'>
            No Book Model exists yet. Save canonical text and run whole-book processing from
            Extraction.
          </div>
        ) : (
          <div className='grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]'>
            <div className='max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-2'>
              {filteredEntities.map((entity) => (
                <button
                  key={entity.entityId}
                  type='button'
                  onClick={() => setSelectedEntityId(entity.entityId)}
                  className={`mb-1 flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left ${
                    selectedEntityId === entity.entityId ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                  }`}
                >
                  <span>
                    <span className='block text-sm font-medium'>{entity.canonicalName}</span>
                    <span className='mt-0.5 block text-xs text-muted-foreground'>
                      {entity.entityId} · seq {entity.firstSeq}–{entity.lastSeq}
                    </span>
                  </span>
                  <span className='rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted-foreground'>
                    {entity.type}
                  </span>
                </button>
              ))}
            </div>

            {selectedEntity && (
              <div className='space-y-5 rounded-xl border border-border bg-card p-6'>
                <div>
                  <h3 className='text-xl font-semibold'>{selectedEntity.canonicalName}</h3>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {selectedEntity.importance} · {selectedEntity.status}
                  </p>
                </div>

                <ModelSection title='Aliases'>
                  {selectedEntity.aliases.map((alias) => (
                    <EvidenceRow
                      key={`${alias.name}-${alias.firstSeq}`}
                      title={alias.name}
                      detail={`First seq ${alias.firstSeq}`}
                      paragraphIds={alias.paragraphIds}
                    />
                  ))}
                </ModelSection>

                <ModelSection title='Facts'>
                  {selectedEntity.facts.map((fact) => (
                    <EvidenceRow
                      key={`${fact.key}-${fact.value}`}
                      title={`${fact.key}: ${fact.value}`}
                      detail={`“${fact.quote}”`}
                      paragraphIds={fact.paragraphIds}
                    />
                  ))}
                </ModelSection>

                <ModelSection title='States and reveals'>
                  {selectedEntity.states.map((state) => (
                    <EvidenceRow
                      key={state.stateId}
                      title={state.label}
                      detail={`From seq ${state.validFromSeq}`}
                      paragraphIds={state.paragraphIds}
                    />
                  ))}
                  {selectedEntity.reveals.map((reveal) => (
                    <EvidenceRow
                      key={`${reveal.seq}-${reveal.what}`}
                      title={reveal.what}
                      detail={`Reveal seq ${reveal.seq}`}
                      paragraphIds={reveal.paragraphIds}
                    />
                  ))}
                </ModelSection>

                <ModelSection title='Relationships'>
                  {selectedEntity.relationships.map((relationship) => (
                    <EvidenceRow
                      key={`${relationship.toEntityId}-${relationship.type}`}
                      title={`${relationship.type}: ${relationship.toEntityId}`}
                      detail={`From seq ${relationship.validFromSeq}`}
                      paragraphIds={relationship.paragraphIds}
                    />
                  ))}
                </ModelSection>
              </div>
            )}
          </div>
        )}

        {events.length > 0 && (
          <div className='rounded-xl border border-border bg-card p-6'>
            <h3 className='text-lg font-semibold'>Event chronology</h3>
            <div className='mt-4 space-y-3'>
              {events.map((event) => (
                <EvidenceRow
                  key={event.eventId}
                  title={`${event.order}. ${event.summary}`}
                  detail={`seq ${event.seqStart}–${event.seqEnd} · storyTime ${event.storyTime}`}
                  paragraphIds={event.paragraphIds}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </DashboardFrame>
  );
}

function ModelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>{title}</h4>
      <div className='mt-2 space-y-2'>{children}</div>
    </section>
  );
}

function EvidenceRow({
  title,
  detail,
  paragraphIds,
}: {
  title: string;
  detail: string;
  paragraphIds: string[];
}) {
  return (
    <div className='rounded-lg border border-border bg-background p-3'>
      <p className='text-sm font-medium'>{title}</p>
      <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      <p className='mt-2 font-mono text-[11px] text-primary'>{paragraphIds.join(', ')}</p>
    </div>
  );
}
