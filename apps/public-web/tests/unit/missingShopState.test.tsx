import React from 'react';
import { render, screen } from '@testing-library/react';
import { MissingShopState } from '@/components/MissingShopState';

describe('MissingShopState', () => {
  it('renders a safe missing-shop message', () => {
    render(<MissingShopState />);

    expect(
      screen.getByRole('heading', {
        name: /esta barbería no está disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/verificá el enlace o contactá a la barbería/i)
    ).toBeInTheDocument();
  });
});
