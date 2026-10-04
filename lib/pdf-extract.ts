'use client';

/**
 * Unified client-side PDF text extraction: native text first, OCR fallback.
 *
 * One method handles both PDF kinds. Every page is read with pdf.js first —
 * the exact same path as native-only extraction, so text PDFs never touch
 * OCR code. Only pages whose native text is below `minNativeChars` are
 * rendered to an image and read with on-device OCR (tesseract.js, lazy-loaded
 * on first use). Each page records which method produced its text.
 *
 * Other guarantees: nothing is capped, sampled, or reordered (pages run
 * 1..numPages sequentially, items stay in content order, separators are only
 * ever *added* between spans), and page breaks survive as form feeds.
 */

export type PageMethod = 'native' | 'ocr';

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  charCount: number;
  itemCount: number;
  isEmpty: boolean;
  method: PageMethod;
  /** Mean tesseract confidence (0-100) for OCR pages, otherwise null. */
  confidence: number | null;
  /** True when a weak first read was automatically re-read at a higher resolution. */
  reread?: boolean;
};

export type ExtractionProgress = {
  currentPage: number;
  totalPages: number;
  percent: number;
  stage: 'reading' | 'ocr';
  /** Extra context while stage is 'ocr' (e.g. one-time engine download). */
  ocrNote?: string;
};

export type ExtractionResult = {
  pages: ExtractedPage[];
  /** Complete book text; pages separated by `\n\f\n` (form feed = page break). */
  fullText: string;
  /** Start offset of each page inside fullText, same order as pages. */
  pageOffsets: number[];
  totalPages: number;
  totalChars: number;
  totalWords: number;
  /** Pages with no text after all attempts (blank or unreadable). */
  emptyPages: number;
  emptyPageNumbers: number[];
  ocrPages: number;
  ocrPageNumbers: number[];
  nativePages: number;
};

export type OcrOptions = {
  /** Default true: the unified method. Set false for native-only (old) behavior. */
  enabled?: boolean;
  /** Native text shorter than this (chars, trimmed) triggers OCR. Default 50. */
  minNativeChars?: number;
  /** Render scale for OCR images (2 ≈ 190 dpi). Default 2. */
  scale?: number;
  /** Tesseract language code. Default 'eng'. */
  language?: string;
};

export type ExtractOptions = {
  onProgress?: (progress: ExtractionProgress) => void;
  signal?: AbortSignal;
  /** Yield to the event loop every N pages so progress paints on huge books. */
  yieldEveryPages?: number;
  ocr?: OcrOptions;
};

type RawTextItem = {
  str?: unknown;
  hasEOL?: unknown;
};

function isTextItem<T>(item: T): item is T & RawTextItem {
  return typeof item === 'object' && item !== null && 'str' in item;
}

let workerReady = false;

/** Point pdf.js at the locally vendored worker (public/pdf.worker.min.mjs). */
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerReady && typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerReady = true;
  }
  return pdfjs;
}

