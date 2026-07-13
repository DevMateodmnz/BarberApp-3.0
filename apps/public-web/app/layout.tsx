import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BarberUp Public Booking',
  description: 'Reserva tu turno de forma rápida y segura.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
