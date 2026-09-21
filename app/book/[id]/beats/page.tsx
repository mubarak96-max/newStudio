import type { Metadata } from 'next';
import { BeatsPage } from '@/components/books/BeatsPage';

export const metadata: Metadata = {
  title: 'Beats — Bookward',
  description: 'Reading Beats: subtitles, camera, transitions and paragraph coverage for every Story Moment.',
};

export default async function BeatsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BeatsPage bookId={id} />;
}
