'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import { DashboardFrame } from '@/components/dashboard/DashboardFrame';
import { getBook, getPdfDownloadUrl, type Book } from '@/lib/books';
import { bookNavItems } from '@/lib/navigation';

export function BookDashboard({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
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
        if (b.storagePath) {
          getPdfDownloadUrl(b.storagePath)
            .then((url) => {
              if (!cancelled) setPdfUrl(url);
            })
            .catch(() => {
              // PDF link stays hidden; dashboard still renders.
            });
        }
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
          <p className='font-medium'>Couldn&apos;t open this book.</p>
          <p className='mt-1 text-muted-foreground'>{error ?? 'Book not found.'}</p>
        </div>
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
      companyName={book.title}
      displayName={book.author}
      roleLabel='Book dashboard'
      navItems={bookNavItems(bookId)}
    >
      <section className='space-y-6'>
        <Link
          href='/'
          className='inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='h-4 w-4' aria-hidden='true' />
          Back to library
        </Link>

        <div className='rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='flex items-start gap-4'>
              {book.coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={book.coverPhotoUrl}
                  alt={`Cover of ${book.title}`}
                  className='h-16 w-16 shrink-0 rounded-xl object-cover shadow'
                />
              ) : (
                <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shadow'>
                  <BookOpen aria-hidden='true' className='h-6 w-6' />
                </div>
              )}
              <div>
                <h2 className='text-2xl font-semibold tracking-tight'>{book.title}</h2>
                <p className='mt-1 text-sm text-muted-foreground'>by {book.author}</p>
                {book.description && (
                  <p className='mt-2 max-w-2xl text-sm text-muted-foreground'>
                    {book.description}
                  </p>
                )}
                {book.genres.length > 0 && (
                  <div className='mt-2 flex flex-wrap gap-1.5'>
                    {book.genres.map((genre) => (
                      <span
                        key={genre}
                        className='rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground'
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent'
              >
                <ExternalLink className='h-4 w-4' aria-hidden='true' />
                Open PDF
              </a>
            )}
          </div>
        </div>

        <div>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            Dashboard
          </p>
          <h3 className='mt-2 text-xl font-semibold tracking-tight'>Your Shops</h3>
        </div>

        <div className='rounded-lg border border-border bg-card p-6 text-card-foreground'>
          <p className='text-sm text-muted-foreground'>
            Shop content not copied — wire up your data source here.
          </p>
        </div>
      </section>
    </DashboardFrame>
  );
}
