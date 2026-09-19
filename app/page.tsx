import type { Metadata } from 'next';
import { DashboardFrame } from '@/components/dashboard/DashboardFrame';
import { BookLibrary } from '@/components/books/BookLibrary';

export const metadata: Metadata = {
  title: 'Library — Bookward',
  description: 'Browse uploaded books. Select one to open its dashboard.',
};

export default function Home() {
  return (
    <DashboardFrame companyName='Bookward' displayName='Partner' roleLabel='Administrator' showSidebar={false}>
      <div className='mx-auto w-full max-w-6xl'>
        <BookLibrary />
      </div>
    </DashboardFrame>
  );
}
