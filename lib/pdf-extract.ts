'use client';

/**
 * Lossless client-side PDF text extraction (pdf.js).
 *
 * Design goal: every recoverable text character from every page ends up in
 * the result. Nothing is capped, sampled, or reordered:
 * - pages are processed sequentially from 1 to numPages (no page cap),
 * - text items stay in pdf.js content order (no layout re-sorting),
 * - separators are only ever *added* between spans (never dropped chars),
 * - page breaks are preserved as form-feed characters in the full text.
 */

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  charCount: number;
  itemCount: number;
  isEmpty: boolean;
};

export type ExtractionProgress = {
  currentPage: number;
  totalPages: number;
  percent: number;
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
  emptyPages: number;
  emptyPageNumbers: number[];
};

export type ExtractOptions = {
  onProgress?: (progress: ExtractionProgress) => void;
  signal?: AbortSignal;
  /** Yield to the event loop every N pages so progress paints on huge books. */
  yieldEveryPages?: number;
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
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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

export async function extractPdfFullText(
  data: ArrayBuffer | Uint8Array,
  options: ExtractOptions = {}
): Promise<ExtractionResult> {
  const { onProgress, signal, yieldEveryPages = 10 } = options;
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
  try {
    const totalPages = pdf.numPages;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const items = content.items.filter(isTextItem);
        const text = joinTextItems(items);
        pages.push({
          pageNumber,
          text,
          charCount: text.length,
          itemCount: items.length,
          isEmpty: text.length === 0,
        });
      } finally {
        page.cleanup();
      }

      onProgress?.({
        currentPage: pageNumber,
        totalPages,
        percent: Math.round((pageNumber / totalPages) * 100),
      });

      if (pageNumber % yieldEveryPages === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const { fullText, pageOffsets } = buildFullText(pages);
    const emptyPageNumbers = pages.filter((p) => p.isEmpty).map((p) => p.pageNumber);

    return {
      pages,
      fullText,
      pageOffsets,
      totalPages,
      totalChars: fullText.length,
      totalWords: countWords(fullText),
      emptyPages: emptyPageNumbers.length,
      emptyPageNumbers,
    };
  } finally {
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
