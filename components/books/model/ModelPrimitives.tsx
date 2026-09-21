'use client';

import type { ReactNode } from 'react';

export function ModelSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
        {title}
        {count !== undefined && <span className='ml-2 text-muted-foreground/70'>{count}</span>}
      </h4>
      <div className='mt-2 space-y-2'>{children}</div>
    </section>
  );
}

export function EvidenceRow({
  title,
  detail,
  paragraphIds,
  badges,
}: {
  title: string;
  detail?: string;
  paragraphIds: string[];
  badges?: { label: string; tone?: 'neutral' | 'warn' }[];
}) {
  return (
    <div className='rounded-lg border border-border bg-background p-3'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <p className='text-sm font-medium'>{title}</p>
        {badges && badges.length > 0 && (
          <span className='flex flex-wrap gap-1'>
            {badges.map((badge) => (
              <Badge key={badge.label} tone={badge.tone}>
                {badge.label}
              </Badge>
            ))}
          </span>
        )}
      </div>
      {detail && <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>}
      {paragraphIds.length > 0 && (
        <p className='mt-2 wrap-anywhere font-mono text-[11px] text-primary'>
          {paragraphIds.slice(0, 8).join(', ')}
          {paragraphIds.length > 8 ? ` +${paragraphIds.length - 8}` : ''}
        </p>
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warn';
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-500/50 text-amber-600'
      : 'border-border text-muted-foreground';
  return (
    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] capitalize ${toneClass}`}>
      {children}
    </span>
  );
}

export function StatGrid({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
      {stats.map((stat) => (
        <div key={stat.label} className='rounded-lg border border-border bg-background p-3'>
          <dt className='text-[11px] uppercase tracking-wider text-muted-foreground'>
            {stat.label}
          </dt>
          <dd className='mt-1 text-sm font-semibold'>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className='rounded-xl border border-border bg-card p-6'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      {description && <p className='mt-1 text-xs text-muted-foreground'>{description}</p>}
      <div className='mt-3'>{children}</div>
    </div>
  );
}
