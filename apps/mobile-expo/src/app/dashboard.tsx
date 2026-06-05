import React, { useState } from 'react';
import { ScrollView, Pressable } from 'react-native';
import {
  YStack, XStack, Text, Button, Card, Input, Separator, Spinner, Circle, Sheet
} from 'tamagui';
import { useRouter } from 'expo-router';
import { useConnectionStore, HistoryEntry } from '../store/useConnectionStore';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ip, port, status, queue, history, telemetryLogs, disconnect, respond } = useConnectionStore();
  const [feedback, setFeedback] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<HistoryEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleAction = async (eventId: string, optionId: string) => {
    setSubmittingId(eventId);
    try {
      await respond(eventId, optionId, feedback);
      setFeedback('');
    } finally {
      setSubmittingId(null);
    }
  };

  const openHistoryDetail = (entry: HistoryEntry) => {
    console.log('[DEBUG] Tapped history item:', entry.event.eventId, 'Title:', entry.event.payload?.title);
    setSelectedHistoryEntry(entry);
    setSheetOpen(true);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'CONNECTED': return '$green10';
      case 'CONNECTING': return '$yellow10';
      case 'RECONNECTING': return '$yellow10';
      case 'ERROR': return '$red10';
      default: return '$gray10';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toUpperCase()) {
      case 'HIGH': return '$red10';
      case 'MEDIUM': return '$orange10';
      case 'LOW': return '$blue10';
      default: return '$gray10';
    }
  };

  const formatTimestamp = (ms: number) => {
    return new Date(ms).toLocaleString();
  };

  const currentEvent = queue[0];

  return (
    <YStack 
      f={1} 
      bg="$background" 
      paddingTop={insets.top + 16} 
      paddingBottom={insets.bottom + 16}
      paddingLeft={insets.left + 16}
      paddingRight={insets.right + 16}
    >
      {/* Header section */}
      <XStack jc="space-between" ai="center" mb="$4">
        <YStack>
          <Text fos="$6" fow="bold" col="$color">{'Code Compa'}</Text>
          <XStack ai="center" gap="$2">
            <Circle size={10} bg={getStatusColor()} />
            <Text col="$colorMuted" fos="$2">
              {status} • {ip}:{port}
            </Text>
          </XStack>
        </YStack>
        <XStack gap="$2">
          <Button
            size="$3"
            variant="outlined"
            onPress={() => router.push('/settings')}
          >
            {'⚙️'}
          </Button>
          <Button size="$3" variant="outlined" onPress={disconnect}>
            {t('dashboard.disconnect')}
          </Button>
        </XStack>
      </XStack>

      <Separator />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 16 }}>
        {currentEvent ? (
          <YStack gap="$4">
            <Card elevation="$4" borderWidth={1} p="$4" gap="$3" theme="dark" bg="$backgroundPress">
              <Card.Header>
                <XStack jc="space-between" ai="center">
                  <YStack>
                    <Text fos="$3" col="$colorMuted" fow="bold">
                      {currentEvent.metadata?.ide || t('dashboard.ideAgent')}
                    </Text>
                    <Text fos="$4" fow="bold">
                      {currentEvent.metadata?.agentName || t('dashboard.agentRequest')}
                    </Text>
                  </YStack>
                  <XStack bg={getRiskColor(currentEvent.payload?.riskLevel || 'LOW')} px="$2.5" py="$1" br="$4">
                    <Text col="white" fow="bold" fos="$2" textTransform="uppercase">
                      {t('dashboard.risk', { level: currentEvent.payload?.riskLevel || 'LOW' })}
                    </Text>
                  </XStack>
                </XStack>
              </Card.Header>

              <YStack gap="$2" my="$2">
                <Text fos="$5" fow="bold" col="$color">
                  {currentEvent.payload?.title || t('dashboard.actionRequest')}
                </Text>
                <Text col="$colorMuted" fos="$3">
                  {currentEvent.payload?.description}
                </Text>

                {currentEvent.payload?.directory && (
                  <YStack bg="$background" p="$2" br="$2" mt="$2">
                    <Text fos="$2" col="$colorMuted" fow="bold">{t('dashboard.directory')}</Text>
                    <Text fos="$3" col="$color" ff="$mono">{currentEvent.payload.directory}</Text>
                  </YStack>
                )}

                {currentEvent.payload?.command && (
                  <YStack bg="$background" p="$3" br="$2" mt="$2">
                    <Text fos="$2" col="$colorMuted" fow="bold" mb="$1">{t('dashboard.commandToExecute')}</Text>
                    <Text fos="$3" col="$green10" ff="$mono">{currentEvent.payload.command}</Text>
                  </YStack>
                )}

                {currentEvent.payload?.prompt && (
                  <YStack
                    borderLeftWidth={3}
                    borderLeftColor="$blue10"
                    bg="$background"
                    p="$3"
                    br="$2"
                    mt="$2"
                    gap="$1"
                  >
                    <Text fos="$2" col="$colorMuted" fow="bold" textTransform="uppercase" letterSpacing={0.5}>
                      {t('dashboard.promptTitle')}
                    </Text>
                    <Text fos="$3" col="$color" ff="$mono">
                      {currentEvent.payload.prompt}
                    </Text>
                  </YStack>
                )}

                {currentEvent.payload?.diff && (
                  <YStack bg="$background" br="$2" mt="$2" ov="hidden" borderWidth={1} borderColor="$borderColor">
                    <XStack bg="$backgroundPress" p="$2.5" jc="space-between" ai="center" borderBottomWidth={1} borderBottomColor="$borderColor">
                      <Text fos="$2" col="$colorMuted" fow="bold" textTransform="uppercase" letterSpacing={0.5}>
                        {t('dashboard.diffTitle')}
                      </Text>
                    </XStack>
                    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ maxHeight: 300 }}>
                      <YStack p="$3" bg="$background" minWidth="100%">
                        {currentEvent.payload.diff.split('\n').map((line, idx) => {
                          let lineBg = 'transparent';
                          let lineCol = '$color';
                          if (line.startsWith('+')) {
                            lineBg = 'rgba(0, 255, 0, 0.1)';
                            lineCol = '$green10';
                          } else if (line.startsWith('-')) {
                            lineBg = 'rgba(255, 0, 0, 0.1)';
                            lineCol = '$red10';
                          } else if (line.startsWith('@@')) {
                            lineBg = 'rgba(0, 0, 255, 0.05)';
                            lineCol = '$blue10';
                          }
                          return (
                            <XStack key={idx} bg={lineBg} px="$2" py="$0.5" br="$1">
                              <Text fos="$2" col="$colorMuted" w={20} ta="right" mr="$2">
                                {idx + 1}
                              </Text>
                              <Text fos="$2" col={lineCol} ff="$mono">
                                {line}
                              </Text>
                            </XStack>
                          );
                        })}
                      </YStack>
                    </ScrollView>
                  </YStack>
                )}
              </YStack>

              {currentEvent.payload?.allowsTextInput && (
                <YStack gap="$2" my="$2">
                  <Text fos="$3" fow="bold">{t('dashboard.customInstructions')}</Text>
                  <Input
                    value={feedback}
                    onChangeText={setFeedback}
                    placeholder={t('dashboard.feedbackPlaceholder')}
                    placeholderTextColor="$gray9"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </YStack>
              )}

              <Card.Footer mt="$4">
                <YStack w="100%" gap="$2">
                  {currentEvent.payload?.options && currentEvent.payload.options.length > 0 ? (
                    currentEvent.payload.options.map((opt) => (
                      <Button
                        key={opt.id}
                        w="100%"
                        theme={opt.id.toLowerCase().includes('approve') || opt.id.toLowerCase().includes('yes') ? 'active' : undefined}
                        disabled={submittingId !== null}
                        onPress={() => handleAction(currentEvent.eventId, opt.id)}
                        height="auto"
                        py="$3"
                        px="$4"
                        jc="flex-start"
                        ai="center"
                      >
                        {submittingId === currentEvent.eventId ? (
                          <Spinner />
                        ) : (
                          <Text col="$color" fos="$3" f={1} style={{ flexWrap: 'wrap' }}>
                            {opt.label}
                          </Text>
                        )}
                      </Button>
                    ))
                  ) : (
                    <>
                      <Button
                        w="100%"
                        variant="outlined"
                        theme="alt1"
                        disabled={submittingId !== null}
                        onPress={() => handleAction(currentEvent.eventId, 'REJECT')}
                      >
                        {t('dashboard.reject')}
                      </Button>
                      <Button
                        w="100%"
                        theme="active"
                        disabled={submittingId !== null}
                        onPress={() => handleAction(currentEvent.eventId, 'APPROVE')}
                      >
                        {submittingId === currentEvent.eventId ? <Spinner color="white" /> : t('dashboard.approve')}
                      </Button>
                    </>
                  )}
                </YStack>
              </Card.Footer>
            </Card>

            {queue.length > 1 && (
              <YStack bg="$backgroundPress" p="$3" br="$4" gap="$1">
                <Text fow="bold" fos="$3" col="$colorMuted">
                  {t('dashboard.pendingQueue', { count: queue.length - 1 })}
                </Text>
                {queue.slice(1).map((ev) => (
                  <XStack key={ev.eventId} jc="space-between" ai="center" py="$2">
                    <Text fos="$3" col="$color" numberOfLines={1} style={{ flex: 1 }}>
                      {ev.payload?.title || ev.type}
                    </Text>
                    <Text fos="$2" col="$colorMuted" ml="$2">
                      {ev.metadata?.agentName}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            )}
          </YStack>
        ) : (
          <YStack ai="center" jc="center" py="$8" gap="$3">
            <Circle size={80} bg="$backgroundPress" jc="center" ai="center">
              <Text fos="$8">🛡️</Text>
            </Circle>
            <Text fow="bold" fos="$5" col="$color">{t('dashboard.allClear')}</Text>
            <Text col="$colorMuted" ta="center">
              {t('dashboard.autonomousDescription')}
            </Text>
          </YStack>
        )}

        {history.length > 0 && (
          <YStack mt="$6" gap="$3">
            <Text fow="bold" fos="$4" col="$colorMuted">{t('dashboard.sessionHistory')}</Text>
            <Separator />
            {history.map((entry) => (
              <Card
                key={entry.event.eventId}
                borderWidth={1}
                p="$3"
                theme="dark"
                pressStyle={{ opacity: 0.85, scale: 0.98 }}
                onPress={() => openHistoryDetail(entry)}
              >
                <XStack jc="space-between" ai="center">
                  <YStack f={1}>
                    <Text fos="$3" fow="bold" col="$color" numberOfLines={1}>
                      {entry.event.payload?.title || entry.event.type}
                    </Text>
                    <Text fos="$2" col="$colorMuted">
                      {t('dashboard.resolved')} • {entry.event.metadata?.agentName}
                    </Text>
                  </YStack>
                  <XStack ai="center" gap="$2">
                    <Text col="$green10" fow="bold" fos="$2">{t('dashboard.resolvedUppercase')}</Text>
                    <Text col="$colorMuted" fos="$2">›</Text>
                  </XStack>
                </XStack>
              </Card>
            ))}
          </YStack>
        )}

        {telemetryLogs.length > 0 && (
          <YStack mt="$6" gap="$3">
            <Text fow="bold" fos="$4" col="$colorMuted">{'Live Telemetry Logs'}</Text>
            <Separator />
            {telemetryLogs.map((log) => {
              let icon = 'ℹ️';
              let iconBg = '$backgroundPress';
              if (log.type === 'FILE_CREATED') { icon = '📄'; iconBg = 'rgba(0, 255, 0, 0.1)'; }
              else if (log.type === 'FILE_MUTATED') { icon = '📝'; iconBg = 'rgba(255, 165, 0, 0.1)'; }
              else if (log.type === 'FILE_DELETED') { icon = '🗑️'; iconBg = 'rgba(255, 0, 0, 0.1)'; }
              else if (log.type === 'TERMINAL_COMMAND_STARTED') { icon = '💻'; iconBg = 'rgba(0, 128, 255, 0.1)'; }
              else if (log.type === 'TERMINAL_COMMAND_ENDED') { icon = '✅'; iconBg = 'rgba(0, 255, 0, 0.1)'; }

              return (
                <Card key={log.eventId} borderWidth={1} p="$3" theme="dark" bg="$backgroundPress">
                  <XStack gap="$3" ai="center">
                    <Circle size={36} bg={iconBg as any} jc="center" ai="center">
                      <Text fos="$4">{icon}</Text>
                    </Circle>
                    <YStack f={1}>
                      <Text fos="$3" fow="bold" col="$color">
                        {log.payload?.title || log.type}
                      </Text>
                      <Text fos="$2" col="$colorMuted" numberOfLines={2}>
                        {log.payload?.description}
                      </Text>
                      {log.payload?.command && (
                        <Text fos="$1" col="$green10" ff="$mono" mt="$1" numberOfLines={1} bg="$background" p="$1" br="$1">
                          {log.payload.command}
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                </Card>
              );
            })}
          </YStack>
        )}
      </ScrollView>

      {/* Session History Detail Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        snapPoints={[85]}
        dismissOnSnapToBottom
        modal
      >
        <Sheet.Overlay />
        <Sheet.Handle />
        <Sheet.Frame p="$4" bg="$background">
          {selectedHistoryEntry && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$4">
                {/* Sheet Header */}
                <XStack jc="space-between" ai="center">
                  <Text fos="$5" fow="bold" col="$color">
                    {t('historyDetail.title')}
                  </Text>
                  <Button size="$3" variant="outlined" onPress={() => setSheetOpen(false)}>
                    {t('historyDetail.close')}
                  </Button>
                </XStack>

                {/* Metadata Card */}
                <Card borderWidth={1} p="$3" gap="$2" bg="$backgroundPress">
                  <Text fos="$3" fow="bold" col="$colorMuted" textTransform="uppercase" mb="$1">
                    {t('historyDetail.sectionMetadata')}
                  </Text>
                  <Separator mb="$2" />
                  {[
                    { label: t('historyDetail.labelIde'), value: selectedHistoryEntry.event.metadata?.ide || '—' },
                    { label: t('historyDetail.labelAgent'), value: selectedHistoryEntry.event.metadata?.agentName || '—' },
                    { label: t('historyDetail.labelStatus'), value: t('dashboard.resolvedUppercase') },
                    { label: t('historyDetail.labelTimestamp'), value: formatTimestamp(selectedHistoryEntry.resolvedAt) },
                  ].map(({ label, value }) => (
                    <XStack key={label} jc="space-between" ai="center" py="$1">
                      <Text fos="$2" col="$colorMuted" fow="bold">{label}</Text>
                      <Text fos="$2" col="$color" ta="right" numberOfLines={1} style={{ flex: 1, textAlign: 'right', marginLeft: 8 }}>{value}</Text>
                    </XStack>
                  ))}
                </Card>

                {/* Request Details */}
                <Card borderWidth={1} p="$3" gap="$2">
                  <Text fos="$3" fow="bold" col="$colorMuted" textTransform="uppercase" mb="$1">
                    {t('historyDetail.sectionDetails')}
                  </Text>
                  <Separator mb="$2" />
                  <Text fos="$5" fow="bold" col="$color" mb="$1">
                    {selectedHistoryEntry.event.payload?.title}
                  </Text>
                  {selectedHistoryEntry.event.payload?.description && (
                    <Text fos="$3" col="$colorMuted" mb="$2">
                      {selectedHistoryEntry.event.payload.description}
                    </Text>
                  )}
                  {selectedHistoryEntry.event.payload?.directory && (
                    <YStack bg="$backgroundPress" p="$2" br="$2" mb="$2">
                      <Text fos="$2" col="$colorMuted" fow="bold">{t('historyDetail.labelDirectory')}</Text>
                      <Text fos="$2" col="$color" ff="$mono">{selectedHistoryEntry.event.payload.directory}</Text>
                    </YStack>
                  )}
                  {selectedHistoryEntry.event.payload?.command && (
                    <YStack bg="$backgroundPress" p="$2" br="$2" mb="$2">
                      <Text fos="$2" col="$colorMuted" fow="bold">{t('historyDetail.labelCommand')}</Text>
                      <Text fos="$2" col="$green10" ff="$mono">{selectedHistoryEntry.event.payload.command}</Text>
                    </YStack>
                  )}
                  {selectedHistoryEntry.event.payload?.prompt && (
                    <YStack borderLeftWidth={3} borderLeftColor="$blue10" bg="$backgroundPress" p="$2" br="$2" mb="$2">
                      <Text fos="$2" col="$colorMuted" fow="bold" mb="$1">{t('historyDetail.labelPrompt')}</Text>
                      <Text fos="$2" col="$color" ff="$mono">{selectedHistoryEntry.event.payload.prompt}</Text>
                    </YStack>
                  )}
                  {selectedHistoryEntry.event.payload?.diff && (
                    <YStack bg="$backgroundPress" br="$2" ov="hidden" borderWidth={1} borderColor="$borderColor">
                      <XStack bg="$background" p="$2" borderBottomWidth={1} borderBottomColor="$borderColor">
                        <Text fos="$2" col="$colorMuted" fow="bold">{t('historyDetail.labelDiff')}</Text>
                      </XStack>
                      <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 200 }}>
                        <YStack p="$2">
                          {selectedHistoryEntry.event.payload.diff.split('\n').map((line, idx) => {
                            let lineCol = '$color';
                            if (line.startsWith('+')) lineCol = '$green10';
                            else if (line.startsWith('-')) lineCol = '$red10';
                            else if (line.startsWith('@@')) lineCol = '$blue10';
                            return (
                              <Text key={idx} fos="$2" col={lineCol} ff="$mono">{line}</Text>
                            );
                          })}
                        </YStack>
                      </ScrollView>
                    </YStack>
                  )}
                </Card>

                {/* User Response Card */}
                <Card borderWidth={1} p="$3" gap="$2" bg="$backgroundPress">
                  <Text fos="$3" fow="bold" col="$colorMuted" textTransform="uppercase" mb="$1">
                    {t('historyDetail.sectionResponse')}
                  </Text>
                  <Separator mb="$2" />
                  <XStack jc="space-between" ai="center" mb="$2">
                    <Text fos="$2" col="$colorMuted" fow="bold">{t('historyDetail.labelSelected')}</Text>
                    <XStack
                      bg={selectedHistoryEntry.selectedOptionId.toLowerCase().includes('approve') ? '$green3' : '$red3'}
                      px="$3"
                      py="$1"
                      br="$10"
                    >
                      <Text
                        fow="bold"
                        fos="$2"
                        col={selectedHistoryEntry.selectedOptionId.toLowerCase().includes('approve') ? '$green10' : '$red10'}
                        textTransform="uppercase"
                      >
                        {selectedHistoryEntry.selectedOptionId}
                      </Text>
                    </XStack>
                  </XStack>
                  <YStack>
                    <Text fos="$2" col="$colorMuted" fow="bold" mb="$1">{t('historyDetail.labelFeedback')}</Text>
                    <Text fos="$3" col={selectedHistoryEntry.feedbackText ? '$color' : '$colorMuted'} fontStyle={selectedHistoryEntry.feedbackText ? 'normal' : 'italic'}>
                      {selectedHistoryEntry.feedbackText || t('historyDetail.noFeedback')}
                    </Text>
                  </YStack>
                </Card>
              </YStack>
            </ScrollView>
          )}
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
