/**
 * Services store — Zustand store for barbershop service catalog.
 *
 * OWNER-only: loads, creates, and updates barbershop services.
 * BARBER and CLIENT are no-ops.
 */
import { create } from 'zustand';
import {
  fetchBarbershopServices,
  createBarbershopService,
  updateBarbershopService,
} from './services.js';
import type { CreateServiceInput, Service, UpdateServiceInput } from './types.js';

interface ServicesState {
  services: Service[];
  isServicesLoading: boolean;
  servicesError: string | null;

  loadServices: (
    getToken: () => Promise<string | null>,
    barbershopId: string | null,
  ) => Promise<void>;

  createService: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    input: CreateServiceInput,
  ) => Promise<Service>;

  /**
   * Updates an existing service and replaces it in the local list.
   * Returns the updated Service on success. Throws on failure.
   */
  updateService: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    serviceId: string,
    input: UpdateServiceInput,
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

  updateService: async (getToken, barbershopId, serviceId, input) => {
    const updated = await updateBarbershopService(getToken, barbershopId, serviceId, input);
    set({
      services: get().services.map((s) => (s.id === serviceId ? updated : s)),
    });
    return updated;
  },

  clearServices: () => {
    set({ services: [], isServicesLoading: false, servicesError: null });
  },
}));
