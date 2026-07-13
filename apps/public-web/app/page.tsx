export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <section
        style={{
          maxWidth: '36rem',
          padding: '2rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '1.5rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <h1 style={{ marginTop: 0 }}>BarberUp Public Booking</h1>
        <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>
          Abrí una URL del tipo <code>/barberias/&lt;slug&gt;</code> para usar
          la experiencia pública de reservas.
        </p>
      </section>
    </main>
  );
}
