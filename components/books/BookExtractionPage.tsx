'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardFrame } from '@/components/dashboard/DashboardFrame';
import { getBook, type Book } from '@/lib/books';
import { bookNavItems } from '@/lib/navigation';
import { BookExtraction } from './BookExtraction';

export function BookExtractionPage({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBook(bookId)
      .then((b) => {
        if (cancelled) return;
        if (!b) {
          setError('This book no longer exists.');
          setLoading(false);
          return;
        }
        setBook(b);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load book.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (loading) {
    return (
      <DashboardFrame
        companyName='Bookward'
        displayName='Partner'
        roleLabel='Administrator'
        navItems={bookNavItems(bookId)}
      >
        <div className='dashboard-skeleton space-y-4'>
          <div className='h-8 w-48 animate-pulse rounded-lg bg-muted' />
          <div className='h-40 animate-pulse rounded-xl border border-border bg-card' />
        </div>
      </DashboardFrame>
    );
  }

  if (error || !book) {
    return (
      <DashboardFrame
        companyName='Bookward'
        displayName='Partner'
        roleLabel='Administrator'
        navItems={bookNavItems(bookId)}
      >
        <Link href='/' className='inline-flex items-center gap-2 text-sm text-primary hover:underline'>
          <ArrowLeft className='h-4 w-4' aria-hidden='true' />
          Back to library
        </Link>
        <div className='mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm'>
          <p className='font-medium'>Couldn&apos;t open extraction for this book.</p>
          <p className='mt-1 text-muted-foreground'>{error ?? 'Book not found.'}</p>
        </div>
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
      companyName={book.title}
      displayName={book.author}
      roleLabel='Extraction'
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

        <BookExtraction book={book} />
      </section>
    </DashboardFrame>
  );
}
