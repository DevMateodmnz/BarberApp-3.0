import { create } from 'zustand';
import { localizeUnknownError } from '@/i18n/errors.js';

import {
  fetchCustomerDetail,
  fetchCustomers,
  patchCustomer,
  searchCustomers,
} from './customers.js';
import type {
  CustomerDetail,
  CustomerDirectorySort,
  CustomerSummary,
  UpdateCustomerInput,
} from './types.js';

interface CustomerListRequestInput {
  query?: string;
  page?: number;
  limit?: number;
  sort?: CustomerDirectorySort;
  append?: boolean;
  refresh?: boolean;
}

interface CustomersState {
  items: CustomerSummary[];
  total: number;
  page: number;
  limit: number;
  sort: CustomerDirectorySort;
  query: string;
  customersError: string | null;
  isCustomersLoading: boolean;
  isRefreshingCustomers: boolean;
  isLoadingMoreCustomers: boolean;

  customerDetail: CustomerDetail | null;
  customerDetailError: string | null;
  isCustomerDetailLoading: boolean;
  isCustomerSaving: boolean;

  loadCustomers: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    input?: CustomerListRequestInput,
  ) => Promise<void>;
  loadMoreCustomers: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
  ) => Promise<void>;
  refreshCustomers: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
  ) => Promise<void>;
  loadCustomerDetail: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    customerId: string,
  ) => Promise<void>;
  updateCustomer: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    customerId: string,
    input: UpdateCustomerInput,
  ) => Promise<void>;
  clearCustomers: () => void;
}

let listRequestId = 0;
let detailRequestId = 0;

function trimQuery(query?: string): string {
  return query?.trim() ?? '';
}

export const useCustomersStore = create<CustomersState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  sort: 'recent',
  query: '',
  customersError: null,
  isCustomersLoading: false,
  isRefreshingCustomers: false,
  isLoadingMoreCustomers: false,

  customerDetail: null,
  customerDetailError: null,
  isCustomerDetailLoading: false,
  isCustomerSaving: false,

  loadCustomers: async (getToken, barbershopId, input = {}) => {
    const state = get();
    const requestId = listRequestId + 1;
    listRequestId = requestId;

    const query = trimQuery(input.query ?? state.query);
    const page = Math.max(input.page ?? 1, 1);
    const limit = input.limit ?? state.limit;
    const sort = input.sort ?? state.sort;
    const append = input.append === true && page > 1;

    set({
      customersError: null,
      isCustomersLoading: !append && !input.refresh,
      isRefreshingCustomers: !!input.refresh,
      isLoadingMoreCustomers: append,
      ...(append ? {} : { page, query, sort }),
    });

    try {
      const response = query
        ? await searchCustomers(getToken, barbershopId, {
            query,
            page,
            limit,
            sort,
          })
        : await fetchCustomers(getToken, barbershopId, {
            page,
            limit,
            sort,
          });

      if (requestId !== listRequestId) {
        return;
      }

      const nextItems = append
        ? [...state.items, ...response.items]
        : response.items;

      set({
        items: nextItems,
        total: response.total,
        page: response.page,
        limit: response.limit,
        sort,
        query,
        customersError: null,
        isCustomersLoading: false,
        isRefreshingCustomers: false,
        isLoadingMoreCustomers: false,
      });
    } catch (error) {
      if (requestId !== listRequestId) {
        return;
      }

      set({
        customersError:
          error instanceof Error
            ? error.message
            : localizeUnknownError('Failed to load customers'),
        isCustomersLoading: false,
        isRefreshingCustomers: false,
        isLoadingMoreCustomers: false,
      });
    }
  },

  loadMoreCustomers: async (getToken, barbershopId) => {
    const state = get();
    if (state.isCustomersLoading || state.isRefreshingCustomers || state.isLoadingMoreCustomers) {
      return;
    }

    if (state.items.length >= state.total) {
      return;
    }

    await get().loadCustomers(getToken, barbershopId, {
      query: state.query,
      sort: state.sort,
      limit: state.limit,
      page: state.page + 1,
      append: true,
    });
  },

  refreshCustomers: async (getToken, barbershopId) => {
    const state = get();
    await get().loadCustomers(getToken, barbershopId, {
      query: state.query,
      sort: state.sort,
      limit: state.limit,
      page: 1,
      refresh: true,
    });
  },

  loadCustomerDetail: async (getToken, barbershopId, customerId) => {
    const requestId = detailRequestId + 1;
    detailRequestId = requestId;
    set({
      isCustomerDetailLoading: true,
      customerDetailError: null,
    });

    try {
      const detail = await fetchCustomerDetail(getToken, barbershopId, customerId);
      if (requestId !== detailRequestId) {
        return;
      }

      set({
        customerDetail: detail,
        customerDetailError: null,
        isCustomerDetailLoading: false,
      });
    } catch (error) {
      if (requestId !== detailRequestId) {
        return;
      }

      set({
        customerDetail: null,
        customerDetailError:
          error instanceof Error
            ? error.message
            : localizeUnknownError('Failed to load customer detail'),
        isCustomerDetailLoading: false,
      });
    }
  },

  updateCustomer: async (getToken, barbershopId, customerId, input) => {
    set({ isCustomerSaving: true, customerDetailError: null });

    try {
      const updated = await patchCustomer(getToken, barbershopId, customerId, input);

      set((state) => ({
        isCustomerSaving: false,
        items: state.items.map((item) => (
          item.id === customerId
            ? {
                ...item,
                name: updated.name,
                email: updated.email,
              }
            : item
        )),
        customerDetail:
          state.customerDetail?.id === customerId
            ? {
                ...state.customerDetail,
                name: updated.name,
                email: updated.email,
                internalNotes: updated.internalNotes,
              }
            : state.customerDetail,
      }));
    } catch (error) {
      set({
        isCustomerSaving: false,
        customerDetailError:
          error instanceof Error
            ? error.message
            : localizeUnknownError('Failed to update customer'),
      });
    }
  },

  clearCustomers: () => {
    listRequestId = 0;
    detailRequestId = 0;
    set({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      sort: 'recent',
      query: '',
      customersError: null,
      isCustomersLoading: false,
      isRefreshingCustomers: false,
      isLoadingMoreCustomers: false,
      customerDetail: null,
      customerDetailError: null,
      isCustomerDetailLoading: false,
      isCustomerSaving: false,
    });
  },
}));
