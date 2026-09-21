'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Beat, CameraPose } from '@/lib/story-types';
import { Badge } from '@/components/books/model/ModelPrimitives';

function pose(value: CameraPose): string {
  return `x ${value.x} · y ${value.y} · zoom ${value.zoom}`;
}

/** The subtitles exactly as the reader will see them, commentary visibly separated from the book's words. */
export function BeatSubtitles({ beat }: { beat: Beat }) {
  return (
    <div className='space-y-2 rounded-lg bg-zinc-950 p-4 text-sm text-zinc-50'>
      {beat.text.quote && <p className='font-serif leading-relaxed'>{beat.text.quote.text}</p>}
      {beat.text.dialogue?.map((line) => (
        <p key={`${line.paragraphId}-${line.start}`} className='font-serif'>
          {line.speakerDisplayName && (
            <span className='mr-2 text-xs font-sans font-semibold uppercase tracking-wider text-amber-300'>
              {line.speakerDisplayName}
            </span>
          )}
          “{line.text}”
        </p>
      ))}
      {beat.text.commentary?.map((note) => (
        <p key={note.id} className='border-l-2 border-sky-400 pl-2 text-xs italic text-sky-100'>
          {note.text}
        </p>
      ))}
      {!beat.text.quote && !beat.text.dialogue && !beat.text.commentary && (
        <p className='text-xs text-zinc-400'>No subtitles — image and motion only.</p>
      )}
    </div>
  );
}

export function BeatCard({ beat, nameOf }: { beat: Beat; nameOf: (entityId: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className='rounded-lg border border-border bg-background'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className='flex w-full items-center justify-between gap-3 px-3 py-2 text-left'
      >
        <span className='min-w-0 flex-1 truncate text-sm'>
          <span className='font-mono text-xs text-muted-foreground'>{beat.order}.</span>{' '}
          {beat.text.quote?.text ??
            beat.text.dialogue?.[0]?.text ??
            beat.text.commentary?.[0]?.text ??
            beat.camera.rationale ??
            beat.id}
        </span>
        <span className='flex flex-wrap items-center justify-end gap-1'>
          <Badge>{beat.type}</Badge>
          <Badge>{beat.camera.move}</Badge>
          <ChevronDown
            aria-hidden='true'
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && (
        <div className='space-y-3 border-t border-border p-3 text-sm'>
          <BeatSubtitles beat={beat} />
          <dl className='grid gap-2 text-xs sm:grid-cols-2'>
            <div>
              <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>Camera</dt>
              <dd className='mt-1'>
                {beat.camera.move}
                {beat.camera.focusEntityId ? ` on ${nameOf(beat.camera.focusEntityId)}` : ''} ·{' '}
                {(beat.camera.durationMs / 1000).toFixed(1)}s {beat.camera.easing}
              </dd>
              <dd className='text-muted-foreground'>
                {pose(beat.camera.from)} → {pose(beat.camera.to)}
              </dd>
              {beat.camera.rationale && <dd className='mt-1 text-muted-foreground'>{beat.camera.rationale}</dd>}
            </div>
            <div>
              <dt className='font-semibold uppercase tracking-wider text-muted-foreground'>Transition in</dt>
              <dd className='mt-1'>
                {beat.transitionIn.type} · {beat.transitionIn.durationMs}ms
              </dd>
              <dt className='mt-2 font-semibold uppercase tracking-wider text-muted-foreground'>Composition</dt>
              <dd className='mt-1 font-mono'>{beat.compositionId ?? '—'}</dd>
              <dt className='mt-2 font-semibold uppercase tracking-wider text-muted-foreground'>Reading order</dt>
              <dd className='mt-1 font-mono'>
                ← {beat.previousBeatId ?? 'start'} · {beat.nextBeatId ?? 'end'} →
              </dd>
            </div>
          </dl>
          {beat.inspectables.length > 0 && (
            <div className='flex flex-wrap gap-1'>
              {beat.inspectables.map((item) => (
                <Badge key={item.entityId}>tap: {nameOf(item.entityId)}</Badge>
              ))}
            </div>
          )}
          <div>
            <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Represents {beat.representations.length} paragraph link(s)
            </p>
            <ul className='mt-1 space-y-1 text-xs'>
              {beat.representations.map((rep, index) => (
                <li key={`${rep.paragraphId}-${index}`}>
                  <span className='font-mono text-primary'>{rep.paragraphId}</span>{' '}
                  <Badge>{rep.modality}</Badge> {rep.description}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
