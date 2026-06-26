import { beforeEach, describe, expect, it } from 'vitest';

import { AppointmentCreateScreenView } from '@/components/AppointmentCreateScreenView.js';
import { AppointmentsScreenView } from '@/components/AppointmentsScreenView.js';
import { EmployeesScreenView } from '@/components/EmployeesScreenView.js';
import { HomeContent } from '@/components/HomeContent.js';
import { ManageContent } from '@/components/ManageContent.js';
import { ServiceRecordCreateSectionView } from '@/components/ServiceRecordCreateSection.js';
import { ServicesScreenView } from '@/components/ServicesScreenView.js';
import { SignInScreenView } from '@/components/SignInScreenView.js';
import { WorkingHoursScreenView } from '@/components/WorkingHoursScreenView.js';
import { SUPPORTED_LOCALES, mobileLocalizationRuntime } from '@/i18n/index.js';
import { getPrimaryDestinationsForRole, resolvePrimaryDestinationCopy } from '@/lib/mobileNavigation.js';
import { findAll, findByTestId, findByText, getDisplayName, textContent } from '@/testing/elementTree.js';

const OWNER_CONTEXT = {
  userId: 'u-owner',
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

const BARBER_CONTEXT = {
  userId: 'u-barber',
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: 'emp-1',
  employeeName: 'Carlos',
};

const SERVICE = {
  id: 'svc-1',
  name: 'Classic Cut',
  description: null,
  durationMinutes: 30,
  priceCents: 300000,
  currency: 'ARS',
  isActive: true,
} as const;

const EMPLOYEE = {
  id: 'emp-1',
  barbershopId: 'shop-1',
  userId: 'user-1',
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  user: { id: 'user-1', email: 'carlos@example.com', name: 'Carlos', role: 'BARBER' as const },
} as const;

function assertNoTranslationKeys(node: unknown): void {
  const visibleText = findAll(node, (element) => getDisplayName(element) === 'Text')
    .map((element) => textContent(element))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const value of visibleText) {
    expect(value).not.toMatch(/^[a-z]+(?:\.[A-Za-z0-9_-]+)+$/);
  }
}

