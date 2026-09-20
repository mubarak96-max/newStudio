import type { Metadata } from 'next';
import { BookModelPage } from '@/components/books/BookModelPage';

export const metadata: Metadata = {
  title: 'Book Model — Bookward',
  description: 'Review source-grounded entities, states, relationships, and events.',
};

export default async function BookModelRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookModelPage bookId={id} />;
}
