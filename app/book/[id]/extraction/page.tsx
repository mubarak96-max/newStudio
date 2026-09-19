import type { Metadata } from 'next';
import { BookExtractionPage } from '@/components/books/BookExtractionPage';

export const metadata: Metadata = {
  title: 'Extraction — Bookward',
  description: 'Extract the full text of this book: native text first, OCR fallback for scanned pages.',
};

export default async function BookExtractionRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookExtractionPage bookId={id} />;
}
