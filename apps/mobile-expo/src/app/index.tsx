import React, { useEffect } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, Platform } from 'react-native';
import { useColorScheme } from 'react-native';
import { useConnectionStore } from '../store/useConnectionStore';
import ScanScreen from './scan';
import DashboardScreen from './dashboard';

export default function HomeScreen() {
  const status = useConnectionStore((state) => state.status);
  const connect = useConnectionStore((state) => state.connect);
  const colorScheme = useColorScheme();

  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const ipParam = params.get('ip');
      const portParam = params.get('port');
      const tokenParam = params.get('token');
      if (ipParam && portParam && tokenParam) {
        connect(ipParam, Number(portParam), tokenParam)
          .then(() => {
            if (window.history && window.history.replaceState) {
              const url = window.location.protocol + "//" + window.location.host + window.location.pathname;
              window.history.replaceState({ path: url }, '', url);
            }
          })
          .catch((err) => {
            console.error("Auto-connection failed:", err);
          });
      }
    }
  }, [connect]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#151515' : '#ffffff' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {status === 'CONNECTED' ? (
        <DashboardScreen />
      ) : (
        <ScanScreen />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
