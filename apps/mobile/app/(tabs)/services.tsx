/**
 * Services screen — OWNER-only barbershop service catalog.
 *
 * Hidden route (href: null in _layout.tsx). Accessible via
 * "View Services" card on Home for OWNER users with a barbershop.
 * OWNER can view, create, and edit services.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useContextStore } from '@/lib/store.js';
import { useServicesStore } from '@/lib/servicesStore.js';
import {
  formatCentsForInput,
} from '@/lib/format.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { filterServicesByStatus, filterServicesByName, getServiceStatusCounts, type ServiceStatusFilter } from '@/lib/serviceFilters.js';
import { validateServiceForm } from '@/lib/serviceForm.js';
import { ServicesScreenView } from '@/components/ServicesScreenView.js';
import type { Service } from '@/lib/types.js';

export default function ServicesScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  // Stabilize getToken via ref — Clerk Expo recreates getToken every render,
  // which causes infinite useEffect re-fire loops when used as a dep.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    services,
    isServicesLoading,
    servicesError,
    loadServices,
    createService,
    updateService,
  } = useServicesStore();

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPriceInput, setNewPriceInput] = useState('');
  const [newDurationInput, setNewDurationInput] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriceInput, setEditPriceInput] = useState('');
  const [editDurationInput, setEditDurationInput] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const visibleServices = useMemo(
    () => {
      const byStatus = filterServicesByStatus(services, statusFilter);
      return filterServicesByName(byStatus, searchQuery);
    },
    [services, statusFilter, searchQuery],
  );

  const statusCounts = useMemo(
    () => getServiceStatusCounts(services),
    [services],
  );

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    void loadServices(getTokenRef.current, context.barbershopId);
  }, [context, loadServices]);

  const handleRefresh = useCallback(() => {
    if (!getTokenRef.current || !context?.barbershopId) return;
    void loadServices(getTokenRef.current, context.barbershopId);
  }, [context?.barbershopId, loadServices]);

  function resetCreateForm() {
    setNewName('');
    setNewPriceInput('');
    setNewDurationInput('');
    setNewDescription('');
    setCreateError(null);
    setShowCreateForm(false);
  }

  function startEditing(service: Service) {
    setEditingServiceId(service.id);
    setEditName(service.name);
    setEditPriceInput(formatCentsForInput(service.priceCents));
    setEditDurationInput(String(service.durationMinutes));
    setEditDescription(service.description ?? '');
    setEditError(null);
  }

  function cancelEditing() {
    setEditingServiceId(null);
    setEditError(null);
  }

  async function handleCreateService() {
    setCreateError(null);

    const result = validateServiceForm({
      name: newName,
      priceInput: newPriceInput,
      durationInput: newDurationInput,
      description: newDescription,
    });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }

    if (!context?.barbershopId) {
      setCreateError('No barbershop context available.');
      return;
    }

    setIsCreating(true);

    try {
      await createService(getTokenRef.current, context.barbershopId, result.payload);

      resetCreateForm();
      useFlashStore.getState().setMessage('Service created successfully.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create service');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateService() {
    setEditError(null);

    const result = validateServiceForm({
      name: editName,
      priceInput: editPriceInput,
      durationInput: editDurationInput,
      description: editDescription,
    });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }

    if (!context?.barbershopId || !editingServiceId) {
      setEditError('Missing service context.');
      return;
    }

    setIsUpdating(true);

    try {
      await updateService(getTokenRef.current, context.barbershopId, editingServiceId, result.payload);

      cancelEditing();
      useFlashStore.getState().setMessage('Service updated successfully.');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update service');
    } finally {
      setIsUpdating(false);
    }
  }

  function performToggle(service: Service, newIsActive: boolean) {
    if (!context?.barbershopId) return;

    updateService(getTokenRef.current, context.barbershopId, service.id, { isActive: newIsActive })
      .then(() => {
        useFlashStore.getState().setMessage(
          newIsActive ? 'Service reactivated.' : 'Service deactivated.',
        );
      })
      .catch((err: unknown) => {
        useFlashStore.getState().setMessage(
          err instanceof Error ? err.message : 'Failed to update service',
        );
      });
  }

  function handleToggleActive(service: Service) {
    // Reactivate is immediate — no confirmation needed
    if (!service.isActive) {
      performToggle(service, true);
      return;
    }

    // Deactivate requires confirmation
    Alert.alert(
      'Deactivate service?',
      'This service will no longer be available for new records, but past records will stay unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => performToggle(service, false),
        },
      ],
    );
  }

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const isOwner = context?.role === 'OWNER' && !!context?.barbershopId;

  return (
    <ServicesScreenView
      isContextLoading={isContextLoading}
      contextError={contextError}
      context={context}
      isOwner={isOwner}
      showCreateForm={showCreateForm}
      createForm={{
        name: newName,
        priceInput: newPriceInput,
        durationInput: newDurationInput,
        description: newDescription,
        error: createError,
        isCreating,
      }}
      editForm={{
        serviceId: editingServiceId,
        name: editName,
        priceInput: editPriceInput,
        durationInput: editDurationInput,
        description: editDescription,
        error: editError,
        isUpdating,
      }}
      searchQuery={searchQuery}
      statusFilter={statusFilter}
      statusCounts={statusCounts}
      isServicesLoading={isServicesLoading}
      servicesError={servicesError}
      visibleServices={visibleServices}
      onRefresh={handleRefresh}
      onBack={() => router.back()}
      onShowCreateForm={() => setShowCreateForm(true)}
      onCancelCreate={resetCreateForm}
      onCreate={handleCreateService}
      onCreateNameChange={setNewName}
      onCreatePriceChange={setNewPriceInput}
      onCreateDurationChange={setNewDurationInput}
      onCreateDescriptionChange={setNewDescription}
      onSearchChange={setSearchQuery}
      onClearSearch={() => setSearchQuery('')}
      onFilterChange={setStatusFilter}
      onStartEditing={startEditing}
      onCancelEditing={cancelEditing}
      onUpdate={handleUpdateService}
      onEditNameChange={setEditName}
      onEditPriceChange={setEditPriceInput}
      onEditDurationChange={setEditDurationInput}
      onEditDescriptionChange={setEditDescription}
      onToggleActive={handleToggleActive}
    />
  );
}
