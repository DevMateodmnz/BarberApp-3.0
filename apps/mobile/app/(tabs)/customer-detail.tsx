import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CustomerDetailScreenView } from '@/components/CustomerDetailScreenView.js';
import { useCustomersStore } from '@/lib/customersStore.js';
import { useContextStore } from '@/lib/store.js';

export default function CustomerDetailScreen() {
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { context, isLoading: isContextLoading, error: contextError, loadContext } =
    useContextStore();
  const {
    customerDetail,
    customerDetailError,
    isCustomerDetailLoading,
    isCustomerSaving,
    loadCustomerDetail,
    updateCustomer,
  } = useCustomersStore();

  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  useEffect(() => {
    if (!isSignedIn || context) {
      return;
    }

    void loadContext(getToken);
  }, [context, getToken, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context?.barbershopId || typeof customerId !== 'string') {
      return;
    }

    void loadCustomerDetail(getToken, context.barbershopId, customerId);
  }, [context?.barbershopId, customerId, getToken, loadCustomerDetail]);

  useEffect(() => {
    if (!customerDetail) {
      return;
    }

    setNameInput(customerDetail.name);
    setEmailInput(customerDetail.email ?? '');
    setNotesInput(customerDetail.internalNotes ?? '');
  }, [customerDetail]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const mergedError = customerDetailError ?? (!customerDetail ? contextError : null);

  return (
    <CustomerDetailScreenView
      detail={customerDetail}
      isLoading={isContextLoading || isCustomerDetailLoading}
      isSaving={isCustomerSaving}
      error={mergedError}
      nameInput={nameInput}
      emailInput={emailInput}
      notesInput={notesInput}
      onBack={() => router.back()}
      onRefresh={() => {
        if (!context?.barbershopId || typeof customerId !== 'string') {
          return;
        }

        void loadCustomerDetail(getToken, context.barbershopId, customerId);
      }}
      onRetry={() => {
        if (!context?.barbershopId || typeof customerId !== 'string') {
          return;
        }

        void loadCustomerDetail(getToken, context.barbershopId, customerId);
      }}
      onNameChange={setNameInput}
      onEmailChange={setEmailInput}
      onNotesChange={setNotesInput}
      onSave={() => {
        if (!context?.barbershopId || typeof customerId !== 'string') {
          return;
        }

        void updateCustomer(getToken, context.barbershopId, customerId, {
          name: nameInput,
          email: emailInput.trim() ? emailInput : null,
          internalNotes: notesInput.trim() ? notesInput : null,
        });
      }}
      onCreateAppointment={() => {
        if (!customerDetail) {
          return;
        }

        router.push({
          pathname: '/(tabs)/appointments-create',
          params: {
            prefillCustomerId: customerDetail.id,
            prefillCustomerName: nameInput.trim() || customerDetail.name,
            prefillCustomerPhone: customerDetail.phone,
          },
        });
      }}
    />
  );
}
