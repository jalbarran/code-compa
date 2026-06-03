import { Slot } from 'expo-router';
import { TamaguiProvider, Theme } from 'tamagui';
import { useColorScheme } from 'react-native';
import config from '../../tamagui.config';
import '../i18n';
import 'web-streams-polyfill';
import 'fast-text-encoding';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === 'dark' ? 'dark' : 'light';
  return (
    <TamaguiProvider config={config} defaultTheme={themeName}>
      <Theme name={themeName}>
        <Slot />
      </Theme>
    </TamaguiProvider>
  );
}
