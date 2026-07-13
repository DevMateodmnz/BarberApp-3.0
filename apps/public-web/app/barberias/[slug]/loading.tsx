export default function PublicBookingLoadingPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '1rem',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <section
        aria-busy="true"
        aria-live="polite"
        style={{
          width: '100%',
          maxWidth: '48rem',
          padding: '1.5rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '1.5rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
          Cargando disponibilidad…
        </p>
        <div
          style={{
            height: '1.75rem',
            width: '50%',
            borderRadius: '999px',
            background: 'var(--surface-muted)',
            marginBottom: '1rem',
          }}
        />
        <div
          style={{
            height: '6rem',
            borderRadius: '1rem',
            background: 'var(--surface-muted)',
          }}
        />
      </section>
    </main>
  );
}
