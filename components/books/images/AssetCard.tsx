'use client';

import { ruleVersions } from '@/lib/rules';
import { useEffect, useState } from 'react';
import { subscribePipelineJob, type PipelineJob } from '@/lib/book-pipeline';
import Image from 'next/image';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import type { AssetVersion, VisualAsset } from '@/lib/images';
import { Badge } from '@/components/books/model/ModelPrimitives';

export type AssetDependency = { label: string; approved: boolean };

function Picture({ version, label }: { version: AssetVersion; label: string }) {
  return (
    <figure className='space-y-1'>
      <div className='overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]'>
        <Image
          src={version.url}
          alt={label}
          width={version.width ?? 1024}
          height={version.height ?? 1024}
          unoptimized
          className='h-auto w-full'
        />
      </div>
      <figcaption className='text-[11px] text-muted-foreground'>
        {label} · {version.width ?? '?'}×{version.height ?? '?'} ·{' '}
        {version.provider === 'gemini-batch' ? 'Gemini batch' : 'OpenRouter'} · {version.costExact === false ? '~' : ''}$
        {version.costUsd.toFixed(3)}
        {version.alpha === 'chroma-green' ? ' · green screen, keyed in 2.5D' : ''}
        {version.note ? ` · note: ${version.note}` : ''}
      </figcaption>
    </figure>
  );
}

/** What the worker is doing with the job behind a "generating" image, so a stalled request is visible. */
function JobLine({ bookId, jobId }: { bookId: string; jobId: string }) {
  const [job, setJob] = useState<PipelineJob | null>(null);
  useEffect(() => subscribePipelineJob(bookId, jobId, setJob, () => undefined), [bookId, jobId]);
  if (!job) return null;
  // Only a worker from before image jobs existed reports an understanding version on an image job.
  if (job.workerVersion && /^understand-v[0-9]$/.test(job.workerVersion)) {
    return (
      <p className='text-xs text-destructive'>
        An outdated worker ({job.workerVersion}) picked this up. Cancel it, restart the worker (npm run worker) and
        generate again.
      </p>
    );
  }
  const text =
    job.status === 'queued'
      ? 'Queued — waiting for the worker. If this stays here, check that npm run worker is running.'
      : job.status === 'running'
        ? `Generating with ${job.model ?? 'the image model'}…`
        : job.status === 'failed'
          ? `Failed: ${job.error ?? 'unknown error'}`
          : null;
  return text ? <p className='text-xs text-muted-foreground'>{text}</p> : null;
}

