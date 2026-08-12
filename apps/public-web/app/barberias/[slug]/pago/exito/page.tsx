import { PublicBookingConfirmationView } from '@/components/PublicBookingConfirmation';

interface PaymentPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}

export default async function PaymentStatePage({ params, searchParams }: PaymentPageProps) {
  const { slug } = await params;
  const { ref } = await searchParams;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '1rem',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <PublicBookingConfirmationView slug={slug} referenceFromQuery={ref} />
    </main>
  );
}
