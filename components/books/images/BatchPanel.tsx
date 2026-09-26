'use client';

import { useState } from 'react';
import { Layers } from 'lucide-react';
import type { ImageBatch } from '@/lib/images';
import { Badge } from '@/components/books/model/ModelPrimitives';

const statusText: Record<ImageBatch['status'], string> = {
  submitted: 'submitted, waiting to start',
  running: 'running at Gemini',
  completed: 'completed',
  failed: 'failed',
};

/**
 * Two ways to generate: "Generate now" on a card goes through OpenRouter and
 * returns at once; selecting cards and submitting here sends them to Gemini as
 * a half-price batch whose results arrive later.
 */
export function BatchPanel({
  selectedCount,
  viewCount,
  onSelectAll,
  onSelectUnapproved,
  onClear,
  onSubmit,
  batches,
}: {
  selectedCount: number;
  viewCount: number;
  onSelectAll: () => void;
  onSelectUnapproved: () => void;
  onClear: () => void;
  onSubmit: () => Promise<void>;
  batches: ImageBatch[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? batches : batches.slice(0, 3);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the batch.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-3 rounded-xl border border-border bg-card p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Layers className='h-4 w-4 text-primary' aria-hidden='true' />
          <p className='text-sm font-semibold'>Gemini batch</p>
          <span className='text-xs text-muted-foreground'>half price · results within 24h</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <button type='button' onClick={onSelectUnapproved} className='rounded-full border border-border px-3 py-1 text-xs hover:bg-accent'>
            Select not approved
          </button>
          <button type='button' onClick={onSelectAll} className='rounded-full border border-border px-3 py-1 text-xs hover:bg-accent'>
            Select all {viewCount}
          </button>
          {selectedCount > 0 && (
            <button type='button' onClick={onClear} className='rounded-full border border-border px-3 py-1 text-xs hover:bg-accent'>
              Clear
            </button>
          )}
          <button
            type='button'
            disabled={busy || selectedCount === 0}
            onClick={submit}
            className='rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50'
          >
            Submit {selectedCount} to Gemini batch
          </button>
        </div>
      </div>
      <p className='text-xs text-muted-foreground'>
        Tick images on the cards (a card&apos;s correction note goes with it), then submit. Use “Generate now” on a card for
        an instant single image through OpenRouter. The pipeline generates required references first, validates each result, retries rejected images once, and assembles the scenes automatically. Each dependency wave has its own batch turnaround.
      </p>
      {error && <p className='text-xs text-destructive'>{error}</p>}
      {batches.length > 0 && (
        <ul className='space-y-1 text-xs'>
          {visible.map((batch) => (
            <li key={batch.batchId} className='flex flex-wrap items-center gap-2'>
              <Badge tone={batch.status === 'failed' ? 'warn' : 'neutral'}>{statusText[batch.status]}</Badge>
              <span>
                {batch.counts.total} image(s)
                {batch.status === 'completed' ? ` · ${batch.counts.saved} saved, ${batch.counts.failed} failed` : ''}
              </span>
              <span className='text-muted-foreground'>submitted {new Date(batch.submittedAt).toLocaleString()}</span>
              {batch.error && <span className='text-destructive'>{batch.error}</span>}
            </li>
          ))}
          {batches.length > 3 && (
            <li>
              <button type='button' onClick={() => setShowAll((value) => !value)} className='text-primary hover:underline'>
                {showAll ? 'Show fewer' : `Show all ${batches.length} batches`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
