'use client';

import { useEffect, useRef, useState } from 'react';
import type { Book } from '@/lib/books';
import { retryPipelineJob, subscribePipelineJob, type PipelineJob } from '@/lib/book-pipeline';
import { enqueuePipelineJob, pipelineStages, type PipelineJobType } from '@/lib/story';

/**
 * Follows the latest job of one pipeline stage. `onStep` fires whenever the
 * job reaches a new step, so a page can reload results as they land.
 */
export function useStageJob(bookId: string, book: Book | null, type: PipelineJobType, onStep: () => void) {
  const stage = pipelineStages[type];
  const bookJobId =
    book?.pipelineJobs?.[stage] ?? (book?.pipeline?.stage === stage ? book.pipeline.lastJobId : undefined);
  const [startedJobId, setStartedJobId] = useState<string | null>(null);
  const jobId = startedJobId ?? bookJobId;
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onStepRef = useRef(onStep);
  const lastStep = useRef('');

  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  useEffect(() => {
    if (!jobId) return;
    return subscribePipelineJob(
      bookId,
      jobId,
      (next) => {
        setJob(next);
        const step = `${next.status}:${next.phase}:${next.activity?.label ?? ''}`;
        if (step !== lastStep.current) {
          lastStep.current = step;
          onStepRef.current();
        }
      },
      (err) => setError(err instanceof Error ? err.message : 'Could not read job status.')
    );
  }, [bookId, jobId]);

  const running = job?.status === 'queued' || job?.status === 'running';

  const start = async (extra: Record<string, unknown> = {}) => {
    if (!book?.activeSourceId || !book.canonical?.hash || running) return;
    setError(null);
    try {
      setStartedJobId(
        await enqueuePipelineJob(
          bookId,
          type,
          { sourceId: book.activeSourceId, canonicalHash: book.canonical.hash },
          extra
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the job.');
    }
  };

  const resume = async () => {
    if (!job) return;
    setError(null);
    try {
      await retryPipelineJob(bookId, job.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resume the job.');
    }
  };

  return { job, error, running, start, resume };
}

export function StageJobPanel({ job, name }: { job: PipelineJob | null; name: string }) {
  if (!job) return null;
  if (job.status === 'queued' || job.status === 'running') {
    const activity = job.activity;
    return (
      <div className='rounded-xl border border-border bg-card p-5 text-sm'>
        <p className='font-medium'>
          {activity?.label ?? (job.status === 'queued' ? 'Waiting for the worker' : 'Working')}
        </p>
        {activity && (
          <>
            <p className='mt-1 text-xs text-muted-foreground'>{activity.detail}</p>
            <div className='mt-3 h-2 overflow-hidden rounded-full bg-muted'>
              <div
                className='h-full bg-primary transition-all'
                style={{ width: `${activity.total ? (activity.done / activity.total) * 100 : 0}%` }}
              />
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              {activity.done} of {activity.total} {activity.unit} · ${job.costUsd.toFixed(3)}
            </p>
          </>
        )}
      </div>
    );
  }
  if (job.status === 'failed') {
    return (
      <div className='rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm'>
        <p className='font-medium'>{name} failed.</p>
        <p className='mt-1 text-muted-foreground'>{job.error}</p>
      </div>
    );
  }
  if (job.status === 'completed' && job.warning) {
    return (
      <div className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm'>{job.warning}</div>
    );
  }
  return null;
}

export function StageActions({
  running,
  failed,
  hasResult,
  disabled,
  startLabel,
  onStart,
  onResume,
}: {
  running: boolean;
  failed: boolean;
  hasResult: boolean;
  disabled: boolean;
  startLabel: string;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div className='flex gap-2'>
      {failed && (
        <button
          type='button'
          onClick={() => onResume()}
          className='rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent'
        >
          Resume
        </button>
      )}
      <button
        type='button'
        onClick={() => onStart()}
        disabled={running || disabled}
        className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50'
      >
        {hasResult ? 'Run again' : startLabel}
      </button>
    </div>
  );
}
