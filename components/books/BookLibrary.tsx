'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Search } from 'lucide-react';
import { subscribeBooks, type Book } from '@/lib/books';
import { isFirebaseConfigured } from '@/lib/firebase';
import { BookUploadDialog } from './BookUploadDialog';

export function BookLibrary() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(
    isFirebaseConfigured ? null : 'Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* in .env.'
  );
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }
    const unsub = subscribeBooks(
      (next) => {
        setBooks(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load books.');
      }
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.genres.some((g) => g.toLowerCase().includes(q))
    );
  }, [books, search]);

  return (
    <section className='space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            Library
          </p>
          <h2 className='mt-2 text-2xl font-semibold tracking-tight'>Your Books</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            {books.length} {books.length === 1 ? 'book' : 'books'} in Firebase.
            Select one to open its dashboard.
          </p>
        </div>
        <button
          type='button'
          onClick={() => setUploadOpen(true)}
          className='inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90'
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Upload book
        </button>
      </div>

      <div className='relative max-w-md'>
        <Search
          aria-hidden='true'
          className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground'
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search by title, author, or genre…'
          aria-label='Search books'
          className='w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring'
        />
      </div>

      {loading && (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[0, 1, 2].map((i) => (
            <div key={i} className='h-44 animate-pulse rounded-xl border border-border bg-card' />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className='rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm'>
          <p className='font-medium'>Couldn&apos;t load books.</p>
          <p className='mt-1 text-muted-foreground'>{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className='rounded-xl border border-dashed border-border bg-card p-10 text-center'>
          <BookOpen aria-hidden='true' className='mx-auto h-8 w-8 text-muted-foreground' />
          <p className='mt-3 font-medium'>
            {books.length === 0 ? 'No books yet' : 'No matches'}
          </p>
          <p className='mt-1 text-sm text-muted-foreground'>
            {books.length === 0
              ? 'Upload your first PDF to get started.'
              : 'Try a different search term.'}
          </p>
          {books.length === 0 && (
            <button
              type='button'
              onClick={() => setUploadOpen(true)}
              className='mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90'
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              Upload book
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {filtered.map((book) => (
            <li key={book.id}>
              <Link
                href={`/book/${book.id}`}
                className='group flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring'
              >
                <div className='flex items-start gap-3'>
                  {book.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={book.coverPhotoUrl}
                      alt={`Cover of ${book.title}`}
                      className='h-11 w-11 shrink-0 rounded-lg object-cover shadow'
                    />
                  ) : (
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-600 text-white shadow'>
                      <BookOpen aria-hidden='true' className='h-5 w-5' />
                    </div>
                  )}
                  <div className='min-w-0'>
                    <p className='truncate font-semibold group-hover:text-primary'>
                      {book.title}
                    </p>
                    <p className='truncate text-sm text-muted-foreground'>
                      by {book.author}
                    </p>
                  </div>
                </div>
                {book.description && (
                  <p className='mt-3 line-clamp-2 text-sm text-muted-foreground'>
                    {book.description}
                  </p>
                )}
                {book.genres.length > 0 && (
                  <div className='mt-3 flex flex-wrap gap-1.5'>
                    {book.genres.slice(0, 4).map((genre) => (
                      <span
                        key={genre}
                        className='rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground'
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
                <span className='mt-4 text-sm font-medium text-primary'>
                  Open dashboard →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BookUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </section>
  );
}
