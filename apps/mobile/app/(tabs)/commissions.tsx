import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppButton, AppCard, EmptyState, MetricCard, Screen, ScreenHeader, SectionHeader } from '@/components/ui/index.js';
import {
  createCommissionLiquidation,
  fetchCommissionLiquidation,
  fetchCommissionLiquidations,
  fetchCommissionOverview,
  fetchCommissionSettings,
  markCommissionLiquidationPaid,
  previewCommissionLiquidation,
  saveCommissionSettings,
  voidCommissionLiquidation,
} from '@/lib/commissions.js';
import { formatCurrencyMinorUnits, formatLocalizedDate } from '@/i18n/formatters.js';
import { useContextStore } from '@/lib/store.js';
import { DEFAULT_BARBERSHOP_TIMEZONE, getTodayDateStringInTimeZone } from '@/lib/format.js';
import type { CommissionLiquidation, CommissionLiquidationPreview, CommissionOverview, CommissionSettings } from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

function monthRange(anchor: string) {
  const [year, month] = anchor.split('-').map(Number) as [number, number];
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { dateFrom: `${year}-${String(month).padStart(2, '0')}-01`, dateTo: `${year}-${String(month).padStart(2, '0')}-${end}` };
}

function moveMonth(anchor: string, amount: number) {
  const [year, month] = anchor.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 7);
}

function currentMonth(timezone: string) {
  return getTodayDateStringInTimeZone(timezone).slice(0, 7);
}

function money(value: number) {
  return formatCurrencyMinorUnits(value, { currency: 'ARS' });
}

