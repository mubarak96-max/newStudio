import type { Metadata } from 'next';
import { VisualsPage } from '@/components/books/VisualsPage';

export const metadata: Metadata = {
  title: 'Visuals — Bookward',
  description: 'Visual profile, continuity bible and composition plans with reuse and cost forecast.',
};

export default async function VisualsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisualsPage bookId={id} />;
}
