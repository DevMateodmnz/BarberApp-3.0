/**
 * ServicesScreenView — pure presenter for the OWNER-only service catalog.
 */
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  MoneyText,
  Screen,
  ScreenHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import type { Service } from '@/lib/types.js';
import {
  SERVICE_STATUS_FILTERS,
  type ServiceStatusCounts,
  type ServiceStatusFilter,
} from '@/lib/serviceFilters.js';

export interface CreateFormState {
  name: string;
  priceInput: string;
  durationInput: string;
  description: string;
  error: string | null;
  isCreating: boolean;
}

export interface EditFormState {
  serviceId: string | null;
  name: string;
  priceInput: string;
  durationInput: string;
  description: string;
  error: string | null;
  isUpdating: boolean;
}

export interface ServicesScreenViewProps {
  isContextLoading: boolean;
  contextError: string | null;
  context: { role: string } | null;
  isOwner: boolean;
  showCreateForm: boolean;
  createForm: CreateFormState;
  editForm: EditFormState;
  searchQuery: string;
  statusFilter: ServiceStatusFilter;
  statusCounts: ServiceStatusCounts;
  isServicesLoading: boolean;
  servicesError: string | null;
  visibleServices: Service[];
  onRefresh: () => void;
  onBack: () => void;
  onShowCreateForm: () => void;
  onCancelCreate: () => void;
  onCreate: () => void;
  onCreateNameChange: (text: string) => void;
  onCreatePriceChange: (text: string) => void;
  onCreateDurationChange: (text: string) => void;
  onCreateDescriptionChange: (text: string) => void;
  onSearchChange: (text: string) => void;
  onClearSearch: () => void;
  onFilterChange: (filter: ServiceStatusFilter) => void;
  onStartEditing: (service: Service) => void;
  onCancelEditing: () => void;
  onUpdate: () => void;
  onEditNameChange: (text: string) => void;
  onEditPriceChange: (text: string) => void;
  onEditDurationChange: (text: string) => void;
  onEditDescriptionChange: (text: string) => void;
  onToggleActive: (service: Service) => void;
}

