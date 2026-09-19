'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { getPdfDownloadUrl, type Book } from '@/lib/books';
import {
  countWords,
  downloadTextFile,
  extractPdfFullText,
  fetchPdfAsArrayBuffer,
  type ExtractionProgress,
  type ExtractionResult,
} from '@/lib/pdf-extract';

type Phase = 'idle' | 'downloading' | 'extracting' | 'done' | 'error';
type ViewMode = 'full' | 'pages';

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function BookExtraction({ book }: { book: Book }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('full');
  const [pageIndex, setPageIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!book.storagePath) return;
    let cancelled = false;
    getPdfDownloadUrl(book.storagePath)
      .then((url) => {
        if (!cancelled) setPdfUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setUrlError(err instanceof Error ? err.message : 'Could not resolve the PDF file.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [book.storagePath]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startExtraction = async () => {
    if (!pdfUrl || phase === 'downloading' || phase === 'extracting') return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setResult(null);
    setProgress(null);
    setPageIndex(0);
    setQuery('');
    setCopied(false);
    try {
      setPhase('downloading');
      const data = await fetchPdfAsArrayBuffer(pdfUrl, controller.signal);
      setPhase('extracting');
      const extraction = await extractPdfFullText(data, {
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setResult(extraction);
      setView(extraction.totalChars > 500_000 ? 'pages' : 'full');
      setPhase('done');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPhase('idle');
        setProgress(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Extraction failed.');
      setPhase('error');
    }
  };

  const cancelExtraction = () => {
    abortRef.current?.abort();
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.fullText);
    } catch {
      const area = document.createElement('textarea');
      area.value = result.fullText;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const matches = useMemo(() => {
    if (!result || query.trim().length < 2) return null;
    const q = query.toLowerCase();
    const hits: { pageNumber: number; count: number }[] = [];
    for (const page of result.pages) {
      const text = page.text.toLowerCase();
      let count = 0;
      let at = text.indexOf(q);
      while (at !== -1) {
        count += 1;
        if (count > 999) break;
        at = text.indexOf(q, at + q.length);
      }
      if (count > 0) hits.push({ pageNumber: page.pageNumber, count });
    }
    return hits;
  }, [result, query]);

  const activePage = result?.pages[pageIndex] ?? null;
  const busy = phase === 'downloading' || phase === 'extracting';

  if (!book.storagePath) {
    return (
      <div className='rounded-lg border border-border bg-card p-6 text-card-foreground'>
        <p className='text-sm text-muted-foreground'>This book has no PDF attached yet.</p>
      </div>
    );
  }

  if (urlError) {
    return (
      <div className='rounded-lg border border-border bg-card p-6 text-card-foreground'>
        <p className='text-sm text-muted-foreground'>{urlError}</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-600 text-white shadow'>
              <FileText aria-hidden='true' className='h-5 w-5' />
            </div>
            <div>
              <h3 className='text-lg font-semibold tracking-tight'>Full-text extraction</h3>
              <p className='mt-1 max-w-2xl text-sm text-muted-foreground'>
                Reads every page in order — native PDF text first, automatic on-device
                OCR for pages without embedded text. No page or character limits.
                Nothing is saved; results stay in your browser until you download them.
              </p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {busy ? (
              <button
                type='button'
                onClick={cancelExtraction}
                className='inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent'
              >
                <X className='h-4 w-4' aria-hidden='true' />
                Cancel
              </button>
            ) : (
              <button
                type='button'
                onClick={startExtraction}
                disabled={!pdfUrl}
                className='inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50'
              >
                {result ? 'Extract again' : 'Extract full text'}
              </button>
            )}
          </div>
        </div>

        {phase === 'idle' && !result && (
          <p className='mt-4 text-sm text-muted-foreground'>
            {pdfUrl ? 'Ready — the PDF link resolved.' : 'Resolving the PDF file…'}
          </p>
        )}

        {phase === 'downloading' && (
          <div className='mt-4 flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
            Downloading PDF…
          </div>
        )}

        {phase === 'extracting' && progress && (
          <div className='mt-4 space-y-1'>
            <div className='h-2 overflow-hidden rounded-full bg-muted'>
              <div
                className='h-full rounded-full bg-primary transition-all'
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className='text-xs text-muted-foreground'>
              {progress.stage === 'ocr' && !progress.ocrNote
                ? `OCR-ing page ${formatCount(progress.currentPage)} of ${formatCount(progress.totalPages)} — ${progress.percent}% (scanned pages read slower)`
                : `Page ${formatCount(progress.currentPage)} of ${formatCount(progress.totalPages)} — ${progress.percent}%`}
            </p>
            {progress.stage === 'ocr' && progress.ocrNote && (
              <p className='text-xs text-muted-foreground'>{progress.ocrNote}</p>
            )}
          </div>
        )}

        {phase === 'error' && error && (
          <div className='mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm'>
            <p className='font-medium'>Extraction failed.</p>
            <p className='mt-1 text-muted-foreground'>{error}</p>
          </div>
        )}
      </div>

      {result && phase === 'done' && (
        <>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
            {[
              { label: 'Pages extracted', value: formatCount(result.totalPages) },
              { label: 'Characters', value: formatCount(result.totalChars) },
              { label: 'Words', value: formatCount(result.totalWords) },
              {
                label: 'Pages via OCR',
                value: formatCount(result.ocrPages),
              },
              {
                label: 'Pages without text',
                value: formatCount(result.emptyPages),
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className='rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm'
              >
                <p className='text-2xl font-semibold tracking-tight'>{stat.value}</p>
                <p className='mt-1 text-xs text-muted-foreground'>{stat.label}</p>
              </div>
            ))}
          </div>

          {result.emptyPages > 0 && (
            <div className='flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-600' aria-hidden='true' />
              <div>
                <p className='font-medium'>
                  {result.ocrPages > 0
                    ? `${formatCount(result.emptyPages)} ${result.emptyPages === 1 ? 'page remains' : 'pages remain'} without text after OCR.`
                    : result.emptyPages === result.totalPages
                      ? 'No embedded text found — this looks like a scanned PDF.'
                      : `${formatCount(result.emptyPages)} of ${formatCount(result.totalPages)} pages contain no embedded text.`}
                </p>
                <p className='mt-1 text-muted-foreground'>
                  {result.ocrPages > 0
                    ? `On-device OCR already recovered ${formatCount(result.ocrPages)} ${result.ocrPages === 1 ? 'page' : 'pages'}. The remaining ${result.emptyPages === 1 ? 'page is' : 'pages are'} likely blank or unreadable — verify against the book.`
                    : result.emptyPages === result.totalPages
                      ? 'Every page is images-only, so there is no text to extract. Those pages need OCR (optical character recognition) before their text can be recovered.'
                      : 'Those pages are likely scanned images or blank. Their numbers are listed so you can verify against the book, and OCR would be needed to recover them.'}
                </p>
                {result.emptyPageNumbers.length > 0 && result.emptyPages < result.totalPages && (
                  <p className='mt-2 text-xs text-muted-foreground'>
                    Empty pages: {result.emptyPageNumbers.slice(0, 40).join(', ')}
                    {result.emptyPageNumbers.length > 40 &&
                      ` …and ${formatCount(result.emptyPageNumbers.length - 40)} more`}
                  </p>
                )}
              </div>
            </div>
          )}

          {result.emptyPages === 0 && result.ocrPages > 0 && (
            <div className='rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground'>
              {formatCount(result.ocrPages)} of {formatCount(result.totalPages)} pages were
              read from images with on-device OCR (marked OCR in Per page view). OCR text
              can misread characters — proofread those pages before trusting them.
            </div>
          )}

          <div className='rounded-xl border border-border bg-card text-card-foreground shadow-sm'>
            <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border p-4'>
              <div
                role='tablist'
                aria-label='Extraction view'
                className='inline-flex rounded-lg border border-border p-1 text-sm'
              >
                {(
                  [
                    { key: 'full', label: 'Full text' },
                    { key: 'pages', label: 'Per page' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type='button'
                    role='tab'
                    aria-selected={view === tab.key}
                    onClick={() => setView(tab.key)}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      view === tab.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={handleCopy}
                  className='inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent'
                >
                  {copied ? (
                    <Check className='h-4 w-4 text-green-600' aria-hidden='true' />
                  ) : (
                    <Copy className='h-4 w-4' aria-hidden='true' />
                  )}
                  {copied ? 'Copied' : 'Copy all'}
                </button>
                <button
                  type='button'
                  onClick={() => downloadTextFile(result.fullText, book.title)}
                  className='inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent'
                >
                  <Download className='h-4 w-4' aria-hidden='true' />
                  Download .txt
                </button>
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-3 border-b border-border p-4'>
              <div className='relative min-w-0 flex-1 sm:max-w-sm'>
                <Search
                  aria-hidden='true'
                  className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground'
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Search extracted text (min 2 chars)…'
                  aria-label='Search extracted text'
                  className='w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring'
                />
              </div>
              {matches && (
                <p className='text-xs text-muted-foreground' aria-live='polite'>
                  {matches.length === 0
                    ? 'No matches.'
                    : `Found on ${matches.length} ${matches.length === 1 ? 'page' : 'pages'} (${formatCount(matches.reduce((sum, m) => sum + Math.min(m.count, 1000), 0))} matches). Click a page to jump to it.`}
                </p>
              )}
            </div>

            {matches && matches.length > 0 && (
              <div className='flex flex-wrap gap-1.5 border-b border-border p-4'>
                {matches.slice(0, 60).map((hit) => (
                  <button
                    key={hit.pageNumber}
                    type='button'
                    onClick={() => {
                      setView('pages');
                      setPageIndex(hit.pageNumber - 1);
                    }}
                    title={`${hit.count} matches on page ${hit.pageNumber}`}
                    className='rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  >
                    p.{hit.pageNumber} ×{hit.count > 999 ? '999+' : hit.count}
                  </button>
                ))}
                {matches.length > 60 && (
                  <span className='px-2 py-0.5 text-xs text-muted-foreground'>
                    …and {matches.length - 60} more pages
                  </span>
                )}
              </div>
            )}

            {view === 'full' ? (
              <div className='p-4'>
                <pre className='max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed'>
                  {result.fullText}
                </pre>
              </div>
            ) : (
              <div className='space-y-3 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <button
                    type='button'
                    onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                    disabled={pageIndex === 0}
                    className='inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-40'
                  >
                    <ChevronLeft className='h-4 w-4' aria-hidden='true' />
                    Prev
                  </button>
                  <label className='flex items-center gap-2 text-sm text-muted-foreground'>
                    Page
                    <select
                      value={pageIndex}
                      onChange={(e) => setPageIndex(Number(e.target.value))}
                      aria-label='Select page'
                      className='rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring'
                    >
                      {result.pages.map((page, index) => (
                        <option key={page.pageNumber} value={index}>
                          {page.pageNumber} of {result.totalPages}
                          {page.isEmpty
                            ? ' (no text)'
                            : page.method === 'ocr'
                              ? ` (OCR${page.confidence != null ? ` · ${page.confidence}%` : ''})`
                              : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type='button'
                    onClick={() =>
                      setPageIndex((i) => Math.min(result.pages.length - 1, i + 1))
                    }
                    disabled={pageIndex >= result.pages.length - 1}
                    className='inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-40'
                  >
                    Next
                    <ChevronRight className='h-4 w-4' aria-hidden='true' />
                  </button>
                </div>
                <pre className='max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed'>
                  {activePage?.text || '(This page contains no extractable text.)'}
                </pre>
                <p className='text-xs text-muted-foreground'>
                  Page {activePage?.pageNumber} — {formatCount(activePage?.charCount ?? 0)}{' '}
                  characters, {formatCount(countWords(activePage?.text ?? ''))} words.
                  {activePage && !activePage.isEmpty && (
                    <>
                      {' '}·{' '}
                      {activePage.method === 'ocr'
                        ? `OCR${activePage.confidence != null ? ` (confidence ${activePage.confidence}%)` : ''}`
                        : 'Native text'}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
