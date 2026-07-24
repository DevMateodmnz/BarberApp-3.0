import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppTextInput, EmptyState, Screen, ScreenHeader, SectionHeader } from '@/components/ui/index.js';
import { formatCurrencyMinorUnits } from '@/i18n/index.js';
import { fetchBarbershopServices } from '@/lib/services.js';
import { useContextStore } from '@/lib/store.js';
import type {
  CreatePromotionInput,
  LoyaltyLedgerPage,
  LoyaltyProgramSettings,
  PromotionDetail,
  PromotionListItem,
  PromotionRedemptionStatus,
  PromotionServiceScope,
  PromotionSummary,
  Service,
  UpdatePromotionInput,
} from '@/lib/types.js';
import {
  createPromotion,
  fetchLoyaltyLedger,
  fetchLoyaltyProgram,
  fetchPromotionDetail,
  fetchPromotionRedemptions,
  fetchPromotions,
  fetchPromotionSummary,
  setPromotionActive,
  updateLoyaltyProgram,
  updatePromotion,
} from '@/lib/promotions.js';
import {
  classifyMobileMutationError,
  createMobileQaTraceContext,
  traceMobileQaEvent,
  type MobileQaTraceContext,
  type MobileQaSafeErrorCode,
} from '@/lib/physicalQaTrace.js';
import { tokens } from '@/theme/index.js';

const FILTERS = ['ALL', 'ACTIVE', 'UPCOMING', 'EXPIRED', 'INACTIVE'] as const;
type PromotionFilter = (typeof FILTERS)[number];

type FormState = {
  id: string | null;
  name: string;
  code: string;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: string;
  serviceScope: PromotionServiceScope;
  selectedServiceIds: string[];
  startsAt: string;
  endsAt: string;
  appliesToPublicBookings: boolean;
  appliesToStaffBookings: boolean;
  maxActiveRedemptions: string;
  maxRedemptionsPerCustomer: string;
  minimumPriceCents: string;
};

function normalizeCodePreview(value: string) {
  return value.trim().toUpperCase().replace(/\s+/gu, '');
}

function toInputDateTime(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 16);
}

function fromInputDateTime(value: string) {
  if (!value.trim()) return '';
  return new Date(value).toISOString();
}

function formatMoney(value: number | null | undefined, currency = 'ARS') {
  if (typeof value !== 'number') return '—';
  return formatCurrencyMinorUnits(value, { currency, fractionDigits: 0 });
}

function buildEmptyForm(): FormState {
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  return {
    id: null,
    name: '',
    code: '',
    discountType: 'FIXED',
    discountValue: '',
    serviceScope: 'ALL',
    selectedServiceIds: [],
    startsAt: toInputDateTime(now.toISOString()),
    endsAt: toInputDateTime(later.toISOString()),
    appliesToPublicBookings: true,
    appliesToStaffBookings: true,
    maxActiveRedemptions: '',
    maxRedemptionsPerCustomer: '',
    minimumPriceCents: '',
  };
}

function buildFormFromPromotion(promotion: PromotionDetail): FormState {
  return {
    id: promotion.id,
    name: promotion.name,
    code: promotion.code,
    discountType: promotion.discountType,
    discountValue: String(promotion.discountType === 'FIXED'
      ? promotion.fixedDiscountCents ?? ''
      : promotion.percentageBasisPoints ?? ''),
    serviceScope: promotion.serviceScope,
    selectedServiceIds: promotion.services.map((service) => service.id),
    startsAt: toInputDateTime(promotion.startsAt),
    endsAt: toInputDateTime(promotion.endsAt),
    appliesToPublicBookings: promotion.appliesToPublicBookings,
    appliesToStaffBookings: promotion.appliesToStaffBookings,
    maxActiveRedemptions: promotion.maxActiveRedemptions ? String(promotion.maxActiveRedemptions) : '',
    maxRedemptionsPerCustomer: promotion.maxRedemptionsPerCustomer ? String(promotion.maxRedemptionsPerCustomer) : '',
    minimumPriceCents: promotion.minimumPriceCents ? String(promotion.minimumPriceCents) : '',
  };
}

