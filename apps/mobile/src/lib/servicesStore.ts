/**
 * Services store — Zustand store for barbershop service catalog.
 *
 * OWNER-only: loads all active services for the current barbershop.
 * BARBER and CLIENT are no-ops.
 */
import { create } from 'zustand';
import { fetchBarbershopServices } from './services.js';
import type { Service } from './types.js';

interface ServicesState {
  services: Service[];
  isServicesLoading: boolean;
  servicesError: string | null;

  /**
   * Loads all active services for a barbershop.
   * Only loads when barbershopId is present (OWNER with a shop).
   */
  loadServices: (
    getToken: () => Promise<string | null>,
    barbershopId: string | null,
  ) => Promise<void>;

  clearServices: () => void;
}

export const useServicesStore = create<ServicesState>((set) => ({
  services: [],
  isServicesLoading: false,
  servicesError: null,

  loadServices: async (getToken, barbershopId) => {
    if (!barbershopId) {
      return;
    }

    set({ isServicesLoading: true, servicesError: null });

    try {
      const services = await fetchBarbershopServices(getToken, barbershopId);
      set({ services, isServicesLoading: false, servicesError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ services: [], isServicesLoading: false, servicesError: message });
    }
  },

  clearServices: () => {
    set({ services: [], isServicesLoading: false, servicesError: null });
  },
}));
