import React from 'react';
import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import { useColorScheme } from 'react-native';
import { useConnectionStore } from '../store/useConnectionStore';
import ScanScreen from './scan';
import DashboardScreen from './dashboard';

export default function HomeScreen() {
  const status = useConnectionStore((state) => state.status);
  const colorScheme = useColorScheme();

  const isDark = colorScheme === 'dark';

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