export default function PromotionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const [summary, setSummary] = useState<PromotionSummary | null>(null);
  const [loyaltyProgram, setLoyaltyProgram] = useState<LoyaltyProgramSettings | null>(null);
  const [loyaltyLedger, setLoyaltyLedger] = useState<LoyaltyLedgerPage['items']>([]);
  const [loyaltyVisitsRequired, setLoyaltyVisitsRequired] = useState('5');
  const [loyaltyRewardValidityDays, setLoyaltyRewardValidityDays] = useState('');
  const [loyaltyRewardPromotionId, setLoyaltyRewardPromotionId] = useState<string | null>(null);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [loyaltyMessage, setLoyaltyMessage] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [promotions, setPromotions] = useState<PromotionListItem[]>([]);
  const [selectedPromotion, setSelectedPromotion] = useState<PromotionDetail | null>(null);
  const [redemptions, setRedemptions] = useState<Array<{ status: PromotionRedemptionStatus; customerDisplayName: string; serviceName: string; finalPriceCents: number }>>([]);
  const [filter, setFilter] = useState<PromotionFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(buildEmptyForm);
  const loadRequestIdRef = useRef(0);
  const savingLoyaltyRef = useRef(false);

  const applyLoyaltyProgram = useCallback((program: LoyaltyProgramSettings) => {
    setLoyaltyProgram(program);
    setLoyaltyEnabled(program.isEnabled);
    setLoyaltyVisitsRequired(String(program.visitsRequired));
    setLoyaltyRewardValidityDays(program.rewardValidityDays ? String(program.rewardValidityDays) : '');
    setLoyaltyRewardPromotionId(program.rewardPromotion?.id ?? null);
  }, []);

  const load = useCallback(async (options?: { refresh?: boolean }) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (!context?.barbershopId || !getTokenRef.current) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [nextSummary, nextLoyaltyProgram, nextLoyaltyLedger, nextPromotions, nextServices] = await Promise.all([
        fetchPromotionSummary(getTokenRef.current, context.barbershopId),
        fetchLoyaltyProgram(getTokenRef.current, context.barbershopId),
        fetchLoyaltyLedger(getTokenRef.current, context.barbershopId, { limit: 10 }),
        fetchPromotions(getTokenRef.current, context.barbershopId),
        fetchBarbershopServices(getTokenRef.current, context.barbershopId, { includeInactive: true }),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setSummary(nextSummary);
      applyLoyaltyProgram(nextLoyaltyProgram);
      setLoyaltyLedger(nextLoyaltyLedger.items);
      setPromotions(nextPromotions);
      setServices(nextServices.filter((service) => service.isActive));
    } catch (nextError) {
      if (loadRequestIdRef.current === requestId) {
        setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi'));
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyLoyaltyProgram, context?.barbershopId, t]);

  const loadPromotionDetailState = useCallback(async (promotionId: string) => {
    if (!context?.barbershopId || !getTokenRef.current) return;

    setDetailLoading(true);
    setError(null);

    try {
      const [detail, redemptionPage] = await Promise.all([
        fetchPromotionDetail(getTokenRef.current, context.barbershopId, promotionId),
        fetchPromotionRedemptions(getTokenRef.current, context.barbershopId, promotionId, { limit: 10 }),
      ]);
      setSelectedPromotion(detail);
      setRedemptions(redemptionPage.items.map((item) => ({
        status: item.status,
        customerDisplayName: item.customerDisplayName,
        serviceName: item.serviceName,
        finalPriceCents: item.finalPriceCents,
      })));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi'));
    } finally {
      setDetailLoading(false);
    }
  }, [context?.barbershopId]);

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePromotions = useMemo(() => {
    if (filter === 'ALL') return promotions;
    return promotions.filter((promotion) => promotion.status === filter);
  }, [filter, promotions]);

  const loyaltyDirty = useMemo(() => {
    if (!loyaltyProgram) return false;

    const currentValidityDays = loyaltyProgram.rewardValidityDays ?? null;
    const enteredValidityDays = loyaltyRewardValidityDays.trim()
      ? Number(loyaltyRewardValidityDays)
      : null;

    return loyaltyEnabled !== loyaltyProgram.isEnabled
      || Number(loyaltyVisitsRequired) !== loyaltyProgram.visitsRequired
      || loyaltyRewardPromotionId !== (loyaltyProgram.rewardPromotion?.id ?? null)
      || enteredValidityDays !== currentValidityDays;
  }, [
    loyaltyEnabled,
    loyaltyProgram,
    loyaltyRewardPromotionId,
    loyaltyRewardValidityDays,
    loyaltyVisitsRequired,
  ]);

  const clearLoyaltyFeedback = useCallback(() => {
    setLoyaltyError(null);
    setLoyaltyMessage(null);
  }, []);

  const validateLoyaltyForm = useCallback((): string | null => {
    const visitsRequired = Number(loyaltyVisitsRequired);
    if (
      !/^\d+$/u.test(loyaltyVisitsRequired)
      || !Number.isInteger(visitsRequired)
      || visitsRequired < 2
      || visitsRequired > 20
    ) {
      return t('promotions.loyalty.validation.visitsRequired');
    }

    if (loyaltyRewardValidityDays.trim()) {
      const validityDays = Number(loyaltyRewardValidityDays);
      if (
        !/^\d+$/u.test(loyaltyRewardValidityDays)
        || !Number.isInteger(validityDays)
        || validityDays < 1
        || validityDays > 365
      ) {
        return t('promotions.loyalty.validation.rewardValidityDays');
      }
    }

    if (loyaltyEnabled && !loyaltyRewardPromotionId) {
      return t('promotions.loyalty.validation.rewardPromotion');
    }

    return null;
  }, [
    loyaltyEnabled,
    loyaltyRewardPromotionId,
    loyaltyRewardValidityDays,
    loyaltyVisitsRequired,
    t,
  ]);

  const validateForm = useCallback((): string | null => {
    if (!form.name.trim()) return t('promotions.validation.nameRequired');
    if (!normalizeCodePreview(form.code)) return t('promotions.validation.codeRequired');
    if (!form.discountValue.trim()) return t('promotions.validation.discountRequired');
    if (!form.startsAt.trim() || !form.endsAt.trim()) return t('promotions.validation.windowRequired');
    if (form.serviceScope === 'SELECTED' && form.selectedServiceIds.length === 0) return t('promotions.validation.servicesRequired');
    if (!form.appliesToPublicBookings && !form.appliesToStaffBookings) return t('promotions.validation.channelRequired');
    return null;
  }, [form, t]);

  const buildPayload = useCallback((): CreatePromotionInput | UpdatePromotionInput => {
    const numericDiscount = Number(form.discountValue || '0');
    return {
      name: form.name.trim(),
      ...(form.id ? {} : { code: normalizeCodePreview(form.code) }),
      ...(form.id ? {} : { discountType: form.discountType }),
      ...(form.id ? {} : (form.discountType === 'FIXED'
        ? { fixedDiscountCents: numericDiscount }
        : { percentageBasisPoints: numericDiscount })),
      startsAt: fromInputDateTime(form.startsAt),
      endsAt: fromInputDateTime(form.endsAt),
      appliesToPublicBookings: form.appliesToPublicBookings,
      appliesToStaffBookings: form.appliesToStaffBookings,
      ...(form.id ? {} : { serviceScope: form.serviceScope }),
      ...(form.id ? {} : (form.serviceScope === 'SELECTED' ? { serviceIds: form.selectedServiceIds } : {})),
      ...(!form.id && form.maxActiveRedemptions.trim() ? { maxActiveRedemptions: Number(form.maxActiveRedemptions) } : {}),
      ...(!form.id && form.maxRedemptionsPerCustomer.trim() ? { maxRedemptionsPerCustomer: Number(form.maxRedemptionsPerCustomer) } : {}),
      ...(!form.id && form.minimumPriceCents.trim() ? { minimumPriceCents: Number(form.minimumPriceCents) } : {}),
    };
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!context?.barbershopId || !getTokenRef.current) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (form.id) {
        const updated = await updatePromotion(getTokenRef.current, context.barbershopId, form.id, buildPayload() as UpdatePromotionInput);
        setSelectedPromotion(updated);
        setMessage(t('promotions.messages.updated'));
      } else {
        const created = await createPromotion(getTokenRef.current, context.barbershopId, buildPayload() as CreatePromotionInput);
        setSelectedPromotion(created);
        setForm(buildFormFromPromotion(created));
        setMessage(t('promotions.messages.created'));
      }
      setShowForm(false);
      await load();
      if (form.id) {
        await loadPromotionDetailState(form.id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi'));
    } finally {
      setSaving(false);
    }
  }, [buildPayload, context?.barbershopId, form, load, loadPromotionDetailState, t, validateForm]);

  const handleSaveLoyalty = useCallback(async (
    traceContext: MobileQaTraceContext,
  ) => {
    traceMobileQaEvent({ ...traceContext, stage: 'validation_started' });

    if (savingLoyaltyRef.current) {
      traceMobileQaEvent({
        ...traceContext,
        stage: 'validation_failed',
        safeErrorCode: 'DUPLICATE_BLOCKED',
      });
      return;
    }

    const validationError = validateLoyaltyForm();
    if (validationError) {
      traceMobileQaEvent({
        ...traceContext,
        stage: 'validation_failed',
        safeErrorCode: 'VALIDATION',
      });
      setLoyaltyError(validationError);
      setLoyaltyMessage(null);
      return;
    }

    if (!context?.barbershopId || !getTokenRef.current) {
      setLoyaltyError(t('promotions.loyalty.errors.unavailable'));
      setLoyaltyMessage(null);
      return;
    }

    // A load started before Save may contain older server state. Invalidate it
    // before issuing the mutation so it cannot overwrite the authoritative
    // mutation response while the success message is visible.
    loadRequestIdRef.current += 1;
    savingLoyaltyRef.current = true;
    setSavingLoyalty(true);
    setLoyaltyError(null);
    setLoyaltyMessage(null);
    try {
      traceMobileQaEvent({
        ...traceContext,
        stage: 'mutation_started',
        visitsRequired: Number(loyaltyVisitsRequired),
        templateSelected: Boolean(loyaltyRewardPromotionId),
      });
      const nextProgram = await updateLoyaltyProgram(getTokenRef.current, context.barbershopId, {
        isEnabled: loyaltyEnabled,
        visitsRequired: Number(loyaltyVisitsRequired || '0'),
        rewardPromotionId: loyaltyRewardPromotionId,
        rewardValidityDays: loyaltyRewardValidityDays.trim() ? Number(loyaltyRewardValidityDays) : null,
      }, traceContext);
      traceMobileQaEvent({
        ...traceContext,
        stage: 'mutation_succeeded',
        visitsRequired: nextProgram.visitsRequired,
      });
      applyLoyaltyProgram(nextProgram);
      traceMobileQaEvent({
        ...traceContext,
        stage: 'authoritative_state_applied',
        visitsRequired: nextProgram.visitsRequired,
      });
      setLoyaltyMessage(t('promotions.loyalty.saved'));
    } catch (nextError) {
      const safeErrorCode = classifyMobileMutationError(nextError);
      traceMobileQaEvent({
        ...traceContext,
        stage: 'mutation_failed',
        safeErrorCode,
      });
      setLoyaltyError(resolveLoyaltySaveError(safeErrorCode, nextError, t));
    } finally {
      savingLoyaltyRef.current = false;
      setSavingLoyalty(false);
    }
  }, [
    applyLoyaltyProgram,
    context?.barbershopId,
    loyaltyEnabled,
    loyaltyRewardPromotionId,
    loyaltyRewardValidityDays,
    loyaltyVisitsRequired,
    t,
    validateLoyaltyForm,
  ]);

  if (!isLoaded || !isSignedIn) return null;

  if (isContextLoading && !context) {
    return (
      <Screen>
        <View style={styles.centered}><ActivityIndicator size="large" color={tokens.colors.primary} /></View>
      </Screen>
    );
  }

  if (!context || context.role !== 'OWNER' || !context.barbershopId) {
    return (
      <Screen>
        <AppCard testID="promotions-blocked" variant="outlined">
          <Text style={styles.blockedTitle}>{t('promotions.blockedTitle')}</Text>
          <Text style={styles.bodyText}>{contextError ?? t('promotions.blockedMessage')}</Text>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader testID="promotions-header" title={t('promotions.title')} subtitle={t('promotions.subtitle')} onBack={() => router.back()} />
      <ScrollView
        testID="promotions-scroll"
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            testID="promotions-refresh-control"
            refreshing={refreshing}
            onRefresh={() => void load({ refresh: true })}
          />
        )}
      >
        <AppCard testID="promotions-summary-card" variant="outlined">
          <SectionHeader title={t('promotions.summary.title')} />
          <Text style={styles.bodyText}>{t('promotions.summary.active', { count: summary?.activePromotions ?? 0 })}</Text>
          <Text style={styles.bodyText}>{t('promotions.summary.upcoming', { count: summary?.upcomingPromotions ?? 0 })}</Text>
          <Text style={styles.bodyText}>{t('promotions.summary.consumed', { count: summary?.totalConsumedRedemptions ?? 0 })}</Text>
          <Text style={styles.bodyText}>{t('promotions.summary.discount', { amount: formatMoney(summary?.totalDiscountCents ?? 0) })}</Text>
        </AppCard>
        <AppCard testID="promotions-loyalty-card" variant="outlined">
          <SectionHeader title={t('promotions.loyalty.title')} />
          <Text style={styles.helperText}>{t('promotions.loyalty.help')}</Text>
          <View style={styles.filterRow}>
            <Pressable
              testID="promotions-loyalty-enabled"
              onPress={() => {
                clearLoyaltyFeedback();
                setLoyaltyEnabled(true);
              }}
              style={[styles.filterChip, loyaltyEnabled && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, loyaltyEnabled && styles.filterChipTextActive]}>{t('promotions.loyalty.enabled')}</Text>
            </Pressable>
            <Pressable
              testID="promotions-loyalty-disabled"
              onPress={() => {
                clearLoyaltyFeedback();
                setLoyaltyEnabled(false);
              }}
              style={[styles.filterChip, !loyaltyEnabled && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, !loyaltyEnabled && styles.filterChipTextActive]}>{t('promotions.loyalty.disabled')}</Text>
            </Pressable>
          </View>
          <AppTextInput
            testID="promotions-loyalty-visits-required"
            label={t('promotions.loyalty.visitsRequired')}
            value={loyaltyVisitsRequired}
            onChangeText={(value) => {
              clearLoyaltyFeedback();
              setLoyaltyVisitsRequired(value.replace(/[^0-9]/gu, ''));
            }}
            keyboardType="number-pad"
          />
          <AppTextInput
            testID="promotions-loyalty-validity-days"
            label={t('promotions.loyalty.rewardValidityDays')}
            value={loyaltyRewardValidityDays}
            onChangeText={(value) => {
              clearLoyaltyFeedback();
              setLoyaltyRewardValidityDays(value.replace(/[^0-9]/gu, ''));
            }}
            keyboardType="number-pad"
          />
          <SectionHeader title={t('promotions.loyalty.rewardPromotion')} />
          {loyaltyProgram?.rewardPromotion ? (
            <Text style={styles.helperText}>{loyaltyProgram.rewardPromotion.name}</Text>
          ) : null}
          <View style={styles.filterRow}>
            {promotions.map((promotion) => (
              <Pressable
                key={promotion.id}
                testID={`promotions-loyalty-template-${promotion.id}`}
                onPress={() => {
                  clearLoyaltyFeedback();
                  setLoyaltyRewardPromotionId(promotion.id);
                }}
                style={[styles.filterChip, loyaltyRewardPromotionId === promotion.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, loyaltyRewardPromotionId === promotion.id && styles.filterChipTextActive]}>{promotion.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.buttonRow}>
            <AppButton
              testID="promotions-loyalty-save"
              title={t('promotions.loyalty.save')}
              accessibilityLabel={t('promotions.loyalty.save')}
              accessibilityState={{ disabled: !loyaltyDirty, busy: savingLoyalty }}
              disabled={!loyaltyDirty}
              loading={savingLoyalty}
              loadingText={t('promotions.loyalty.saving')}
              onPress={() => {
                const traceContext = createMobileQaTraceContext(
                  'loyalty-program-save',
                  'promotions-loyalty',
                );
                traceMobileQaEvent({
                  ...traceContext,
                  stage: 'press_received',
                });
                void handleSaveLoyalty(traceContext);
              }}
            />
          </View>
          <Text
            testID="promotions-loyalty-state"
            accessibilityLiveRegion="polite"
            style={loyaltyDirty ? styles.unsavedText : styles.helperText}
          >
            {loyaltyDirty
              ? t('promotions.loyalty.unsaved')
              : t('promotions.loyalty.current')}
          </Text>
          {loyaltyError ? (
            <Text
              testID="promotions-loyalty-error"
              accessibilityLiveRegion="assertive"
              style={styles.errorText}
            >
              {loyaltyError}
            </Text>
          ) : null}
          {loyaltyMessage ? (
            <Text
              testID="promotions-loyalty-success"
              accessibilityLiveRegion="polite"
              style={styles.successText}
            >
              {loyaltyMessage}
            </Text>
          ) : null}
          <SectionHeader title={t('promotions.loyalty.ledgerTitle')} />
          {loyaltyLedger.length === 0 ? (
            <Text style={styles.bodyText}>{t('promotions.loyalty.ledgerEmpty')}</Text>
          ) : loyaltyLedger.map((item) => (
            <View key={item.id} style={styles.appointmentRow}>
              <View style={styles.appointmentCopy}>
                <Text style={styles.appointmentTitle}>{t(`promotions.loyalty.events.${item.eventType}`)}</Text>
                <Text style={styles.helperText}>{item.customerName}</Text>
              </View>
              <Text style={styles.bodyText}>{item.stampDelta !== 0 ? `${item.stampDelta > 0 ? '+' : ''}${item.stampDelta}` : `${item.rewardDelta > 0 ? '+' : ''}${item.rewardDelta}`}</Text>
            </View>
          ))}
        </AppCard>

        <AppCard testID="promotions-filters-card" variant="outlined">
          <SectionHeader title={t('promotions.filtersTitle')} />
          <View style={styles.filterRow}>
            {FILTERS.map((item) => (
              <Pressable
                key={item}
                testID={`promotions-filter-${item.toLowerCase()}`}
                onPress={() => setFilter(item)}
                style={[styles.filterChip, filter === item && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === item && styles.filterChipTextActive]}>{t(`promotions.filters.${item}`)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.buttonRow}>
            <AppButton testID="promotions-retry" title={t('common.actions.retry')} variant="secondary" onPress={() => void load()} />
            <AppButton testID="promotions-new" title={t('promotions.actions.new')} onPress={() => { setForm(buildEmptyForm()); setShowForm(true); setMessage(null); }} />
          </View>
        </AppCard>

        {error && !showForm ? (
          <AppCard testID="promotions-error-card" variant="outlined">
            <Text style={styles.errorText}>{error}</Text>
          </AppCard>
        ) : null}

        {message && !showForm ? (
          <AppCard testID="promotions-message-card" variant="outlined">
            <Text style={styles.successText}>{message}</Text>
          </AppCard>
        ) : null}

        {showForm ? (
          <AppCard testID="promotions-form-card" variant="outlined">
            <SectionHeader title={form.id ? t('promotions.form.editTitle') : t('promotions.form.createTitle')} />
            <AppTextInput testID="promotions-form-name" label={t('promotions.form.name')} value={form.name} onChangeText={(value) => setForm((current) => ({ ...current, name: value }))} />
            <AppTextInput testID="promotions-form-code" label={t('promotions.form.code')} value={form.code} onChangeText={(value) => setForm((current) => ({ ...current, code: value }))} editable={!form.id} />
            <Text style={styles.helperText}>{t('promotions.form.codePreview', { code: normalizeCodePreview(form.code) || '—' })}</Text>
            <AppTextInput testID="promotions-form-discount-value" label={t('promotions.form.discountValue')} value={form.discountValue} onChangeText={(value) => setForm((current) => ({ ...current, discountValue: value.replace(/[^0-9]/gu, '') }))} keyboardType="number-pad" />
            <AppTextInput testID="promotions-form-starts-at" label={t('promotions.form.startsAt')} value={form.startsAt} onChangeText={(value) => setForm((current) => ({ ...current, startsAt: value }))} />
            <AppTextInput testID="promotions-form-ends-at" label={t('promotions.form.endsAt')} value={form.endsAt} onChangeText={(value) => setForm((current) => ({ ...current, endsAt: value }))} />
            <View style={styles.filterRow}>
              <Pressable testID="promotions-form-discount-fixed" onPress={() => setForm((current) => ({ ...current, discountType: 'FIXED' }))} style={[styles.filterChip, form.discountType === 'FIXED' && styles.filterChipActive]}><Text style={[styles.filterChipText, form.discountType === 'FIXED' && styles.filterChipTextActive]}>{t('promotions.form.fixed')}</Text></Pressable>
              <Pressable testID="promotions-form-discount-percentage" onPress={() => setForm((current) => ({ ...current, discountType: 'PERCENTAGE' }))} style={[styles.filterChip, form.discountType === 'PERCENTAGE' && styles.filterChipActive]}><Text style={[styles.filterChipText, form.discountType === 'PERCENTAGE' && styles.filterChipTextActive]}>{t('promotions.form.percentage')}</Text></Pressable>
            </View>
            {!form.id ? (
              <>
                <View style={styles.filterRow}>
                  <Pressable testID="promotions-form-scope-all" onPress={() => setForm((current) => ({ ...current, serviceScope: 'ALL' }))} style={[styles.filterChip, form.serviceScope === 'ALL' && styles.filterChipActive]}><Text style={[styles.filterChipText, form.serviceScope === 'ALL' && styles.filterChipTextActive]}>{t('promotions.form.scopeAll')}</Text></Pressable>
                  <Pressable testID="promotions-form-scope-selected" onPress={() => setForm((current) => ({ ...current, serviceScope: 'SELECTED' }))} style={[styles.filterChip, form.serviceScope === 'SELECTED' && styles.filterChipActive]}><Text style={[styles.filterChipText, form.serviceScope === 'SELECTED' && styles.filterChipTextActive]}>{t('promotions.form.scopeSelected')}</Text></Pressable>
                </View>
                {form.serviceScope === 'SELECTED' ? (
                  <View style={styles.selectionList} testID="promotions-form-service-list">
                    {services.map((service) => {
                      const selected = form.selectedServiceIds.includes(service.id);
                      return (
                        <Pressable
                          key={service.id}
                          testID={`promotions-form-service-${service.id}`}
                          onPress={() => setForm((current) => ({
                            ...current,
                            selectedServiceIds: selected
                              ? current.selectedServiceIds.filter((id) => id !== service.id)
                              : [...current.selectedServiceIds, service.id],
                          }))}
                          style={[styles.serviceChip, selected && styles.serviceChipActive]}
                        >
                          <Text style={[styles.serviceChipText, selected && styles.serviceChipTextActive]}>{service.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <AppTextInput testID="promotions-form-max-uses" label={t('promotions.form.maxUses')} value={form.maxActiveRedemptions} onChangeText={(value) => setForm((current) => ({ ...current, maxActiveRedemptions: value.replace(/[^0-9]/gu, '') }))} keyboardType="number-pad" />
                <AppTextInput testID="promotions-form-max-per-customer" label={t('promotions.form.maxPerCustomer')} value={form.maxRedemptionsPerCustomer} onChangeText={(value) => setForm((current) => ({ ...current, maxRedemptionsPerCustomer: value.replace(/[^0-9]/gu, '') }))} keyboardType="number-pad" />
                <AppTextInput testID="promotions-form-minimum-price" label={t('promotions.form.minimumPrice')} value={form.minimumPriceCents} onChangeText={(value) => setForm((current) => ({ ...current, minimumPriceCents: value.replace(/[^0-9]/gu, '') }))} keyboardType="number-pad" />
              </>
            ) : null}
            <View style={styles.filterRow}>
              <Pressable testID="promotions-form-channel-public" onPress={() => setForm((current) => ({ ...current, appliesToPublicBookings: !current.appliesToPublicBookings }))} style={[styles.filterChip, form.appliesToPublicBookings && styles.filterChipActive]}><Text style={[styles.filterChipText, form.appliesToPublicBookings && styles.filterChipTextActive]}>{t('promotions.form.public')}</Text></Pressable>
              <Pressable testID="promotions-form-channel-staff" onPress={() => setForm((current) => ({ ...current, appliesToStaffBookings: !current.appliesToStaffBookings }))} style={[styles.filterChip, form.appliesToStaffBookings && styles.filterChipActive]}><Text style={[styles.filterChipText, form.appliesToStaffBookings && styles.filterChipTextActive]}>{t('promotions.form.staff')}</Text></Pressable>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}
            <View style={styles.buttonRow}>
              <AppButton testID="promotions-form-cancel" title={t('common.actions.cancel')} variant="secondary" onPress={() => setShowForm(false)} />
              <AppButton testID="promotions-form-submit" title={form.id ? t('common.actions.saveChanges') : t('common.actions.create')} loading={saving} onPress={() => void handleSubmit()} />
            </View>
          </AppCard>
        ) : null}

        <AppCard testID="promotions-list-card" variant="outlined">
          <SectionHeader title={t('promotions.listTitle')} />
          {loading ? (
            <View testID="promotions-list-loading" style={styles.centered}><ActivityIndicator size="small" color={tokens.colors.primary} /></View>
          ) : visiblePromotions.length === 0 ? (
            <EmptyState testID="promotions-empty-state" title={t('promotions.emptyTitle')} message={t('promotions.emptyMessage')} />
          ) : (
            <View testID="promotions-list" style={styles.selectionList}>
              {visiblePromotions.map((promotion) => (
                <Pressable
                  key={promotion.id}
                  testID={`promotions-row-${promotion.id}`}
                  onPress={() => void loadPromotionDetailState(promotion.id)}
                  style={styles.promotionRow}
                >
                  <Text style={styles.promotionName}>{promotion.name}</Text>
                  <Text style={styles.bodyText}>{promotion.codeNormalized} · {t(`promotions.filters.${promotion.status === 'DELETED' ? 'INACTIVE' : promotion.status}`)}</Text>
                  <Text style={styles.bodyText}>{promotion.serviceScope === 'ALL' ? t('promotions.form.scopeAll') : t('promotions.form.scopeSelected')}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </AppCard>

        {selectedPromotion ? (
          <AppCard testID="promotions-detail-card" variant="outlined">
            <SectionHeader title={t('promotions.detailTitle')} />
            {detailLoading ? (
              <View testID="promotions-detail-loading" style={styles.centered}>
                <ActivityIndicator size="small" color={tokens.colors.primary} />
              </View>
            ) : null}
            <Text style={styles.promotionName}>{selectedPromotion.name}</Text>
            <Text style={styles.bodyText}>{selectedPromotion.codeNormalized}</Text>
            <Text style={styles.bodyText}>{t('promotions.detail.discount', { amount: selectedPromotion.discountType === 'FIXED' ? formatMoney(selectedPromotion.fixedDiscountCents) : `${selectedPromotion.percentageBasisPoints ?? 0} bp` })}</Text>
            <Text style={styles.bodyText}>{t('promotions.detail.usage', { active: selectedPromotion.activeRedemptionCount, total: selectedPromotion.usageCount })}</Text>
            <Text style={styles.bodyText}>{t('promotions.detail.window', { startsAt: selectedPromotion.startsAt.slice(0, 10), endsAt: selectedPromotion.endsAt.slice(0, 10) })}</Text>
            <Text style={styles.bodyText}>{t('promotions.detail.immutableHint')}</Text>
            <Text style={styles.bodyText}>
              {selectedPromotion.serviceScope === 'ALL'
                ? t('promotions.form.scopeAll')
                : `${t('promotions.form.scopeSelected')}: ${selectedPromotion.services.map((service) => service.name).join(', ')}`}
            </Text>
            <Text style={styles.bodyText}>
              {[
                selectedPromotion.appliesToPublicBookings ? t('promotions.form.public') : null,
                selectedPromotion.appliesToStaffBookings ? t('promotions.form.staff') : null,
              ].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.buttonRow}>
              <AppButton testID="promotions-detail-edit" title={t('common.actions.edit')} variant="secondary" onPress={() => { setForm(buildFormFromPromotion(selectedPromotion)); setShowForm(true); setMessage(null); }} />
              <AppButton testID="promotions-detail-toggle-active" title={selectedPromotion.isActive ? t('common.actions.deactivate') : t('common.actions.reactivate')} variant="secondary" onPress={() => {
                void setPromotionActive(getTokenRef.current, context.barbershopId!, selectedPromotion.id, !selectedPromotion.isActive)
                  .then(() => loadPromotionDetailState(selectedPromotion.id))
                  .then(() => load())
                  .catch((nextError) => setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi')));
              }} />
            </View>
            <SectionHeader title={t('promotions.redemptionsTitle')} />
            {redemptions.length === 0 ? (
              <Text testID="promotions-redemptions-empty" style={styles.bodyText}>{t('promotions.redemptionsEmpty')}</Text>
            ) : (
              <View testID="promotions-redemptions-list" style={styles.selectionList}>
                {redemptions.map((redemption, index) => (
                  <View key={`${redemption.customerDisplayName}-${index}`} testID={`promotions-redemption-${index}`} style={styles.redemptionRow}>
                    <Text style={styles.bodyText}>{redemption.customerDisplayName}</Text>
                    <Text style={styles.bodyText}>{redemption.serviceName} · {formatMoney(redemption.finalPriceCents)}</Text>
                    <Text style={styles.bodyText}>{redemption.status}</Text>
                  </View>
                ))}
              </View>
            )}
          </AppCard>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: tokens.spacing[4],
    paddingBottom: tokens.spacing[6],
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing[4],
  },
  blockedTitle: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing[1],
  },
  bodyText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  helperText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
  },
  successText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.success,
  },
  unsavedText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.warning,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  filterChip: {
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  filterChipActive: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.surfaceVariant,
  },
  filterChipText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  filterChipTextActive: {
    color: tokens.colors.primaryLight,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[3],
  },
  selectionList: {
    gap: tokens.spacing[3],
  },
  serviceChip: {
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  serviceChipActive: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.surfaceVariant,
  },
  serviceChipText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  serviceChipTextActive: {
    color: tokens.colors.primaryLight,
  },
  promotionRow: {
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[1],
    padding: tokens.spacing[3],
  },
  promotionName: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
  },
  appointmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[2],
    alignItems: 'center',
  },
  appointmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  appointmentTitle: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
  },
  redemptionRow: {
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[1],
    padding: tokens.spacing[3],
  },
});

function resolveLoyaltySaveError(
  safeCode: MobileQaSafeErrorCode,
  error: unknown,
  t: (key: string) => string,
): string {
  if (
    safeCode === 'AUTH_TOKEN_ERROR'
    || safeCode === 'AUTH_TOKEN_UNAVAILABLE'
    || safeCode === 'API_401'
  ) {
    return t('promotions.loyalty.errors.authenticationRequired');
  }
  if (safeCode === 'CONFIG_ERROR') {
    return t('promotions.loyalty.errors.configuration');
  }
  if (
    safeCode === 'NETWORK_ERROR'
    || safeCode === 'TIMEOUT'
    || safeCode === 'ABORTED'
  ) {
    return t('promotions.loyalty.errors.network');
  }
  return error instanceof Error ? error.message : t('errors.unknownApi');
}
