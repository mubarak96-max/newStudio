import type { Metadata } from 'next';
import { PreviewPage } from '@/components/books/PreviewPage';

export const metadata: Metadata = {
  title: 'Preview — Bookward',
  description: 'Assemble and play an episode in 2.5D on a phone-sized frame.',
};

export default async function PreviewRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PreviewPage bookId={id} />;
}