export function AssetCard({
  bookId,
  title,
  subtitle,
  asset,
  plannedPrompt,
  dependencies,
  onGenerate,
  onApprove,
  inBatch,
  onToggleBatch,
}: {
  bookId: string;
  title: string;
  subtitle: string;
  asset: VisualAsset | undefined;
  plannedPrompt: string;
  dependencies: AssetDependency[];
  onGenerate: (note: string | null) => Promise<void>;
  onApprove: (versionId: string) => Promise<void>;
  /** Whether this image is selected for the next Gemini batch. */
  inBatch: boolean;
  /** Adds or removes it, carrying the card's correction note into the batch. */
  onToggleBatch: (note: string | null) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const versions = asset?.versions ?? [];
  const approved = versions.find((version) => version.versionId === asset?.approvedVersionId) ?? null;
  const latest = versions.at(-1) ?? null;
  const selected = versions.find((version) => version.versionId === selectedId) ?? latest;
  const generating = asset?.status === 'generating';
  const batched = asset?.status === 'batched';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-3 rounded-xl border border-border bg-card p-4'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <label className='flex min-w-0 cursor-pointer items-start gap-2'>
          <input
            type='checkbox'
            checked={inBatch}
            disabled={batched}
            onChange={() => onToggleBatch(note.trim() || null)}
            className='mt-1 h-4 w-4 shrink-0 accent-primary'
            aria-label={`Select ${title} for a Gemini batch`}
          />
          <span className='min-w-0'>
            <span className='block text-sm font-semibold'>{title}</span>
            <span className='block text-xs text-muted-foreground'>{subtitle}</span>
          </span>
        </label>
        <span className='flex flex-wrap gap-1'>
          {approved ? <Badge>approved</Badge> : <Badge tone='warn'>not approved</Badge>}
          {generating && <Badge tone='warn'>generating…</Badge>}
          {batched && <Badge tone='warn'>in Gemini batch</Badge>}
          {versions.length > 0 && <Badge>{versions.length} version(s)</Badge>}
        </span>
      </div>

      {dependencies.length > 0 && (
        <p className='text-xs text-muted-foreground'>
          Uses:{' '}
          {dependencies.map((dependency, index) => (
            <span key={dependency.label} className={dependency.approved ? '' : 'text-amber-600'}>
              {index > 0 ? ', ' : ''}
              {dependency.label} {dependency.approved ? '✓' : '(generated and checked first)'}
            </span>
          ))}
        </p>
      )}

      {versions.length > 0 && (
        <div className='grid gap-3 sm:grid-cols-2'>
          {approved && <Picture version={approved} label='Approved' />}
          {selected && selected.versionId !== approved?.versionId && (
            <div className='space-y-2'>
              <Picture version={selected} label={selected === latest ? 'Latest candidate' : 'Earlier version'} />
              <button
                type='button'
                disabled={busy || !selected.check?.ok || !selected.check.semantic || selected.check.version !== ruleVersions.imageChecks}
                onClick={() => run(() => onApprove(selected.versionId))}
                className='inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50'
              >
                <Check className='h-3.5 w-3.5' aria-hidden='true' /> Approve this version
              </button>
            </div>
          )}
        </div>
      )}

      {versions.length > 1 && (
        <div className='flex flex-wrap gap-2'>
          {versions.map((version, index) => (
            <button
              key={version.versionId}
              type='button'
              onClick={() => setSelectedId(version.versionId)}
              className={`h-14 w-14 overflow-hidden rounded-md border ${
                version.versionId === selected?.versionId ? 'border-primary ring-2 ring-primary/40' : 'border-border'
              }`}
              title={`Version ${index + 1}${version.versionId === approved?.versionId ? ' (approved)' : ''}`}
            >
              <Image src={version.url} alt={`Version ${index + 1}`} width={56} height={56} unoptimized className='h-full w-full object-cover' />
            </button>
          ))}
        </div>
      )}

      {(generating || batched) && asset?.lastJobId && <JobLine bookId={bookId} jobId={asset.lastJobId} />}
      {batched && (
        <p className='text-xs text-muted-foreground'>
          Waiting for the Gemini batch. The image appears here when it completes (usually within hours, at most 24h).
          You can still generate it now with OpenRouter.
        </p>
      )}
      {selected?.check && !selected.check.ok && <p className='text-xs text-destructive'>{selected.check.issues.join(' ')}</p>}
      {asset?.status === 'failed' && asset.error && <p className='text-xs text-destructive'>{asset.error}</p>}
      {error && <p className='text-xs text-destructive'>{error}</p>}

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={versions.length > 0 ? 'Optional correction for the next version' : 'Optional note'}
          className='min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs'
        />
        <button
          type='button'
          disabled={busy || generating}
          onClick={() =>
            run(async () => {
              await onGenerate(note.trim() || null);
              setNote('');
            })
          }
          className='inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50'
        >
          {versions.length > 0 ? (
            <>
              <RefreshCw className='h-3.5 w-3.5' aria-hidden='true' /> Regenerate now
            </>
          ) : (
            <>
              <Sparkles className='h-3.5 w-3.5' aria-hidden='true' /> Generate now
            </>
          )}
        </button>
      </div>

      <details className='text-xs'>
        <summary className='cursor-pointer text-muted-foreground'>Prompt</summary>
        <p className='wrap-anywhere mt-2 rounded-md bg-muted p-2 font-mono text-[11px]'>
          {selected?.prompt ?? plannedPrompt}
        </p>
      </details>
    </div>
  );
}