export function ServicesScreenView({
  isContextLoading,
  contextError,
  context,
  isOwner,
  showCreateForm,
  createForm,
  editForm,
  searchQuery,
  statusFilter,
  statusCounts,
  isServicesLoading,
  servicesError,
  visibleServices,
  onRefresh,
  onBack,
  onShowCreateForm,
  onCancelCreate,
  onCreate,
  onCreateNameChange,
  onCreatePriceChange,
  onCreateDurationChange,
  onCreateDescriptionChange,
  onSearchChange,
  onClearSearch,
  onFilterChange,
  onStartEditing,
  onCancelEditing,
  onUpdate,
  onEditNameChange,
  onEditPriceChange,
  onEditDurationChange,
  onEditDescriptionChange,
  onToggleActive,
}: ServicesScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isServicesLoading}
      onRefresh={onRefresh}
      testID="services-refresh"
    />
  );

  if (isContextLoading && !context) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <AppCard testID="services-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (contextError && !context) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <AppCard testID="services-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!context) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <EmptyState
          testID="services-no-context"
          title={t('common.states.noContextTitle')}
          message={t('common.states.noContextMessage')}
        />
      </Screen>
    );
  }

  if (!isOwner) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <EmptyState
          testID="services-blocked"
          title={t('services.blockedTitle')}
          message={t('services.blockedMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable keyboardAware refreshControl={refreshControl}>
      <ScreenHeader
        title={t('services.title')}
        subtitle={t('services.subtitle')}
      />

      {!showCreateForm ? (
        <AppButton
          testID="services-add-button"
          title={t('services.addButton')}
          onPress={onShowCreateForm}
        />
      ) : (
        <AppCard testID="services-create-form">
          <FormSection title={t('services.newServiceTitle')}>
            <AppTextInput
              testID="services-create-name"
              label={t('services.form.nameLabel')}
              placeholder={t('services.form.namePlaceholder')}
              value={createForm.name}
              onChangeText={onCreateNameChange}
            />
            <AppTextInput
              testID="services-create-price"
              label={t('common.labels.priceARS')}
              placeholder={t('services.form.pricePlaceholder')}
              keyboardType="decimal-pad"
              value={createForm.priceInput}
              onChangeText={onCreatePriceChange}
            />
            <AppTextInput
              testID="services-create-duration"
              label={t('common.labels.durationMinutes')}
              placeholder={t('services.form.durationPlaceholder')}
              keyboardType="number-pad"
              value={createForm.durationInput}
              onChangeText={onCreateDurationChange}
            />
            <AppTextInput
              testID="services-create-description"
              label={t('common.labels.descriptionOptional')}
              placeholder={t('services.form.descriptionPlaceholder')}
              value={createForm.description}
              onChangeText={onCreateDescriptionChange}
            />

            {createForm.error && (
              <Text testID="services-create-error" style={styles.errorText}>
                {createForm.error}
              </Text>
            )}

            <AppButton
              testID="services-create-submit"
              title={t('services.form.createSubmit')}
              onPress={onCreate}
              loading={createForm.isCreating}
              loadingText={t('services.form.creating')}
              disabled={createForm.isCreating}
            />
            <AppButton
              testID="services-create-cancel"
              title={t('common.actions.cancel')}
              variant="ghost"
              onPress={onCancelCreate}
              disabled={createForm.isCreating}
            />
          </FormSection>
        </AppCard>
      )}

      <AppCard>
        <View style={styles.searchRow}>
          <AppTextInput
            testID="services-search-input"
            placeholder={t('services.searchPlaceholder')}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCorrect={false}
            style={styles.searchInput}
          />
          {searchQuery.trim().length > 0 && (
            <AppButton
              testID="services-search-clear"
              title={t('services.clearSearch')}
              variant="ghost"
              onPress={onClearSearch}
              accessibilityLabel={t('accessibility.clearServiceSearch')}
            />
          )}
        </View>
      </AppCard>

      <View testID="services-filter-bar" style={styles.filterBar}>
        {SERVICE_STATUS_FILTERS.map((filter) => (
          <AppButton
            key={filter}
            testID={`services-filter-${filter.toLowerCase()}`}
            title={
              filter === 'ACTIVE'
                ? t('services.filters.active', { count: statusCounts.ACTIVE })
                : filter === 'INACTIVE'
                  ? t('services.filters.inactive', { count: statusCounts.INACTIVE })
                  : t('services.filters.all', { count: statusCounts.ALL })
            }
            variant={statusFilter === filter ? 'primary' : 'secondary'}
            onPress={() => onFilterChange(filter)}
          />
        ))}
      </View>

      {isServicesLoading && (
        <AppCard style={styles.centeredCard}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('services.loading')}</Text>
        </AppCard>
      )}

      {servicesError && (
        <AppCard testID="services-error">
          <Text style={styles.errorText}>{servicesError}</Text>
        </AppCard>
      )}

      {!isServicesLoading && !servicesError && visibleServices.length === 0 && (
        <EmptyState
          testID="services-empty"
          title={t('services.emptyTitle')}
          message={
            searchQuery.trim().length > 0
              ? t('services.emptySearchMessage')
              : statusFilter === 'ACTIVE'
                ? t('services.emptyActiveMessage')
                : statusFilter === 'INACTIVE'
                  ? t('services.emptyInactiveMessage')
                  : t('services.emptyAllMessage')
          }
        />
      )}

      {!isServicesLoading && !servicesError && visibleServices.length > 0 && (
        <AppCard testID="services-list">
          {visibleServices.map((service) =>
            editForm.serviceId === service.id ? (
              <AppCard
                key={service.id}
                testID={`service-edit-${service.id}`}
                style={styles.editCard}
              >
                <FormSection title={t('services.editServiceTitle')}>
                  <AppTextInput
                    testID={`service-edit-name-${service.id}`}
                    label={t('services.form.nameLabel')}
                    value={editForm.name}
                    onChangeText={onEditNameChange}
                  />
                  <AppTextInput
                    testID={`service-edit-price-${service.id}`}
                    label={t('common.labels.priceARS')}
                    keyboardType="decimal-pad"
                    value={editForm.priceInput}
                    onChangeText={onEditPriceChange}
                  />
                  <AppTextInput
                    testID={`service-edit-duration-${service.id}`}
                    label={t('common.labels.durationMinutes')}
                    keyboardType="number-pad"
                    value={editForm.durationInput}
                    onChangeText={onEditDurationChange}
                  />
                  <AppTextInput
                    testID={`service-edit-description-${service.id}`}
                    label={t('common.labels.descriptionOptional')}
                    value={editForm.description}
                    onChangeText={onEditDescriptionChange}
                  />

                  {editForm.error && (
                    <Text
                      testID={`service-edit-error-${service.id}`}
                      style={styles.errorText}
                    >
                      {editForm.error}
                    </Text>
                  )}

                  <AppButton
                    testID={`service-edit-submit-${service.id}`}
                    title={t('services.form.editSubmit')}
                    onPress={onUpdate}
                    loading={editForm.isUpdating}
                    loadingText={t('services.form.saving')}
                    disabled={editForm.isUpdating}
                  />
                  <AppButton
                    testID={`service-edit-cancel-${service.id}`}
                    title={t('common.actions.cancel')}
                    variant="ghost"
                    onPress={onCancelEditing}
                    disabled={editForm.isUpdating}
                  />
                </FormSection>
              </AppCard>
            ) : (
              <AppCard
                key={service.id}
                testID={`service-${service.id}`}
                style={styles.serviceRow}
              >
                <View style={styles.serviceRowHeader}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <MoneyText priceCents={service.priceCents} />
                </View>
                <View style={styles.serviceRowMeta}>
                  <Text style={styles.serviceDuration}>
                    {t('services.durationLabel', { count: service.durationMinutes })}
                  </Text>
                  <StatusBadge
                    status={service.isActive ? 'ACTIVE' : 'INACTIVE'}
                  />
                </View>
                {service.description && (
                  <Text style={styles.serviceDescription} numberOfLines={2}>
                    {service.description}
                  </Text>
                )}
                <View style={styles.serviceRowActions}>
                  <AppButton
                    testID={`service-edit-button-${service.id}`}
                    title={t('common.actions.edit')}
                    variant="ghost"
                    onPress={() => onStartEditing(service)}
                  />
                  <AppButton
                    testID={`service-toggle-${service.id}`}
                    title={service.isActive ? t('common.actions.deactivate') : t('common.actions.reactivate')}
                    variant={service.isActive ? 'danger' : 'secondary'}
                    onPress={() => onToggleActive(service)}
                  />
                </View>
              </AppCard>
            ),
          )}
        </AppCard>
      )}

      <AppButton
        testID="services-back"
        title={t('common.actions.backToHome')}
        variant="ghost"
        onPress={onBack}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing[3],
  },
  helperText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  searchInput: {
    flex: 1,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  editCard: {
    backgroundColor: tokens.colors.elevatedSurface,
  },
  serviceRow: {
    gap: tokens.spacing[2],
  },
  serviceRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  serviceName: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    flex: 1,
  },
  serviceRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    flexWrap: 'wrap',
  },
  serviceDuration: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  serviceDescription: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    fontStyle: 'italic',
  },
  serviceRowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
});
