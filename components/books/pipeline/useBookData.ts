'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBook, type Book } from '@/lib/books';
import { loadBookModel } from '@/lib/book-pipeline';

/**
 * Loads a book, its entity names and one stage's data. `refresh` reloads the
 * book and stage data (not the names), for use as results land during a job.
 */
export function useBookData<T>(bookId: string, load: (book: Book) => Promise<T>) {
  const [book, setBook] = useState<Book | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const loadedBook = await getBook(bookId);
    if (!loadedBook) throw new Error('This book no longer exists.');
    return { loadedBook, loadedData: await load(loadedBook) };
  }, [bookId, load]);

  const refresh = useCallback(() => {
    fetchAll()
      .then(({ loadedBook, loadedData }) => {
        setBook(loadedBook);
        setData(loadedData);
      })
      .catch(() => undefined);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAll(), loadBookModel(bookId)])
      .then(([{ loadedBook, loadedData }, model]) => {
        if (cancelled) return;
        setBook(loadedBook);
        setData(loadedData);
        setNames(new Map(model.entities.map((entity) => [entity.entityId, entity.canonicalName])));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load this page.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, fetchAll]);

  const nameOf = useMemo(() => (entityId: string) => names.get(entityId) ?? entityId, [names]);
  return { book, data, loading, error, refresh, nameOf };
}
