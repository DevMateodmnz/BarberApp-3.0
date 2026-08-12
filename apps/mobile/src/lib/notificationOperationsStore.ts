import { create } from 'zustand';

import { localizeUnknownError } from '@/i18n/errors.js';
import { ApiError } from './api.js';
import {
  fetchNotificationOperations,
  fetchNotificationOperationsDetail,
  fetchNotificationOperationsSummary,
  retryNotificationDelivery,
  type NotificationOperationsQuery,
} from './notificationOperations.js';
import type {
  NotificationOperationsDetail,
  NotificationOperationsListItem,
  NotificationOperationsSummary,
} from './types.js';

interface NotificationOperationsState {
  summary: NotificationOperationsSummary | null;
  isSummaryLoading: boolean;
  summaryError: string | null;

  items: NotificationOperationsListItem[];
  total: number;
  page: number;
  limit: number;
  query: NotificationOperationsQuery;
  currentBarbershopId: string | null;
  isNotificationsLoading: boolean;
  isRefreshingNotifications: boolean;
  isLoadingMoreNotifications: boolean;
  notificationsError: string | null;

  detail: NotificationOperationsDetail | null;
  detailNotificationId: string | null;
  isDetailLoading: boolean;
  detailError: string | null;
  isRetryingNotification: boolean;
  retryError: string | null;
  retryErrorCode: string | null;

  loadSummary: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
  ) => Promise<void>;
  loadNotifications: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    query: NotificationOperationsQuery,
  ) => Promise<void>;
  loadMoreNotifications: (getToken: () => Promise<string | null>) => Promise<void>;
  refreshNotifications: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
  ) => Promise<void>;
  loadDetail: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    notificationId: string,
  ) => Promise<void>;
  retryNotification: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    notificationId: string,
  ) => Promise<void>;
  clearDetail: () => void;
  clearAll: () => void;
}

const DEFAULT_LIMIT = 20;

function getFriendlyMessage(error: unknown, fallbackMessage?: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return localizeUnknownError(fallbackMessage);
}

