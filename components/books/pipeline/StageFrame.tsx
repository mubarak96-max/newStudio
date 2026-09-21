'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { DashboardFrame } from '@/components/dashboard/DashboardFrame';
import type { Book } from '@/lib/books';
import { bookNavItems } from '@/lib/navigation';

/** Page shell shared by the pipeline stage pages: frame, back link, heading, actions and errors. */
export function StageFrame({
  bookId,
  book,
  loading,
  title,
  icon: Icon,
  subtitle,
  error,
  actions,
  children,
}: {
  bookId: string;
  book: Book | null;
  loading: boolean;
  title: string;
  icon: LucideIcon;
  subtitle: string;
  error: string | null;
  actions: ReactNode;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <DashboardFrame navItems={bookNavItems(bookId)} roleLabel={title}>
        <div className='dashboard-skeleton space-y-4'>
          <div className='h-8 w-48 animate-pulse rounded-lg bg-muted' />
          <div className='h-64 animate-pulse rounded-xl border border-border bg-card' />
        </div>
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
      companyName={book?.title}
      displayName={book?.author}
      roleLabel={title}
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
              <Icon className='h-5 w-5 text-primary' aria-hidden='true' />
              <h2 className='text-2xl font-semibold tracking-tight'>{title}</h2>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>{subtitle}</p>
          </div>
          {actions}
        </div>

        {error && (
          <div className='rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm'>{error}</div>
        )}
        {children}
      </section>
    </DashboardFrame>
  );
}
