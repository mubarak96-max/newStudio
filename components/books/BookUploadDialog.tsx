'use client';

import { useState, type FormEvent } from 'react';
import { parseGenres, uploadBook } from '@/lib/books';

type BookUploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
};

export function BookUploadDialog({ open, onClose, onUploaded }: BookUploadDialogProps) {
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [genresRaw, setGenresRaw] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setName('');
    setAuthor('');
    setGenresRaw('');
    setFile(null);
    setProgress(0);
    setUploading(false);
    setError(null);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Choose a PDF file to upload.');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      await uploadBook(
        { name, author, genres: parseGenres(genresRaw), file },
        (pct) => setProgress(pct)
      );
      reset();
      onClose();
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setUploading(false);
    }
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Upload a book'
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
    >
      <div aria-hidden='true' onClick={handleClose} className='absolute inset-0 bg-black/60 backdrop-blur-sm' />
      <form
        onSubmit={handleSubmit}
        className='relative w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl'
      >
        <div>
          <h2 className='text-lg font-semibold'>Upload a book</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            The PDF is stored in Firebase Storage; metadata lives in Firestore.
          </p>
        </div>

        <label className='block space-y-1.5'>
          <span className='text-sm font-medium'>Book name *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder='e.g. The Silent Sea'
            className='w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
          />
        </label>

        <label className='block space-y-1.5'>
          <span className='text-sm font-medium'>Author *</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
            maxLength={200}
            placeholder='e.g. Jane Doe'
            className='w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
          />
        </label>

        <label className='block space-y-1.5'>
          <span className='text-sm font-medium'>Genres</span>
          <input
            value={genresRaw}
            onChange={(e) => setGenresRaw(e.target.value)}
            maxLength={300}
            placeholder='Fantasy, Adventure, Sci-Fi (comma separated)'
            className='w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
          />
        </label>

        <label className='block space-y-1.5'>
          <span className='text-sm font-medium'>PDF file *</span>
          <input
            type='file'
            accept='application/pdf,.pdf'
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            className='w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground'
          />
          {file && (
            <span className='block text-xs text-muted-foreground'>
              {(file.size / 1024 / 1024).toFixed(2)} MB — {file.name}
            </span>
          )}
        </label>

        {uploading && (
          <div className='space-y-1'>
            <div className='h-2 overflow-hidden rounded-full bg-muted'>
              <div
                className='h-full rounded-full bg-primary transition-all'
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className='text-xs text-muted-foreground'>Uploading… {progress}%</p>
          </div>
        )}

        {error && <p className='text-sm text-destructive'>{error}</p>}

        <div className='flex justify-end gap-2 pt-2'>
          <button
            type='button'
            onClick={handleClose}
            disabled={uploading}
            className='rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50'
          >
            Cancel
          </button>
          <button
            type='submit'
            disabled={uploading}
            className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50'
          >
            {uploading ? 'Uploading…' : 'Upload book'}
          </button>
        </div>
      </form>
    </div>
  );
}