export const useNotificationOperationsStore = create<NotificationOperationsState>((set, get) => ({
  summary: null,
  isSummaryLoading: false,
  summaryError: null,

  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_LIMIT,
  query: { status: 'ALL', sort: 'newest', limit: DEFAULT_LIMIT, page: 1 },
  currentBarbershopId: null,
  isNotificationsLoading: false,
  isRefreshingNotifications: false,
  isLoadingMoreNotifications: false,
  notificationsError: null,

  detail: null,
  detailNotificationId: null,
  isDetailLoading: false,
  detailError: null,
  isRetryingNotification: false,
  retryError: null,
  retryErrorCode: null,

  loadSummary: async (getToken, barbershopId) => {
    set({ isSummaryLoading: true, summaryError: null });
    try {
      const summary = await fetchNotificationOperationsSummary(getToken, barbershopId);
      set({ summary, isSummaryLoading: false, summaryError: null });
    } catch (error) {
      set({
        summary: null,
        isSummaryLoading: false,
        summaryError: getFriendlyMessage(error),
      });
    }
  },

  loadNotifications: async (getToken, barbershopId, query) => {
    const nextLimit = query.limit ?? DEFAULT_LIMIT;
    const normalizedQuery: NotificationOperationsQuery = {
      status: query.status ?? 'ALL',
      sort: query.sort ?? 'newest',
      limit: nextLimit,
      page: 1,
      ...(query.type ? { type: query.type } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
    };

    set({
      currentBarbershopId: barbershopId,
      query: normalizedQuery,
      limit: nextLimit,
      page: 1,
      isNotificationsLoading: true,
      notificationsError: null,
    });

    try {
      const page = await fetchNotificationOperations(getToken, barbershopId, normalizedQuery);
      set({
        items: page.items,
        total: page.total,
        page: page.page,
        limit: page.limit,
        isNotificationsLoading: false,
        notificationsError: null,
      });
    } catch (error) {
      set({
        items: [],
        total: 0,
        page: 1,
        isNotificationsLoading: false,
        notificationsError: getFriendlyMessage(error),
      });
    }
  },

  loadMoreNotifications: async (getToken) => {
    const { currentBarbershopId, query, page, total, items, isLoadingMoreNotifications } = get();
    if (!currentBarbershopId || isLoadingMoreNotifications || items.length >= total) {
      return;
    }

    const nextPage = page + 1;
    set({ isLoadingMoreNotifications: true, notificationsError: null });
    try {
      const response = await fetchNotificationOperations(getToken, currentBarbershopId, {
        ...query,
        page: nextPage,
      });
      set((state) => ({
        items: [...state.items, ...response.items],
        total: response.total,
        page: response.page,
        limit: response.limit,
        isLoadingMoreNotifications: false,
      }));
    } catch (error) {
      set({
        isLoadingMoreNotifications: false,
        notificationsError: getFriendlyMessage(error),
      });
    }
  },

  refreshNotifications: async (getToken, barbershopId) => {
    const query = get().query;
    set({ isRefreshingNotifications: true, notificationsError: null });
    try {
      const [summary, page] = await Promise.all([
        fetchNotificationOperationsSummary(getToken, barbershopId),
        fetchNotificationOperations(getToken, barbershopId, { ...query, page: 1 }),
      ]);
      set({
        summary,
        items: page.items,
        total: page.total,
        page: page.page,
        limit: page.limit,
        currentBarbershopId: barbershopId,
        isRefreshingNotifications: false,
        notificationsError: null,
        summaryError: null,
      });
    } catch (error) {
      set({
        isRefreshingNotifications: false,
        notificationsError: getFriendlyMessage(error),
      });
    }
  },

  loadDetail: async (getToken, barbershopId, notificationId) => {
    set({
      detailNotificationId: notificationId,
      isDetailLoading: true,
      detailError: null,
      retryError: null,
      retryErrorCode: null,
    });
    try {
      const detail = await fetchNotificationOperationsDetail(
        getToken,
        barbershopId,
        notificationId,
      );
      set({ detail, isDetailLoading: false, detailError: null });
    } catch (error) {
      set({
        detail: null,
        isDetailLoading: false,
        detailError: getFriendlyMessage(error),
      });
    }
  },

  retryNotification: async (getToken, barbershopId, notificationId) => {
    set({
      isRetryingNotification: true,
      retryError: null,
      retryErrorCode: null,
    });

    try {
      await retryNotificationDelivery(getToken, barbershopId, notificationId);
      const [summary, page, detail] = await Promise.all([
        fetchNotificationOperationsSummary(getToken, barbershopId),
        fetchNotificationOperations(getToken, barbershopId, { ...get().query, page: 1 }),
        fetchNotificationOperationsDetail(getToken, barbershopId, notificationId),
      ]);

      set({
        summary,
        items: page.items,
        total: page.total,
        page: page.page,
        limit: page.limit,
        detail,
        isRetryingNotification: false,
        retryError: null,
        retryErrorCode: null,
        notificationsError: null,
        summaryError: null,
        detailError: null,
      });
    } catch (error) {
      set({
        isRetryingNotification: false,
        retryError: getFriendlyMessage(error),
        retryErrorCode: error instanceof ApiError ? error.code ?? null : null,
      });
    }
  },

  clearDetail: () => {
    set({
      detail: null,
      detailNotificationId: null,
      isDetailLoading: false,
      detailError: null,
      isRetryingNotification: false,
      retryError: null,
      retryErrorCode: null,
    });
  },

  clearAll: () => {
    set({
      summary: null,
      isSummaryLoading: false,
      summaryError: null,
      items: [],
      total: 0,
      page: 1,
      limit: DEFAULT_LIMIT,
      query: { status: 'ALL', sort: 'newest', limit: DEFAULT_LIMIT, page: 1 },
      currentBarbershopId: null,
      isNotificationsLoading: false,
      isRefreshingNotifications: false,
      isLoadingMoreNotifications: false,
      notificationsError: null,
      detail: null,
      detailNotificationId: null,
      isDetailLoading: false,
      detailError: null,
      isRetryingNotification: false,
      retryError: null,
      retryErrorCode: null,
    });
  },
}));