export default function CommissionsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useTranslation();
  const context = useContextStore((state) => state.context);
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; });

  const timezone = context?.barbershopTimezone ?? DEFAULT_BARBERSHOP_TIMEZONE;
  const [anchorMonth, setAnchorMonth] = useState(() => currentMonth(timezone));
  const range = useMemo(() => monthRange(anchorMonth), [anchorMonth]);
  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [defaultRate, setDefaultRate] = useState('0');
  const [overrideRate, setOverrideRate] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [overview, setOverview] = useState<CommissionOverview | null>(null);
  const [liquidations, setLiquidations] = useState<CommissionLiquidation[]>([]);
  const [liquidationDetail, setLiquidationDetail] = useState<CommissionLiquidation | null>(null);
  const [preview, setPreview] = useState<CommissionLiquidationPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const hasFocusedOnceRef = useRef(false);

  const role = context?.role;
  const activeEmployees = settings?.employees.filter((employee) => employee.isActive) ?? [];

  const load = useCallback(async (refreshing = false) => {
    if (!context?.barbershopId || !getTokenRef.current || (role !== 'OWNER' && role !== 'BARBER')) {
      setIsLoading(false);
      return;
    }
    refreshing ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      let targetEmployeeId = employeeId;
      if (role === 'OWNER') {
        const nextSettings = await fetchCommissionSettings(getTokenRef.current, context.barbershopId);
        setSettings(nextSettings);
        setDefaultRate(String(nextSettings.defaultPercentageBasisPoints / 100));
        if (!targetEmployeeId || !nextSettings.employees.some((item) => item.employeeId === targetEmployeeId && item.isActive)) {
          targetEmployeeId = nextSettings.employees.find((item) => item.isActive)?.employeeId ?? null;
          setEmployeeId(targetEmployeeId);
        }
        const selected = nextSettings.employees.find((item) => item.employeeId === targetEmployeeId);
        setOverrideRate(selected?.overridePercentageBasisPoints === null || selected?.overridePercentageBasisPoints === undefined ? '' : String(selected.overridePercentageBasisPoints / 100));
      } else {
        targetEmployeeId = context.employeeId;
      }

      if (!targetEmployeeId && role === 'OWNER') {
        setOverview(null); setLiquidations([]); return;
      }
      const [nextOverview, nextLiquidations] = await Promise.all([
        fetchCommissionOverview(getTokenRef.current, context.barbershopId, { role, employeeId: targetEmployeeId ?? undefined, ...range }),
        fetchCommissionLiquidations(getTokenRef.current, context.barbershopId, role === 'OWNER' ? targetEmployeeId ?? undefined : undefined),
      ]);
      setOverview(nextOverview);
      setLiquidations(nextLiquidations);
      setLiquidationDetail(null);
      setPreview(null);
    } catch (caught) {
      setOverview(null);
      setLiquidations([]);
      setLiquidationDetail(null);
      setPreview(null);
      setError(caught instanceof Error ? caught.message : t('commissions.errors.load'));
    } finally {
      setIsLoading(false); setIsRefreshing(false);
    }
  }, [context?.barbershopId, context?.employeeId, employeeId, range, role, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setPreview(null);
    setLiquidationDetail(null);
    pendingKeyRef.current = null;
  }, [range.dateFrom, range.dateTo]);
  useFocusEffect(useCallback(() => {
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return undefined;
    }
    void load();
    return undefined;
  }, [load]));

  const selectEmployee = (id: string) => {
    const employee = settings?.employees.find((item) => item.employeeId === id);
    setEmployeeId(id);
    setOverrideRate(employee?.overridePercentageBasisPoints === null || employee?.overridePercentageBasisPoints === undefined ? '' : String(employee.overridePercentageBasisPoints / 100));
    setPreview(null); setLiquidationDetail(null); pendingKeyRef.current = null;
  };

  const toggleLiquidationDetail = async (item: CommissionLiquidation) => {
    if (!context?.barbershopId || !getTokenRef.current || isMutating) return;
    if (liquidationDetail?.id === item.id) {
      setLiquidationDetail(null);
      return;
    }
    setIsMutating(true); setError(null);
    try {
      setLiquidationDetail(await fetchCommissionLiquidation(getTokenRef.current, context.barbershopId, item.id));
    } catch (caught) {
      setLiquidationDetail(null);
      setError(caught instanceof Error ? caught.message : t('commissions.errors.load'));
    } finally { setIsMutating(false); }
  };

  const saveRates = async () => {
    if (!context?.barbershopId || !settings || !employeeId || !getTokenRef.current || isMutating) return;
    const defaultBasisPoints = Math.round(Number(defaultRate) * 100);
    const overrideBasisPoints = overrideRate.trim() ? Math.round(Number(overrideRate) * 100) : null;
    if (!Number.isFinite(defaultBasisPoints) || defaultBasisPoints < 0 || defaultBasisPoints > 10_000 || (overrideBasisPoints !== null && (!Number.isFinite(overrideBasisPoints) || overrideBasisPoints < 0 || overrideBasisPoints > 10_000))) {
      setError(t('commissions.errors.rate')); return;
    }
    setIsMutating(true); setError(null); setMessage(null);
    try {
      const next = await saveCommissionSettings(getTokenRef.current, context.barbershopId, {
        defaultPercentageBasisPoints: defaultBasisPoints,
        employeeOverrides: [{ employeeId, percentageBasisPoints: overrideBasisPoints }],
      });
      setSettings(next); setMessage(t('commissions.messages.saved'));
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('commissions.errors.save')); }
    finally { setIsMutating(false); }
  };

  const loadPreview = async () => {
    if (!context?.barbershopId || !employeeId || !getTokenRef.current || isMutating) return;
    setIsMutating(true); setError(null); setPreview(null);
    try { setPreview(await previewCommissionLiquidation(getTokenRef.current, context.barbershopId, { employeeId, ...range })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('commissions.errors.preview')); }
    finally { setIsMutating(false); }
  };

  const confirmCreate = () => {
    if (!preview || preview.entryCount === 0) return;
    Alert.alert(t('commissions.liquidations.confirmTitle'), t('commissions.liquidations.confirmMessage', { count: preview.entryCount, amount: money(preview.commissionAmountCents) }), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      { text: t('common.actions.create'), onPress: () => void createLiquidation() },
    ]);
  };

  const createLiquidation = async () => {
    if (!context?.barbershopId || !employeeId || !getTokenRef.current || isMutating) return;
    pendingKeyRef.current ??= `mobile-${employeeId}-${range.dateFrom}-${range.dateTo}-${Date.now()}`;
    setIsMutating(true); setError(null);
    try {
      await createCommissionLiquidation(getTokenRef.current, context.barbershopId, { employeeId, ...range, idempotencyKey: pendingKeyRef.current });
      pendingKeyRef.current = null; setPreview(null); setMessage(t('commissions.messages.created')); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('commissions.errors.create')); }
    finally { setIsMutating(false); }
  };

  const mutateLiquidation = async (item: CommissionLiquidation, action: 'pay' | 'void') => {
    if (!context?.barbershopId || !getTokenRef.current || isMutating) return;
    setIsMutating(true); setError(null);
    try {
      if (action === 'pay') await markCommissionLiquidationPaid(getTokenRef.current, context.barbershopId, item.id);
      else await voidCommissionLiquidation(getTokenRef.current, context.barbershopId, item.id, t('commissions.liquidations.voidReason'));
      setMessage(action === 'pay' ? t('commissions.messages.paid') : t('commissions.messages.voided'));
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t(`commissions.errors.${action}`)); }
    finally { setIsMutating(false); }
  };

  if (!isLoaded || !isSignedIn) return null;
  if (!context?.barbershopId || (role !== 'OWNER' && role !== 'BARBER')) {
    return <Screen><EmptyState title={t('commissions.blockedTitle')} message={t('commissions.blockedMessage')} /></Screen>;
  }
  if (isLoading && !overview) return <Screen><View style={styles.center}><ActivityIndicator size="large" /><Text>{t('common.states.genericLoading')}</Text></View></Screen>;

  return (
    <Screen scrollable testID="commissions-screen" refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} />}>
      <ScreenHeader title={role === 'OWNER' ? t('commissions.title') : t('commissions.myTitle')} subtitle={t('commissions.subtitle')} />
      <View style={styles.stack}>
        {error ? <AppCard testID="commissions-error" variant="outlined"><Text style={styles.error}>{error}</Text><AppButton title={t('common.actions.retry')} onPress={() => void load()} variant="secondary" /></AppCard> : null}
        {message ? <AppCard testID="commissions-message"><Text style={styles.success}>{message}</Text></AppCard> : null}

        {role === 'OWNER' ? <AppCard variant="outlined"><SectionHeader title={t('commissions.barberTitle')} /><View style={styles.wrap}>{activeEmployees.map((employee) => <AppButton key={employee.employeeId} title={employee.name} size="sm" variant={employeeId === employee.employeeId ? 'primary' : 'ghost'} onPress={() => selectEmployee(employee.employeeId)} />)}</View></AppCard> : null}

        <AppCard variant="outlined"><SectionHeader title={t('commissions.periodTitle')} /><View style={styles.row}><AppButton title={t('common.actions.previous')} size="sm" variant="ghost" onPress={() => setAnchorMonth(moveMonth(anchorMonth, -1))} /><Text style={styles.period}>{range.dateFrom.slice(0, 7)}</Text><AppButton title={t('common.actions.next')} size="sm" variant="ghost" onPress={() => setAnchorMonth(moveMonth(anchorMonth, 1))} /></View></AppCard>

        {overview ? <><View style={styles.metrics}><MetricCard label={t('commissions.metrics.gross')} value={money(overview.summary.grossAmountCents)} /><MetricCard label={t('commissions.metrics.accrued')} value={money(overview.summary.commissionAmountCents)} /><MetricCard label={t('commissions.metrics.unsettled')} value={money(overview.summary.unsettledAmountCents)} /><MetricCard label={t('commissions.metrics.paid')} value={money(overview.summary.paidAmountCents)} /></View>
          <AppCard variant="outlined"><SectionHeader title={t('commissions.workTitle')} />{overview.items.length === 0 ? <EmptyState title={t('commissions.emptyTitle')} message={t('commissions.emptyMessage')} /> : overview.items.map((item) => <View key={item.id} style={styles.item}><View style={styles.itemText}><Text style={styles.itemTitle}>{item.appointment.clientName} · {item.appointment.serviceName}</Text><Text style={styles.meta}>{formatLocalizedDate(item.earnedAt, { timeZone: overview.timezone })} · {(item.percentageBasisPoints / 100).toFixed(2)}% · {item.liquidation?.status ?? t('commissions.unsettled')}</Text></View><Text style={styles.amount}>{money(item.commissionAmountCents)}</Text></View>)}</AppCard>
        </> : null}

        {role === 'OWNER' && settings && employeeId ? <AppCard variant="outlined"><SectionHeader title={t('commissions.settingsTitle')} /><Text style={styles.label}>{t('commissions.defaultRate')}</Text><TextInput testID="commission-default-rate" style={styles.input} keyboardType="decimal-pad" value={defaultRate} onChangeText={setDefaultRate} /><Text style={styles.label}>{t('commissions.overrideRate')}</Text><TextInput testID="commission-override-rate" style={styles.input} keyboardType="decimal-pad" value={overrideRate} placeholder={t('commissions.inherit')} onChangeText={setOverrideRate} /><AppButton testID="commission-save-rates" title={t('common.actions.saveChanges')} loading={isMutating} disabled={isMutating} onPress={() => void saveRates()} /></AppCard> : null}

        {role === 'OWNER' && employeeId ? <AppCard variant="outlined"><SectionHeader title={t('commissions.liquidations.createTitle')} />{preview ? <Text style={styles.meta}>{t('commissions.liquidations.preview', { count: preview.entryCount, amount: money(preview.commissionAmountCents) })}</Text> : null}<View style={styles.row}><AppButton testID="commission-preview" title={t('commissions.liquidations.previewAction')} variant="secondary" disabled={isMutating} onPress={() => void loadPreview()} /><AppButton testID="commission-create" title={t('commissions.liquidations.createAction')} disabled={isMutating || !preview || preview.entryCount === 0} onPress={confirmCreate} /></View></AppCard> : null}

        <AppCard variant="outlined"><SectionHeader title={t('commissions.liquidations.historyTitle')} />{liquidations.length === 0 ? <Text style={styles.meta}>{t('commissions.liquidations.empty')}</Text> : liquidations.map((item) => <View key={item.id} style={styles.liquidation}><View style={styles.item}><View style={styles.itemText}><Text style={styles.itemTitle}>{money(item.commissionAmountCents)} · {item.status}</Text><Text style={styles.meta}>{item.entryCount} · {formatLocalizedDate(item.createdAt, { timeZone: timezone })}</Text><AppButton testID={`commission-liquidation-detail-${item.id}`} title={t(liquidationDetail?.id === item.id ? 'commissions.liquidations.hideDetails' : 'commissions.liquidations.details')} size="sm" variant="ghost" disabled={isMutating} onPress={() => void toggleLiquidationDetail(item)} /></View>{role === 'OWNER' && item.status === 'OPEN' ? <View style={styles.actionStack}><AppButton title={t('commissions.liquidations.pay')} size="sm" disabled={isMutating} onPress={() => Alert.alert(t('commissions.liquidations.pay'), t('commissions.liquidations.payConfirm'), [{ text: t('common.actions.cancel'), style: 'cancel' }, { text: t('commissions.liquidations.pay'), onPress: () => void mutateLiquidation(item, 'pay') }])} /><AppButton title={t('commissions.liquidations.void')} size="sm" variant="ghost" disabled={isMutating} onPress={() => Alert.alert(t('commissions.liquidations.void'), t('commissions.liquidations.voidConfirm'), [{ text: t('common.actions.cancel'), style: 'cancel' }, { text: t('commissions.liquidations.void'), style: 'destructive', onPress: () => void mutateLiquidation(item, 'void') }])} /></View> : null}</View>{liquidationDetail?.id === item.id ? <View testID={`commission-liquidation-entries-${item.id}`} style={styles.detail}>{liquidationDetail.entries?.map((entry) => <View key={entry.id} style={styles.item}><View style={styles.itemText}><Text style={styles.itemTitle}>{entry.appointment.clientName} · {entry.appointment.serviceName}</Text><Text style={styles.meta}>{formatLocalizedDate(entry.earnedAt, { timeZone: timezone })}</Text></View><Text style={styles.amount}>{money(entry.commissionAmountCents)}</Text></View>)}</View> : null}</View>)}</AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: tokens.layout.sectionContentGap }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing[2], flexWrap: 'wrap' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] }, period: { ...tokens.typography.variant.label, color: tokens.colors.textPrimary },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing[2], paddingVertical: tokens.spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.colors.border },
  itemText: { flex: 1, gap: tokens.spacing[1] }, itemTitle: { ...tokens.typography.variant.label, color: tokens.colors.textPrimary }, meta: { ...tokens.typography.variant.bodySmall, color: tokens.colors.textSecondary }, amount: { ...tokens.typography.variant.label, color: tokens.colors.primary },
  label: { ...tokens.typography.variant.bodySmall, color: tokens.colors.textSecondary }, input: { borderWidth: 1, borderColor: tokens.colors.border, borderRadius: tokens.radius.md, color: tokens.colors.textPrimary, padding: tokens.spacing[3] },
  liquidation: { gap: tokens.spacing[2] }, detail: { paddingLeft: tokens.spacing[3] }, actionStack: { gap: tokens.spacing[1] }, error: { color: tokens.colors.error }, success: { color: tokens.colors.success },
});
