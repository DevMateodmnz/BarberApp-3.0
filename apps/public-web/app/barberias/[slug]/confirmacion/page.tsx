import { PublicBookingConfirmationView } from '@/components/PublicBookingConfirmation';

interface ConfirmationPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function ConfirmationPage({
  params,
}: ConfirmationPageProps) {
  const { slug } = await params;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '1rem',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <PublicBookingConfirmationView slug={slug} />
    </main>
  );
}
