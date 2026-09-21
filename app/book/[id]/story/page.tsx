import type { Metadata } from 'next';
import { StoryPage } from '@/components/books/StoryPage';

export const metadata: Metadata = {
  title: 'Story — Bookward',
  description: 'Story Map, Episodes and Story Moments planned from the Book Model.',
};

export default async function StoryRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryPage bookId={id} />;
}
