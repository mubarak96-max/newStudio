import type { Metadata } from 'next';
import { ImagesPage } from '@/components/books/ImagesPage';

export const metadata: Metadata = {
  title: 'Images — Bookward',
  description: 'Generate, compare and approve reference sheets and scene layers one at a time.',
};

export default async function ImagesRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImagesPage bookId={id} />;
}
