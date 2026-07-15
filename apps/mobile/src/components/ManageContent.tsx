import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppCard,
  NavigationTile,
  ScreenHeader,
  SectionHeader,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

export interface ManageContentProps {
  isOwner: boolean;
  onNotifications: () => void;
  onServices: () => void;
  onEmployees: () => void;
  onWorkingHours: () => void;
  onOpenLanguageSettings: () => void;
}

export function ManageContent({
  isOwner,
  onNotifications,
  onServices,
  onEmployees,
  onWorkingHours,
  onOpenLanguageSettings,
}: ManageContentProps) {
  const { t } = useTranslation();

  return (
    <>
      <ScreenHeader
        title={t('manage.title')}
        subtitle={t('manage.subtitle')}
      />

      <View style={styles.contentStack}>
        {!isOwner ? (
          <AppCard testID="manage-blocked" variant="outlined">
            <Text style={styles.blockedTitle}>{t('manage.blockedTitle')}</Text>
            <Text style={styles.blockedMessage}>{t('manage.blockedMessage')}</Text>
          </AppCard>
        ) : (
          <>
            <View style={styles.sectionBlock}>
              <SectionHeader title={t('manage.businessSectionTitle')} />
              <Text style={styles.sectionHint}>{t('manage.businessSectionHint')}</Text>
              <View style={styles.tileList}>
                <NavigationTile
                  testID="manage-notifications"
                  title={t('notificationsOperations.title')}
                  description={t('manage.items.notifications.description')}
                  iconName="mail-open-outline"
                  accessibilityLabel={t('navigation.accessibility.notifications')}
                  onPress={onNotifications}
                  showChevron
                />
                <NavigationTile
                  testID="manage-services"
                  title={t('services.title')}
                  description={t('manage.items.services.description')}
                  iconName="construct-outline"
                  accessibilityLabel={t('navigation.accessibility.services')}
                  onPress={onServices}
                  showChevron
                />
                <NavigationTile
                  testID="manage-employees"
                  title={t('employees.title')}
                  description={t('manage.items.employees.description')}
                  iconName="people-outline"
                  accessibilityLabel={t('navigation.accessibility.employees')}
                  onPress={onEmployees}
                  showChevron
                />
                <NavigationTile
                  testID="manage-working-hours"
                  title={t('workingHours.title')}
                  description={t('manage.items.workingHours.description')}
                  iconName="time-outline"
                  accessibilityLabel={t('navigation.accessibility.workingHours')}
                  onPress={onWorkingHours}
                  showChevron
                />
              </View>
            </View>

            <View style={styles.sectionBlock}>
              <SectionHeader title={t('manage.settingsSectionTitle')} />
              <View style={styles.tileList}>
                <NavigationTile
                  testID="manage-language"
                  title={t('languageSelector.title')}
                  description={t('manage.items.language.description')}
                  iconName="language-outline"
                  accessibilityLabel={t('navigation.accessibility.languageSettings')}
                  onPress={onOpenLanguageSettings}
                  showChevron
                />
              </View>
            </View>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: tokens.layout.majorSectionGap,
  },
  sectionBlock: {
    gap: tokens.layout.sectionContentGap,
  },
  sectionHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  tileList: {
    gap: tokens.layout.relatedCardGap,
  },
  blockedTitle: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing[1],
  },
  blockedMessage: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
});