describe('locale render smoke matrix', () => {
  beforeEach(async () => {
    await mobileLocalizationRuntime.bootstrap();
  });

  it('renders navigation labels, Home, and Manage content for OWNER and BARBER across every supported locale', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      await mobileLocalizationRuntime.i18n.changeLanguage(locale);

      const ownerNavigation = getPrimaryDestinationsForRole('OWNER').map((destination) =>
        resolvePrimaryDestinationCopy(destination, (key, options) => mobileLocalizationRuntime.i18n.t(key, options)),
      );
      const barberNavigation = getPrimaryDestinationsForRole('BARBER').map((destination) =>
        resolvePrimaryDestinationCopy(destination, (key, options) => mobileLocalizationRuntime.i18n.t(key, options)),
      );

      expect(ownerNavigation).toHaveLength(4);
      expect(barberNavigation).toHaveLength(3);
      expect(ownerNavigation.every((item) => item.tabLabel.trim().length > 0)).toBe(true);
      expect(barberNavigation.every((item) => item.tabLabel.trim().length > 0)).toBe(true);

      const ownerHomeTree = HomeContent({
        context: OWNER_CONTEXT,
        isContextLoading: false,
        contextError: null,
        summary: null,
        isSummaryLoading: false,
        summaryError: null,
        records: [],
        isRecordsLoading: false,
        recordsError: null,
        summaryPeriod: 'today',
        summaryPeriodLabel: mobileLocalizationRuntime.i18n.t('common.periods.today'),
        onSummaryPeriodChange: () => undefined,
        ownerEmployeeFilters: [
          {
            id: 'all',
            label: mobileLocalizationRuntime.i18n.t('common.labels.all'),
            selected: true,
            testID: 'summary-employee-filter-all',
            onPress: () => undefined,
          },
        ],
        hasLoadedOwnerEmployeeFilters: true,
        isOwnerEmployeeFiltersLoading: false,
        ownerEmployeeFiltersError: null,
        onRetryOwnerEmployeeFilters: () => undefined,
        selectedDate: '2026-06-24',
        flashMessage: null,
        canRecordService: true,
        onRecordService: () => undefined,
        onAppointments: () => undefined,
        onPrevDate: () => undefined,
        onNextDate: () => undefined,
        onToday: () => undefined,
        onOpenLanguageSettings: () => undefined,
      });
      expect(findByTestId(ownerHomeTree, 'home-daily-action-record')).toBeDefined();
      expect(findByTestId(ownerHomeTree, 'home-daily-action-appointments')).toBeDefined();
      assertNoTranslationKeys(ownerHomeTree);

      const barberHomeTree = HomeContent({
        context: BARBER_CONTEXT,
        isContextLoading: false,
        contextError: null,
        summary: null,
        isSummaryLoading: false,
        summaryError: null,
        records: [],
        isRecordsLoading: false,
        recordsError: null,
        summaryPeriod: 'today',
        summaryPeriodLabel: mobileLocalizationRuntime.i18n.t('common.periods.today'),
        onSummaryPeriodChange: () => undefined,
        ownerEmployeeFilters: [],
        hasLoadedOwnerEmployeeFilters: false,
        isOwnerEmployeeFiltersLoading: false,
        ownerEmployeeFiltersError: null,
        onRetryOwnerEmployeeFilters: () => undefined,
        selectedDate: '2026-06-24',
        flashMessage: null,
        canRecordService: true,
        onRecordService: () => undefined,
        onAppointments: () => undefined,
        onPrevDate: () => undefined,
        onNextDate: () => undefined,
        onToday: () => undefined,
        onOpenLanguageSettings: () => undefined,
      });
      expect(findByTestId(barberHomeTree, 'home-daily-action-record')).toBeDefined();
      assertNoTranslationKeys(barberHomeTree);

      const manageTree = ManageContent({
        isOwner: true,
        onServices: () => undefined,
        onEmployees: () => undefined,
        onWorkingHours: () => undefined,
        onOpenLanguageSettings: () => undefined,
      });
      expect(findByTestId(manageTree, 'manage-services')).toBeDefined();
      expect(findByTestId(manageTree, 'manage-language')).toBeDefined();
      assertNoTranslationKeys(manageTree);
    }
  });

  it('renders the main mobile surfaces in every supported locale', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      await mobileLocalizationRuntime.i18n.changeLanguage(locale);

      const signInTree = SignInScreenView({
        phase: 'email',
        email: '',
        destinationEmail: '',
        code: '',
        error: null,
        onEmailChange: () => undefined,
        onCodeChange: () => undefined,
        onSendCode: () => undefined,
        onVerify: () => undefined,
        onBackToEmail: () => undefined,
        onOpenLanguageSettings: () => undefined,
      });
      expect(findByTestId(signInTree, 'sign-in-language-settings')).toBeDefined();
      expect(findByText(signInTree, mobileLocalizationRuntime.i18n.t('auth.emailPhaseTitle'))).toBeDefined();
      assertNoTranslationKeys(signInTree);

      const appointmentsTree = AppointmentsScreenView({
        context: OWNER_CONTEXT,
        isContextLoading: false,
        isAppointmentsLoading: false,
        appointmentsError: null,
        isRefreshing: false,
        flashMessage: null,
        showCreateAction: true,
        selectedDate: '2026-06-24',
        isTodaySelected: true,
        employeeFilters: [],
        appointmentRows: [],
        onCreateAppointment: () => undefined,
        onRefresh: () => undefined,
        onPrevDate: () => undefined,
        onToday: () => undefined,
        onNextDate: () => undefined,
      });
      expect(findByTestId(appointmentsTree, 'appointments-empty')).toBeDefined();
      expect(findByText(appointmentsTree, mobileLocalizationRuntime.i18n.t('appointments.title'))).toBeDefined();
      assertNoTranslationKeys(appointmentsTree);

      const appointmentCreateTree = AppointmentCreateScreenView({
        context: OWNER_CONTEXT,
        isContextLoading: false,
        contextError: null,
        blockingTitle: null,
        blockingMessage: null,
        employeesStatus: 'success',
        employeesError: null,
        employeeOptions: [
          {
            id: 'emp-1',
            label: 'Carlos',
            selected: true,
            testID: 'appointment-create-employee-emp-1',
            accessibilityLabel: mobileLocalizationRuntime.i18n.t('appointmentCreation.accessibility.employeeOption', { name: 'Carlos' }),
            onPress: () => undefined,
          },
        ],
        servicesStatus: 'success',
        servicesError: null,
        serviceOptions: [
          {
            id: 'svc-1',
            label: 'Classic Cut',
            detail: mobileLocalizationRuntime.i18n.t('services.durationLabel', { count: 30 }),
            selected: true,
            testID: 'appointment-create-service-svc-1',
            accessibilityLabel: mobileLocalizationRuntime.i18n.t('appointmentCreation.accessibility.serviceOption', { name: 'Classic Cut' }),
            onPress: () => undefined,
          },
        ],
        selectedEmployeeName: 'Carlos',
        selectedDate: '2026-06-24',
        canMoveToPreviousDate: true,
        isDateSectionEnabled: true,
        availabilityStatus: 'success',
        availabilityErrorKey: null,
        slotOptions: [
          {
            startAt: '2026-06-24T13:00:00.000Z',
            label: '10:00',
            selected: false,
            testID: 'appointment-create-slot-1',
            accessibilityLabel: mobileLocalizationRuntime.i18n.t('appointmentCreation.accessibility.timeOption', { time: '10:00' }),
            onPress: () => undefined,
          },
        ],
        clientName: 'Mateo',
        clientPhone: '',
        notes: '',
        fieldErrors: {},
        submissionErrorKey: null,
        summary: null,
        isSubmitting: false,
        onBack: () => undefined,
        onRetryEmployees: () => undefined,
        onRetryServices: () => undefined,
        onSelectToday: () => undefined,
        onSelectPreviousDate: () => undefined,
        onSelectNextDate: () => undefined,
        onRetryAvailability: () => undefined,
        onClientNameChange: () => undefined,
        onClientPhoneChange: () => undefined,
        onNotesChange: () => undefined,
        onSubmit: () => undefined,
      });
      expect(findByTestId(appointmentCreateTree, 'appointment-create-screen')).toBeDefined();
      expect(findByText(appointmentCreateTree, mobileLocalizationRuntime.i18n.t('appointmentCreation.title'))).toBeDefined();
      assertNoTranslationKeys(appointmentCreateTree);

      const recordServiceTree = ServiceRecordCreateSectionView({
        testID: 'service-record-create',
        mode: 'OWNER',
        barbershopId: 'shop-1',
        employees: [EMPLOYEE],
        services: [SERVICE],
        isEmployeesLoading: false,
        isServicesLoading: false,
        selectedEmployeeId: EMPLOYEE.id,
        selectedServiceId: SERVICE.id,
        selectedPaymentMethod: null,
        selectedService: SERVICE,
        priceDiffersFromDefault: false,
        clientNameInput: '',
        notesInput: '',
        priceCentsInput: '3000',
        formError: null,
        formSuccess: null,
        isSubmitting: false,
        helpText: mobileLocalizationRuntime.i18n.t('recordService.helpOwner'),
        servicesEmptyText: mobileLocalizationRuntime.i18n.t('recordService.noServicesOwner'),
        onEmployeeSelect: () => undefined,
        onServiceSelect: () => undefined,
        onPaymentMethodSelect: () => undefined,
        onClientNameChange: () => undefined,
        onNotesChange: () => undefined,
        onPriceChange: () => undefined,
        onSubmit: () => undefined,
      });
      expect(findByTestId(recordServiceTree, 'service-record-create')).toBeDefined();
      expect(findByText(recordServiceTree, mobileLocalizationRuntime.i18n.t('recordService.createTitle'))).toBeDefined();
      assertNoTranslationKeys(recordServiceTree);

      const servicesTree = ServicesScreenView({
        isContextLoading: false,
        contextError: null,
        context: OWNER_CONTEXT,
        isOwner: true,
        showCreateForm: false,
        createForm: {
          name: '',
          priceInput: '',
          durationInput: '',
          description: '',
          error: null,
          isCreating: false,
        },
        editForm: {
          serviceId: null,
          name: '',
          priceInput: '',
          durationInput: '',
          description: '',
          error: null,
          isUpdating: false,
        },
        searchQuery: '',
        statusFilter: 'ACTIVE',
        statusCounts: { ACTIVE: 1, INACTIVE: 0, ALL: 1 },
        isServicesLoading: false,
        servicesError: null,
        visibleServices: [SERVICE],
        onRefresh: () => undefined,
        onBack: () => undefined,
        onShowCreateForm: () => undefined,
        onCancelCreate: () => undefined,
        onCreate: () => undefined,
        onCreateNameChange: () => undefined,
        onCreatePriceChange: () => undefined,
        onCreateDurationChange: () => undefined,
        onCreateDescriptionChange: () => undefined,
        onSearchChange: () => undefined,
        onClearSearch: () => undefined,
        onFilterChange: () => undefined,
        onStartEditing: () => undefined,
        onCancelEditing: () => undefined,
        onUpdate: () => undefined,
        onEditNameChange: () => undefined,
        onEditPriceChange: () => undefined,
        onEditDurationChange: () => undefined,
        onEditDescriptionChange: () => undefined,
        onToggleActive: () => undefined,
      });
      expect(findByText(servicesTree, mobileLocalizationRuntime.i18n.t('services.title'))).toBeDefined();
      assertNoTranslationKeys(servicesTree);

      const employeesTree = EmployeesScreenView({
        context: OWNER_CONTEXT,
        isContextLoading: false,
        contextError: null,
        isOwner: true,
        isEmployeesLoading: false,
        employeesError: null,
        showAddForm: false,
        newUserId: '',
        createError: null,
        isCreating: false,
        employeeRows: [],
        onRefresh: () => undefined,
        onBack: () => undefined,
        onShowAddForm: () => undefined,
        onCancelAddForm: () => undefined,
        onNewUserIdChange: () => undefined,
        onSubmitAddForm: () => undefined,
      });
      expect(findByText(employeesTree, mobileLocalizationRuntime.i18n.t('employees.title'))).toBeDefined();
      assertNoTranslationKeys(employeesTree);

      const workingHoursTree = WorkingHoursScreenView({
        context: OWNER_CONTEXT,
        isContextLoading: false,
        contextError: null,
        isOwner: true,
        isWorkingHoursLoading: false,
        workingHoursError: null,
        saveError: null,
        saving: false,
        dayRows: [
          {
            dayOfWeek: 1,
            dayName: mobileLocalizationRuntime.i18n.t('common.weekdays.monday'),
            isActive: true,
            openTime: '09:00',
            closeTime: '18:00',
            error: null,
            onToggle: () => undefined,
            onOpenTimeChange: () => undefined,
            onCloseTimeChange: () => undefined,
          },
        ],
        onRefresh: () => undefined,
        onSave: () => undefined,
        onBack: () => undefined,
      });
      expect(findByText(workingHoursTree, mobileLocalizationRuntime.i18n.t('workingHours.title'))).toBeDefined();
      assertNoTranslationKeys(workingHoursTree);
    }
  });
});
