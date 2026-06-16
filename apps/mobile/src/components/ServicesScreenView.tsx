/**
 * ServicesScreenView — pure presenter for the OWNER-only service catalog.
 *
 * All business logic (state, handlers, validation, store calls) lives in
 * `app/(tabs)/services.tsx`. This component only renders the screen and
 * forwards user actions via callbacks.
 */
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

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
  const refreshControl = (
    <RefreshControl
      refreshing={isServicesLoading}
      onRefresh={onRefresh}
      testID="services-refresh"
    />
  );

  // Context-level states
  if (isContextLoading && !context) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="services-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>Loading your context…</Text>
        </AppCard>
      </Screen>
    );
  }

  if (contextError && !context) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="services-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!context) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <EmptyState
          testID="services-no-context"
          title="No context available"
          message="No context available yet."
        />
      </Screen>
    );
  }

  if (!isOwner) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <EmptyState
          testID="services-blocked"
          title="Owner access only"
          message="Only barbershop owners can manage the service catalog."
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable refreshControl={refreshControl}>
      <ScreenHeader
        title="Services"
        subtitle="Your barbershop service catalog."
      />

      {/* Create service */}
      {!showCreateForm ? (
        <AppButton
          testID="services-add-button"
          title="+ Add Service"
          onPress={onShowCreateForm}
        />
      ) : (
        <AppCard testID="services-create-form">
          <FormSection title="New Service">
            <AppTextInput
              testID="services-create-name"
              label="Name"
              placeholder="e.g. Classic Cut"
              value={createForm.name}
              onChangeText={onCreateNameChange}
            />
            <AppTextInput
              testID="services-create-price"
              label="Price (ARS)"
              placeholder="e.g. 5000.50"
              keyboardType="decimal-pad"
              value={createForm.priceInput}
              onChangeText={onCreatePriceChange}
            />
            <AppTextInput
              testID="services-create-duration"
              label="Duration (minutes)"
              placeholder="e.g. 30"
              keyboardType="number-pad"
              value={createForm.durationInput}
              onChangeText={onCreateDurationChange}
            />
            <AppTextInput
              testID="services-create-description"
              label="Description (optional)"
              placeholder="e.g. Scissors and clippers"
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
              title={createForm.isCreating ? 'Creating…' : 'Create Service'}
              onPress={onCreate}
              loading={createForm.isCreating}
              disabled={createForm.isCreating}
            />
            <AppButton
              testID="services-create-cancel"
              title="Cancel"
              variant="ghost"
              onPress={onCancelCreate}
              disabled={createForm.isCreating}
            />
          </FormSection>
        </AppCard>
      )}

      {/* Search */}
      <AppCard>
        <View style={styles.searchRow}>
          <AppTextInput
            testID="services-search-input"
            placeholder="Search services by name…"
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCorrect={false}
            style={styles.searchInput}
          />
          {searchQuery.trim().length > 0 && (
            <AppButton
              testID="services-search-clear"
              title="Clear"
              variant="ghost"
              onPress={onClearSearch}
              accessibilityLabel="Clear service search"
            />
          )}
        </View>
      </AppCard>

      {/* Filters */}
      <View testID="services-filter-bar" style={styles.filterBar}>
        {SERVICE_STATUS_FILTERS.map((filter) => (
          <AppButton
            key={filter}
            testID={`services-filter-${filter.toLowerCase()}`}
            title={
              filter === 'ACTIVE'
                ? `Active (${statusCounts.ACTIVE})`
                : filter === 'INACTIVE'
                  ? `Inactive (${statusCounts.INACTIVE})`
                  : `All (${statusCounts.ALL})`
            }
            variant={statusFilter === filter ? 'primary' : 'secondary'}
            onPress={() => onFilterChange(filter)}
          />
        ))}
      </View>

      {/* Service list states */}
      {isServicesLoading && (
        <AppCard style={styles.centeredCard}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.helperText}>Loading services…</Text>
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
          title="No services found"
          message={
            searchQuery.trim().length > 0
              ? 'No services match your search.'
              : statusFilter === 'ACTIVE'
                ? 'No active services.'
                : statusFilter === 'INACTIVE'
                  ? 'No inactive services.'
                  : 'No services yet.'
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
                <FormSection title="Edit Service">
                  <AppTextInput
                    testID={`service-edit-name-${service.id}`}
                    label="Name"
                    value={editForm.name}
                    onChangeText={onEditNameChange}
                  />
                  <AppTextInput
                    testID={`service-edit-price-${service.id}`}
                    label="Price (ARS)"
                    keyboardType="decimal-pad"
                    value={editForm.priceInput}
                    onChangeText={onEditPriceChange}
                  />
                  <AppTextInput
                    testID={`service-edit-duration-${service.id}`}
                    label="Duration (minutes)"
                    keyboardType="number-pad"
                    value={editForm.durationInput}
                    onChangeText={onEditDurationChange}
                  />
                  <AppTextInput
                    testID={`service-edit-description-${service.id}`}
                    label="Description (optional)"
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
                    title={editForm.isUpdating ? 'Saving…' : 'Save Changes'}
                    onPress={onUpdate}
                    loading={editForm.isUpdating}
                    disabled={editForm.isUpdating}
                  />
                  <AppButton
                    testID={`service-edit-cancel-${service.id}`}
                    title="Cancel"
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
                    {service.durationMinutes} min
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
                    title="Edit"
                    variant="ghost"
                    onPress={() => onStartEditing(service)}
                  />
                  <AppButton
                    testID={`service-toggle-${service.id}`}
                    title={service.isActive ? 'Deactivate' : 'Reactivate'}
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
        title="Back to Home"
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
    gap: tokens.spacing[2],
  },
});
