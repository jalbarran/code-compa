import React from 'react';
import { Switch } from 'react-native';
import { YStack, XStack, Text, Button, Separator, Card } from 'tamagui';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useConnectionStore, UserTheme, UserLanguage } from '../store/useConnectionStore';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    userTheme,
    userLanguage,
    hapticsEnabled,
    setTheme,
    setLanguage,
    setHapticsEnabled,
  } = useConnectionStore();

  const THEME_OPTIONS: { key: UserTheme; label: string }[] = [
    { key: 'system', label: t('settings.themeSystem') },
    { key: 'light', label: t('settings.themeLight') },
    { key: 'dark', label: t('settings.themeDark') },
  ];

  const LANG_OPTIONS: { key: UserLanguage; label: string }[] = [
    { key: 'en', label: t('settings.langEn') },
    { key: 'es', label: t('settings.langEs') },
  ];

  return (
    <YStack f={1} bg="$background" p="$4" pt="$10">
      {/* Header */}
      <XStack ai="center" mb="$6" gap="$3">
        <Button
          size="$3"
          variant="outlined"
          onPress={() => router.back()}
          circular
        >
          {'←'}
        </Button>
        <Text fos="$6" fow="bold" col="$color">
          {t('settings.title')}
        </Text>
      </XStack>

      <YStack gap="$5">
        {/* Language Section */}
        <Card borderWidth={1} p="$4" gap="$3">
          <YStack gap="$1" mb="$2">
            <Text fow="bold" fos="$4" col="$color">{t('settings.languageSection')}</Text>
            <Text fos="$2" col="$colorMuted">{t('settings.languageDescription')}</Text>
          </YStack>
          <XStack gap="$2">
            {LANG_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                f={1}
                size="$3"
                theme={userLanguage === opt.key ? 'active' : undefined}
                variant={userLanguage === opt.key ? undefined : 'outlined'}
                onPress={() => setLanguage(opt.key)}
              >
                {opt.label}
              </Button>
            ))}
          </XStack>
        </Card>

        <Separator />

        {/* Theme Section */}
        <Card borderWidth={1} p="$4" gap="$3">
          <YStack gap="$1" mb="$2">
            <Text fow="bold" fos="$4" col="$color">{t('settings.themeSection')}</Text>
            <Text fos="$2" col="$colorMuted">{t('settings.themeDescription')}</Text>
          </YStack>
          <XStack gap="$2">
            {THEME_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                f={1}
                size="$3"
                theme={userTheme === opt.key ? 'active' : undefined}
                variant={userTheme === opt.key ? undefined : 'outlined'}
                onPress={() => setTheme(opt.key)}
              >
                {opt.label}
              </Button>
            ))}
          </XStack>
        </Card>

        <Separator />

        {/* Haptic Feedback Section */}
        <Card borderWidth={1} p="$4">
          <XStack jc="space-between" ai="center" gap="$3">
            <YStack f={1} gap="$1">
              <Text fow="bold" fos="$4" col="$color">{t('settings.hapticsSection')}</Text>
              <Text fos="$2" col="$colorMuted">{t('settings.hapticsDescription')}</Text>
            </YStack>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: '#767577', true: '#6366f1' }}
              thumbColor={hapticsEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </XStack>
        </Card>
      </YStack>
    </YStack>
  );
}