/** No space inserted before these (closing punctuation, quotes, dashes). */
const NO_SPACE_BEFORE = /^[.,;:!?%)\]}'’”‐‑‒–—]/;
/** No space inserted after these (openers, currency, hyphen/dash fragments). */
const NO_SPACE_AFTER = /[([{'"‘“"\/$£€¥‐‑‒–—-]\s*$/;

/**
 * Join content-ordered text spans without gluing words together.
 * The main "lost text" bug in naive extraction is `items.join('')` turning
 * `Hello` + `World` into `HelloWorld`. Here a space is inserted at a span
 * boundary only when neither side already provides whitespace and neither
 * side is punctuation that binds to its neighbour — characters are never
 * removed, so worst case is a spacing nuance, never lost text.
 */
export function joinTextItems(items: RawTextItem[]): string {
  let out = '';
  for (const item of items) {
    const str = typeof item.str === 'string' ? item.str : '';
    const hasEOL = item.hasEOL === true;
    if (str.length > 0) {
      if (
        out.length > 0 &&
        !out.endsWith('\n') &&
        !/[\s\u00a0]$/.test(out) &&
        !/^\s/.test(str) &&
        !NO_SPACE_BEFORE.test(str) &&
        !NO_SPACE_AFTER.test(out)
      ) {
        out += ' ';
      }
      out += str;
    }
    if (hasEOL) out += '\n';
  }
  return normalizeTextBlock(out);
}

/** Shared tail normalization for both native and OCR text. */
export function normalizeTextBlock(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

export const PAGE_SEPARATOR = '\n\f\n';

export function buildFullText(pages: ExtractedPage[]): {
  fullText: string;
  pageOffsets: number[];
} {
  let fullText = '';
  const pageOffsets: number[] = [];
  pages.forEach((page, index) => {
    pageOffsets.push(fullText.length);
    fullText += page.text;
    if (index < pages.length - 1) fullText += PAGE_SEPARATOR;
  });
  return { fullText, pageOffsets };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Extraction cancelled.', 'AbortError');
  }
}

const OCR_MIN_NATIVE_CHARS = 50;
const OCR_RENDER_SCALE = 2;
const OCR_LANGUAGE = 'eng';
/** Below this mean confidence a page is read again at a higher resolution. */
const OCR_WEAK_CONFIDENCE = 75;
/** A page this short is also treated as a weak read, whatever its confidence. */
const OCR_WEAK_CHARS = 200;
const OCR_RETRY_SCALE = 3.2;

type OcrEngine = {
  recognize: (
    image: HTMLCanvasElement
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

/**
 * Lazy-load tesseract.js only when the first OCR-needy page appears, so
 * text PDFs never download or execute OCR code.
 */
async function loadOcrEngine(language: string): Promise<OcrEngine> {
  const { createWorker } = await import('tesseract.js');
  return (await createWorker(language)) as unknown as OcrEngine;
}

type OcrRead = { text: string; confidence: number | null };

type RenderablePage = {
  getViewport: (parameters: { scale: number }) => { width: number; height: number };
  render: (parameters: { canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<unknown> };
};

/** Renders one page at `scale` and reads it with the OCR engine. */
async function readPageWithOcr(
  page: RenderablePage,
  engine: OcrEngine,
  scale: number,
  signal?: AbortSignal
): Promise<OcrRead> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  if (!canvas.getContext('2d')) throw new Error('Canvas 2D is unavailable in this browser.');
  await page.render({ canvas, viewport }).promise;
  const { data } = await engine.recognize(canvas);
  canvas.width = 0;
  canvas.height = 0;
  throwIfAborted(signal);
  return {
    text: normalizeTextBlock(data.text ?? ''),
    confidence: typeof data.confidence === 'number' ? Math.round(data.confidence) : null,
  };
}

function isWeakRead(read: OcrRead): boolean {
  return (read.confidence ?? 0) < OCR_WEAK_CONFIDENCE || read.text.length < OCR_WEAK_CHARS;
}

/**
 * Picks between a first read and its higher-resolution retry. A clearly longer
 * read wins on length — the retry usually recovers lines the first pass missed
 * — and otherwise the more confident read wins.
 */
function betterRead(first: OcrRead, retry: OcrRead): OcrRead {
  if (retry.text.length > first.text.length * 1.2) return retry;
  if (first.text.length > retry.text.length * 1.2) return first;
  return (retry.confidence ?? 0) > (first.confidence ?? 0) ? retry : first;
}

function reportProgress(
  onProgress: ExtractOptions['onProgress'],
  currentPage: number,
  totalPages: number,
  stage: ExtractionProgress['stage'],
  ocrNote?: string
): void {
  onProgress?.({
    currentPage,
    totalPages,
    percent: Math.round((currentPage / totalPages) * 100),
    stage,
    ocrNote,
  });
}

export async function extractPdfFullText(
  data: ArrayBuffer | Uint8Array,
  options: ExtractOptions = {}
): Promise<ExtractionResult> {
  const { onProgress, signal, yieldEveryPages = 10, ocr } = options;
  const ocrEnabled = ocr?.enabled !== false;
  const minNativeChars = ocr?.minNativeChars ?? OCR_MIN_NATIVE_CHARS;
  const ocrScale = ocr?.scale ?? OCR_RENDER_SCALE;
  const ocrLanguage = ocr?.language ?? OCR_LANGUAGE;
  const pdfjs = await loadPdfJs();
  throwIfAborted(signal);

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  });

  const pdf = await loadingTask.promise;
  let ocrEngine: OcrEngine | null = null;
  try {
    const totalPages = pdf.numPages;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const items = content.items.filter(isTextItem);
        let text = joinTextItems(items);
        let method: PageMethod = 'native';
        let confidence: number | null = null;
        let reread = false;

        // Fallback: pages with almost no native text are image-only (scanned)
        // and need OCR. The longer text wins, so a good native layer is never
        // replaced by worse OCR output.
        if (
          ocrEnabled &&
          text.trim().length < minNativeChars &&
          typeof document !== 'undefined'
        ) {
          if (!ocrEngine) {
            reportProgress(
              onProgress,
              pageNumber,
              totalPages,
              'ocr',
              'Loading OCR engine (one-time download)…'
            );
            ocrEngine = await loadOcrEngine(ocrLanguage);
            throwIfAborted(signal);
          }
          reportProgress(onProgress, pageNumber, totalPages, 'ocr');
          const renderable = page as unknown as RenderablePage;
          let read = await readPageWithOcr(renderable, ocrEngine, ocrScale, signal);
          // A weak read is re-read once at a higher resolution rather than
          // going to a person; the better of the two is kept.
          if (isWeakRead(read)) {
            reportProgress(onProgress, pageNumber, totalPages, 'ocr', 'Re-reading a weak page at higher resolution…');
            const retry = await readPageWithOcr(renderable, ocrEngine, OCR_RETRY_SCALE, signal);
            const best = betterRead(read, retry);
            reread = best === retry;
            read = best;
          }
          if (read.text.length > text.trim().length) {
            text = read.text;
            method = 'ocr';
            confidence = read.confidence;
          }
        }

        pages.push({
          pageNumber,
          text,
          charCount: text.length,
          itemCount: items.length,
          isEmpty: text.length === 0,
          method,
          confidence,
          reread,
        });
        reportProgress(
          onProgress,
          pageNumber,
          totalPages,
          method === 'ocr' ? 'ocr' : 'reading'
        );
      } finally {
        page.cleanup();
      }

      if (pageNumber % yieldEveryPages === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const { fullText, pageOffsets } = buildFullText(pages);
    const emptyPageNumbers = pages.filter((p) => p.isEmpty).map((p) => p.pageNumber);
    const ocrPageNumbers = pages
      .filter((p) => p.method === 'ocr')
      .map((p) => p.pageNumber);

    return {
      pages,
      fullText,
      pageOffsets,
      totalPages,
      totalChars: fullText.length,
      totalWords: countWords(fullText),
      emptyPages: emptyPageNumbers.length,
      emptyPageNumbers,
      ocrPages: ocrPageNumbers.length,
      ocrPageNumbers,
      nativePages: totalPages - ocrPageNumbers.length,
    };
  } finally {
    if (ocrEngine) {
      await ocrEngine.terminate().catch(() => undefined);
    }
    await loadingTask.destroy();
  }
}

/** Download a book PDF URL into memory for extraction (avoids worker CORS). */
export async function fetchPdfAsArrayBuffer(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) {
    throw new Error(`Could not download the PDF (HTTP ${res.status}).`);
  }
  return res.arrayBuffer();
}

function sanitizeForFileName(name: string): string {
  const cleaned = name.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-');
  return cleaned.slice(0, 80) || 'book';
}

export function downloadTextFile(text: string, baseName: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeForFileName(baseName)}-full-text.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
