import React, { useState } from 'react';
import { StyleSheet, Platform, Image } from 'react-native';
const logoImg = require('../../assets/images/icon.png');
import { CameraView, useCameraPermissions } from 'expo-camera';
import { YStack, XStack, Text, Button, Input, Card, Spinner, Theme } from 'tamagui';
import { useConnectionStore } from '../store/useConnectionStore';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScanScreenProps {
  onScanSuccess?: () => void;
}

export default function ScanScreen({ onScanSuccess }: ScanScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const isWeb = Platform.OS === 'web';
  const [manualMode, setManualMode] = useState(isWeb);
  const [ip, setIp] = useState('192.168.0.');
  const [port, setPort] = useState('8765');
  const [token, setToken] = useState(__DEV__ ? 'XXX' : '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const connectStore = useConnectionStore((state) => state.connect);

  const handleConnect = async (targetIp: string, targetPort: number, targetToken: string) => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      await connectStore(targetIp, targetPort, targetToken);
      onScanSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || t('scan.failedToConnect'));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    try {
      const payload = JSON.parse(data);
      if (payload.ip && payload.port && payload.token) {
        handleConnect(payload.ip, Number(payload.port), payload.token);
      } else {
        setErrorMsg(t('scan.invalidQr'));
      }
    } catch (e) {
      setErrorMsg(t('scan.failedToParseQr'));
    }
  };

  if (!isWeb && !permission) {
    return (
      <YStack f={1} ai="center" jc="center" bg="$background"
        paddingTop={insets.top + 16}
        paddingBottom={insets.bottom + 16}
        paddingLeft={insets.left + 16}
        paddingRight={insets.right + 16}>
        <Spinner size="large" color="$color" />
        <Text mt="$2" col="$color">{t('scan.loadingPermissions')}</Text>
      </YStack>
    );
  }

  if (!isWeb && permission && !permission.granted && !manualMode) {
    return (
      <YStack f={1} ai="center" jc="center" bg="$background" p="$4" gap="$4">
        <Text ta="center" fow="bold" fos="$5" col="$color">{t('scan.permissionRequired')}</Text>
        <Text ta="center" col="$colorMuted">{t('scan.permissionDescription')}</Text>
        <Button onPress={requestPermission} theme="active">{t('scan.grantPermission')}</Button>
        <Button onPress={() => setManualMode(true)} variant="outlined">{t('scan.enterDetailsManually')}</Button>
      </YStack>
    );
  }

  return (
    <YStack
      f={1}
      bg="$background"
      paddingTop={insets.top + 16}
      paddingBottom={insets.bottom + 16}
      paddingLeft={insets.left + 16}
      paddingRight={insets.right + 16}
    >
      {/* Top Header Section */}
      <XStack jc="space-between" ai="center" mb="$4">
        <XStack ai="center" gap="$3">
          <Image
            source={logoImg}
            style={{ width: 32, height: 32, borderRadius: 6 }}
            resizeMode="contain"
          />
          <Text fos="$5" fow="bold" col="$color">{'Code Compa'}</Text>
        </XStack>
        <Button
          size="$3"
          variant="outlined"
          onPress={() => router.push('/settings')}
        >
          ⚙️
        </Button>
      </XStack>

      <YStack f={1} jc="center">
        {manualMode ? (
          <Card elevation="$4" size="$4" borderWidth={1} p="$4" gap="$4" theme="dark">
            <Card.Header>
              <Text fow="bold" fos="$6">{t('scan.connectManually')}</Text>
              <Text col="$colorMuted" fos="$3">{t('scan.enterParameters')}</Text>
            </Card.Header>

            <YStack gap="$3" my="$4">
              <YStack>
                <Text fos="$3" fow="bold" mb="$1">{t('scan.ipAddress')}</Text>
                <Input value={ip} onChangeText={setIp} placeholder="e.g. 192.168.1.15" />
              </YStack>

              <YStack>
                <Text fos="$3" fow="bold" mb="$1">{t('scan.port')}</Text>
                <Input value={port} onChangeText={setPort} keyboardType="numeric" placeholder="e.g. 8765" />
              </YStack>

              <YStack>
                <Text fos="$3" fow="bold" mb="$1">{t('scan.token')}</Text>
                <Input value={token} onChangeText={setToken} placeholder={t('scan.bearerTokenPlaceholder')} />
              </YStack>

              {errorMsg && (
                <Text col="$red10" fos="$3" ta="center">{errorMsg}</Text>
              )}
            </YStack>

            <Card.Footer gap="$2">
              {!isWeb && (
                <Button f={1} variant="outlined" onPress={() => setManualMode(false)}>
                  {t('scan.useScanner')}
                </Button>
              )}
              <Button f={1} theme="active" onPress={() => handleConnect(ip, Number(port), token)} disabled={isConnecting}>
                {isConnecting ? <Spinner color="white" /> : t('scan.connect')}
              </Button>
            </Card.Footer>
          </Card>
        ) : (
          <YStack f={1} gap="$4" jc="space-between">
            <YStack ai="center" mt="$8" gap="$2">
              <Text fow="bold" fos="$7" col="$color">{t('scan.scanQrCode')}</Text>
              <Text col="$colorMuted" ta="center">{t('scan.alignQrCode')}</Text>
            </YStack>

            <YStack f={1} my="$4" br="$4" ov="hidden" bg="black" jc="center" ai="center" pos="relative">
              <CameraView
                style={StyleSheet.absoluteFill}
                onBarcodeScanned={isConnecting ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
              />
              {isConnecting && (
                <YStack style={StyleSheet.absoluteFill} bg="rgba(0,0,0,0.6)" jc="center" ai="center">
                  <Spinner size="large" color="white" />
                  <Text mt="$2" col="white" fow="bold">{t('scan.connectingToBridge')}</Text>
                </YStack>
              )}
            </YStack>

            <YStack gap="$2" mb="$6">
              {errorMsg && (
                <Text col="$red10" fos="$3" ta="center" mb="$2">{errorMsg}</Text>
              )}
              <Button onPress={() => setManualMode(true)} variant="outlined">
                {t('scan.enterDetailsManually')}
              </Button>
            </YStack>
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}

