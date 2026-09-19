import type { Metadata } from 'next';
import { BookDashboard } from '@/components/books/BookDashboard';

export const metadata: Metadata = {
  title: 'Book dashboard — Bookward',
  description: 'Book dashboard.',
};

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookDashboard bookId={id} />;
}
