import React from 'react';
import { Switch, Image, ScrollView } from 'react-native';
const logoImg = require('../../assets/images/icon.png');
import { YStack, XStack, Text, Button, Separator, Card, Input } from 'tamagui';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useConnectionStore, UserTheme, UserLanguage } from '../store/useConnectionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    userTheme,
    userLanguage,
    hapticsEnabled,
    deviceName,
    activeConnections,
    setTheme,
    setLanguage,
    setHapticsEnabled,
    setDeviceName,
    fetchActiveConnections,
    revokeConnection,
  } = useConnectionStore();

  React.useEffect(() => {
    fetchActiveConnections();
  }, []);

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
    <YStack f={1} bg="$background" p="$4" pt="$10"
      paddingTop={insets.top + 16}
      paddingBottom={insets.bottom + 16}
      paddingLeft={insets.left + 16}
      paddingRight={insets.right + 16}>
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
        <Image
          source={logoImg}
          style={{ width: 32, height: 32, borderRadius: 6 }}
          resizeMode="contain"
        />
        <Text fos="$6" fow="bold" col="$color">
          {t('settings.title')}
        </Text>
      </XStack>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <YStack gap="$5">
        {/* Device Name Section */}
        <Card borderWidth={1} p="$4" gap="$3">
          <YStack gap="$1" mb="$2">
            <Text fow="bold" fos="$4" col="$color">{'Device Name'}</Text>
            <Text fos="$2" col="$colorMuted">{'This name identifies this client on the connection list.'}</Text>
          </YStack>
          <Input
            value={deviceName}
            onChangeText={setDeviceName}
            placeholder="e.g. My Device"
          />
        </Card>

        <Separator />

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

        {activeConnections.length > 0 && (
          <>
            <Separator />
            <Card borderWidth={1} p="$4" gap="$3">
              <YStack gap="$1" mb="$2">
                <Text fow="bold" fos="$4" col="$color">{'Active Connections'}</Text>
                <Text fos="$2" col="$colorMuted">{'Manage other active connections to the bridge.'}</Text>
              </YStack>
              <YStack gap="$2">
                {activeConnections.map((conn) => (
                  <XStack key={conn.id} jc="space-between" ai="center" p="$3" bg="$backgroundPress" br="$2">
                    <YStack f={1}>
                      <Text fow="bold" fos="$3" col="$color">{conn.deviceName}</Text>
                      <Text fos="$1" col="$colorMuted">{'ID: ' + conn.id}</Text>
                    </YStack>
                    <Button
                      size="$2.5"
                      theme="alt2"
                      variant="outlined"
                      onPress={() => revokeConnection(conn.id)}
                    >
                      {'Revoke'}
                    </Button>
                  </XStack>
                ))}
              </YStack>
            </Card>
          </>
        )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
