'use client';

import { useEffect, useRef } from 'react';
import type { PipelineJob } from '@/lib/book-pipeline';

/** The worker's own log lines for one job, as the terminal printed them. */
export function JobLog({ job, title }: { job: PipelineJob; title: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const running = job.status === 'queued' || job.status === 'running';

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [job.log.length]);

  if (job.log.length === 0 && !job.result) return null;
  return (
    <div className='mt-3 space-y-2 text-xs'>
      {job.result && job.status === 'completed' && (
        <p className='text-muted-foreground'>
          <span className='font-medium text-foreground'>{title} finished:</span> {job.result}, $
          {job.costUsd.toFixed(4)}.
        </p>
      )}
      {job.log.length > 0 && (
        <details open={running} className='rounded-lg border border-border bg-background'>
          <summary className='cursor-pointer px-3 py-2 font-medium'>
            {title} log · {job.log.length} lines
          </summary>
          <div
            ref={listRef}
            className='max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground'
          >
            {job.log.map((line, index) => (
              <div key={index} className={line.slice(9).startsWith('warn ') ? 'text-amber-600' : undefined}>
                {line}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
