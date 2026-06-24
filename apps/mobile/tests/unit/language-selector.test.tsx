import { beforeEach, describe, expect, it, vi } from 'vitest';

import LanguageScreen from '../../app/language.js';
import { HomeContent } from '@/components/HomeContent.js';
import { SignInScreenView } from '@/components/SignInScreenView.js';
import { SUPPORTED_LOCALES, mobileLocalizationRuntime } from '@/i18n/index.js';
import {
  findAll,
  findByTestId,
  findByText,
  getDisplayName,
  press,
  textContent,
} from '@/testing/elementTree.js';
import type { ReactElement } from 'react';

interface LocalizationMockState {
  locale: (typeof SUPPORTED_LOCALES)[number];
  preference: (typeof SUPPORTED_LOCALES)[number] | 'system';
  supportedLocales: readonly (typeof SUPPORTED_LOCALES)[number][];
  setPreference: ReturnType<typeof vi.fn>;
}

let mockIsSignedIn = false;
let mockBack = vi.fn();
let mockLocalizationState: LocalizationMockState;

vi.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

vi.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    isSignedIn: mockIsSignedIn,
  }),
}));

vi.mock('@/i18n/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/index.js')>();

  return {
    ...actual,
    useLocalization: () => mockLocalizationState,
  };
});

function findPressables(node: unknown): ReactElement[] {
  return findAll(
    node,
    (element) => getDisplayName(element) === 'Pressable',
  ) as ReactElement[];
}

function renderLanguageScreen() {
  return LanguageScreen();
}

const OWNER_CONTEXT = {
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

function renderHomeContent(onOpenLanguageSettings = vi.fn()) {
  return HomeContent({
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
    summaryPeriodLabel: 'Today',
    onSummaryPeriodChange: vi.fn(),
    ownerEmployeeFilters: [],
    hasLoadedOwnerEmployeeFilters: false,
    isOwnerEmployeeFiltersLoading: false,
    ownerEmployeeFiltersError: null,
    onRetryOwnerEmployeeFilters: vi.fn(),
    selectedDate: '2026-06-24',
    flashMessage: null,
    canRecordService: true,
    onRecordService: vi.fn(),
    onServices: vi.fn(),
    onEmployees: vi.fn(),
    onWorkingHours: vi.fn(),
    onAppointments: vi.fn(),
    onPrevDate: vi.fn(),
    onNextDate: vi.fn(),
    onToday: vi.fn(),
    onOpenLanguageSettings,
  });
}

describe('language selector and entry points', () => {
  beforeEach(async () => {
    mockIsSignedIn = false;
    mockBack = vi.fn();
    await mobileLocalizationRuntime.bootstrap();
    await mobileLocalizationRuntime.i18n.changeLanguage('en');

    mockLocalizationState = {
      locale: 'en',
      preference: 'system',
      supportedLocales: SUPPORTED_LOCALES,
      setPreference: vi.fn(async (preference: LocalizationMockState['preference']) => {
        const nextLocale = preference === 'system' ? 'en' : preference;
        mockLocalizationState.preference = preference;
        mockLocalizationState.locale = nextLocale;
        await mobileLocalizationRuntime.i18n.changeLanguage(nextLocale);

        return {
          ready: true,
          preference,
          locale: nextLocale,
          source: preference === 'system' ? 'system' : 'stored',
        };
      }),
    };
  });

  it('renders system mode plus the six locale self-names', () => {
    const tree = renderLanguageScreen();

    expect(findByTestId(tree, 'language-option-system')).toBeDefined();
    expect(findByText(tree, 'Español')).toBeDefined();
    expect(findByText(tree, 'English')).toBeDefined();
    expect(findByText(tree, 'Deutsch')).toBeDefined();
    expect(findByText(tree, 'Français')).toBeDefined();
    expect(findByText(tree, 'Italiano')).toBeDefined();
    expect(findByText(tree, '简体中文')).toBeDefined();
  });

  it('shows the resolved active language while system mode is selected', () => {
    const tree = renderLanguageScreen();

    expect(findByText(tree, 'Automatic (device language)')).toBeDefined();
    expect(findByText(tree, 'Active language: English')).toBeDefined();
  });

  it('applies a language change immediately and marks exactly one selected option', async () => {
    const initialTree = renderLanguageScreen();
    press(findByTestId(initialTree, 'language-option-de'));

    expect(mockLocalizationState.setPreference).toHaveBeenCalledWith('de');

    const updatedTree = renderLanguageScreen();
    expect(findByText(updatedTree, 'Sprache')).toBeDefined();
    expect(findByText(updatedTree, 'Ausgewählt')).toBeDefined();
    expect(findByText(updatedTree, 'Deutsch')).toBeDefined();

    const selectedPressables = findPressables(updatedTree).filter(
      (element) => (element.props as { accessibilityState?: { selected?: boolean } }).accessibilityState?.selected,
    );

    expect(selectedPressables).toHaveLength(1);
  });

  it('uses a signed-out close action and a signed-in back action', () => {
    const signedOutTree = renderLanguageScreen();
    expect(findByText(signedOutTree, 'Close')).toBeDefined();

    mockIsSignedIn = true;
    const signedInTree = renderLanguageScreen();
    expect(findByText(signedInTree, 'Back')).toBeDefined();
  });

  it('renders localized entry points on sign-in and home surfaces', async () => {
    await mobileLocalizationRuntime.i18n.changeLanguage('fr');

    const onOpenSignInLanguage = vi.fn();
    const signInTree = SignInScreenView({
      phase: 'email',
      email: '',
      destinationEmail: '',
      code: '',
      error: null,
      onEmailChange: vi.fn(),
      onCodeChange: vi.fn(),
      onSendCode: vi.fn(),
      onVerify: vi.fn(),
      onBackToEmail: vi.fn(),
      onOpenLanguageSettings: onOpenSignInLanguage,
    });

    expect(findByTestId(signInTree, 'sign-in-language-settings')).toBeDefined();
    expect(findByText(signInTree, 'Langue')).toBeDefined();
    press(findByTestId(signInTree, 'sign-in-language-settings'));
    expect(onOpenSignInLanguage).toHaveBeenCalledTimes(1);

    const onOpenHomeLanguage = vi.fn();
    const homeTree = renderHomeContent(onOpenHomeLanguage);
    expect(findByTestId(homeTree, 'home-language-settings')).toBeDefined();
    expect(findByText(homeTree, 'Langue')).toBeDefined();
    press(findByTestId(homeTree, 'home-language-settings'));
    expect(onOpenHomeLanguage).toHaveBeenCalledTimes(1);
  });

  it('keeps rendered selector text free of literal translation keys after switching locales', async () => {
    await mockLocalizationState.setPreference('zh-Hans');
    const tree = renderLanguageScreen();

    const visibleText = findAll(
      tree,
      (element) => getDisplayName(element) === 'Text',
    )
      .map((element) => textContent(element))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    for (const value of visibleText) {
      expect(value).not.toMatch(/^[a-z]+(?:\.[A-Za-z0-9_-]+)+$/);
    }
  });
});
