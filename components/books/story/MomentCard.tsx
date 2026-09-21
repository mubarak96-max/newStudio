'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getParagraphs, type Paragraph } from '@/lib/book-pipeline';
import type { Moment } from '@/lib/story-types';
import { Badge, ModelSection } from '@/components/books/model/ModelPrimitives';

type Props = {
  bookId: string;
  moment: Moment;
  nameOf: (entityId: string) => string;
};

export function MomentCard({ bookId, moment, nameOf }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Paragraph[] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const loadSource = async () => {
    try {
      setSource(
        await getParagraphs(bookId, moment.sourceId, moment.canonicalHash, moment.seqStart, moment.seqEnd)
      );
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Could not load source text.');
    }
  };

  const unverified = moment.commentary.filter((item) => !item.verified).length;
  const attributed = moment.dialogue.filter((line) => line.speakerEntityId).length;

  return (
    <div className='rounded-lg border border-border bg-background'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className='flex w-full items-start justify-between gap-3 p-3 text-left'
      >
        <span className='min-w-0'>
          <span className='block text-sm font-medium'>
            {moment.order}. {moment.title}
          </span>
          <span className='mt-0.5 block text-xs text-muted-foreground'>
            seq {moment.seqStart}–{moment.seqEnd} · {moment.sourceParagraphIds.length} paragraphs ·{' '}
            {moment.wordCount} words
            {moment.locationId ? ` · ${nameOf(moment.locationId)}` : ''}
          </span>
        </span>
        <span className='flex flex-wrap items-center justify-end gap-1'>
          {moment.status === 'fallback' && <Badge tone='warn'>fallback</Badge>}
          {unverified > 0 && <Badge tone='warn'>{unverified} unverified</Badge>}
          <ChevronDown
            aria-hidden='true'
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className='space-y-5 border-t border-border p-4'>
          <p className='text-sm'>{moment.summary}</p>
          <dl className='grid gap-3 text-xs sm:grid-cols-2'>
            <div>
              <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>Start</dt>
              <dd className='mt-1'>{moment.startState}</dd>
            </div>
            <div>
              <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>End</dt>
              <dd className='mt-1'>{moment.endState}</dd>
            </div>
          </dl>

          <div className='flex flex-wrap gap-1'>
            {moment.characters.map((character) => (
              <Badge key={character.entityId}>{nameOf(character.entityId)}</Badge>
            ))}
            {moment.objectIds.map((id) => (
              <Badge key={id}>{nameOf(id)}</Badge>
            ))}
            <Badge>story time {moment.storyTime}</Badge>
          </div>

          {moment.exactTextSelections.length > 0 && (
            <ModelSection title='Exact text' count={moment.exactTextSelections.length}>
              {moment.exactTextSelections.map((selection) => (
                <blockquote
                  key={`${selection.paragraphId}-${selection.start}`}
                  className='border-l-2 border-primary/50 pl-3 text-sm italic'
                >
                  {selection.text}
                  <span className='ml-2 font-mono text-[11px] not-italic text-primary'>
                    {selection.paragraphId}
                  </span>
                </blockquote>
              ))}
            </ModelSection>
          )}

          {moment.dialogue.length > 0 && (
            <ModelSection title={`Dialogue (${attributed} attributed)`} count={moment.dialogue.length}>
              <ul className='space-y-1 text-sm'>
                {moment.dialogue.map((line) => (
                  <li key={`${line.paragraphId}-${line.start}`}>
                    <span className='font-medium'>
                      {line.speakerEntityId ? nameOf(line.speakerEntityId) : 'Unattributed'}
                    </span>
                    {line.addresseeEntityId && (
                      <span className='text-muted-foreground'> → {nameOf(line.addresseeEntityId)}</span>
                    )}
                    : “{line.text}”
                  </li>
                ))}
              </ul>
            </ModelSection>
          )}

          {moment.commentary.length > 0 && (
            <ModelSection title='Commentary' count={moment.commentary.length}>
              {moment.commentary.map((item) => (
                <div key={item.id} className='rounded-md border border-border p-2 text-sm'>
                  <div className='flex flex-wrap items-center gap-1'>
                    <Badge>{item.kind}</Badge>
                    {!item.verified && <Badge tone='warn'>{item.issues.join(' ')}</Badge>}
                  </div>
                  <p className='mt-1'>{item.text}</p>
                  <p className='mt-1 wrap-anywhere font-mono text-[11px] text-primary'>{item.groundedIn.join(', ')}</p>
                </div>
              ))}
            </ModelSection>
          )}

          {moment.visualPlan.shots.length > 0 && (
            <ModelSection title='Shots' count={moment.visualPlan.shots.length}>
              {moment.visualPlan.shots.map((shot) => (
                <div key={shot.shotId} className='rounded-md border border-border p-2 text-sm'>
                  <div className='flex flex-wrap gap-1'>
                    <Badge>{shot.framing}</Badge>
                    <Badge>{shot.timeOfDay}</Badge>
                    {shot.mood && <Badge>{shot.mood}</Badge>}
                  </div>
                  <p className='mt-1'>{shot.description}</p>
                  {shot.entityStates.length > 0 && (
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {shot.entityStates.map((state) => nameOf(state.entityId)).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </ModelSection>
          )}

          {moment.inspectableEntities.length > 0 && (
            <ModelSection title='Inspectable' count={moment.inspectableEntities.length}>
              <ul className='space-y-1 text-sm'>
                {moment.inspectableEntities.map((item) => (
                  <li key={item.entityId}>
                    <span className='font-medium'>{nameOf(item.entityId)}</span>
                    <span className='text-muted-foreground'> — {item.reason}</span>
                  </li>
                ))}
              </ul>
            </ModelSection>
          )}

          {moment.warnings.length > 0 && (
            <ul className='space-y-1 text-xs text-amber-600'>
              {moment.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <ModelSection title='Source text'>
            {source ? (
              <div className='max-h-80 space-y-2 overflow-y-auto rounded-md border border-border p-3 text-sm'>
                {source.map((paragraph) => (
                  <p key={paragraph.id} className={paragraph.isStory ? '' : 'text-muted-foreground'}>
                    <span className='mr-2 font-mono text-[11px] text-primary'>{paragraph.id}</span>
                    {paragraph.text}
                  </p>
                ))}
              </div>
            ) : (
              <button
                type='button'
                onClick={loadSource}
                className='rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground'
              >
                Show source paragraphs
              </button>
            )}
            {sourceError && <p className='text-xs text-destructive'>{sourceError}</p>}
          </ModelSection>
        </div>
      )}
    </div>
  );
}
