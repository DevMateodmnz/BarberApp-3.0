import { BookingPageNotice } from '@/components/BookingPageNotice';
import { MissingShopState } from '@/components/MissingShopState';
import { PublicBookingFlow } from '@/components/PublicBookingFlow';
import {
  PublicApiError,
  getPublicServices,
  getPublicShop,
} from '@/lib/api/server';

interface PublicBookingPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function PublicBookingPage({
  params,
}: PublicBookingPageProps) {
  const { slug } = await params;

  try {
    const [shop, services] = await Promise.all([
      getPublicShop(slug),
      getPublicServices(slug),
    ]);

    return <PublicBookingFlow shop={shop} services={services} />;
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      return (
        <main
          style={{
            minHeight: '100vh',
            padding: '1rem',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: '32rem' }}>
            <MissingShopState />
          </div>
        </main>
      );
    }

    return (
      <main
        style={{
          minHeight: '100vh',
          padding: '1rem',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: '32rem' }}>
          <BookingPageNotice
            title="No pudimos cargar la agenda"
            message="Intentá de nuevo en unos minutos o pedile a la barbería un nuevo enlace."
          />
        </div>
      </main>
    );
  }
}
