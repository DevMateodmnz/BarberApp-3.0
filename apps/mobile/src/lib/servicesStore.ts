/**
 * Services store — Zustand store for barbershop service catalog.
 *
 * OWNER-only: loads all active services for the current barbershop.
 * BARBER and CLIENT are no-ops.
 */
import { create } from 'zustand';
import { fetchBarbershopServices, createBarbershopService } from './services.js';
import type { CreateServiceInput, Service } from './types.js';

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

  /**
   * Creates a new service and prepends it to the local list.
   * Returns the created Service on success. Throws on failure.
   */
  createService: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    input: CreateServiceInput,
  ) => Promise<Service>;

  clearServices: () => void;
}

export const useServicesStore = create<ServicesState>((set, get) => ({
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

  createService: async (getToken, barbershopId, input) => {
    const service = await createBarbershopService(getToken, barbershopId, input);
    set({ services: [service, ...get().services] });
    return service;
  },

  clearServices: () => {
    set({ services: [], isServicesLoading: false, servicesError: null });
  },
}));
