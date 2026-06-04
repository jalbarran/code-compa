import { Slot } from 'expo-router';
import { TamaguiProvider, Theme } from 'tamagui';
import { useColorScheme } from 'react-native';
import config from '../../tamagui.config';
import '../i18n';
import 'web-streams-polyfill';
import 'fast-text-encoding';
import { useConnectionStore } from '../store/useConnectionStore';
import i18next from 'i18next';
import { useEffect } from 'react';

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const { userTheme, userLanguage } = useConnectionStore();

  // Apply runtime language change
  useEffect(() => {
    if (i18next.language !== userLanguage) {
      i18next.changeLanguage(userLanguage);
    }
  }, [userLanguage]);

  const themeName = userTheme === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : userTheme;

  return (
    <TamaguiProvider config={config} defaultTheme={themeName}>
      <Theme name={themeName}>
        <Slot />
      </Theme>
    </TamaguiProvider>
  );
}
