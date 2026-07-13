import React from 'react';

interface BookingPageNoticeProps {
  title: string;
  message: string;
}

export function BookingPageNotice({
  title,
  message,
}: BookingPageNoticeProps) {
  return (
    <section
      aria-labelledby="booking-page-notice-title"
      style={{
        padding: '1.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
      }}
    >
      <h2 id="booking-page-notice-title" style={{ marginTop: 0 }}>
        {title}
      </h2>
      <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>{message}</p>
    </section>
  );
}
