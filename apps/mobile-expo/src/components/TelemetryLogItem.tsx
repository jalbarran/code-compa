import React from 'react';
import { ScrollView } from 'react-native';
import { Card, XStack, YStack, Text, Circle } from 'tamagui';
import { AgentEvent } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_pb';

interface TelemetryLogItemProps {
  log: AgentEvent;
}

export function TelemetryLogItem({ log }: TelemetryLogItemProps) {
  let icon = 'ℹ️';
  let iconBg = '$backgroundPress';
  
  if (log.type === 'FILE_CREATED') {
    icon = '📄';
    iconBg = 'rgba(0, 255, 0, 0.1)';
  } else if (log.type === 'FILE_MUTATED') {
    icon = '📝';
    iconBg = 'rgba(255, 165, 0, 0.1)';
  } else if (log.type === 'FILE_DELETED') {
    icon = '🗑️';
    iconBg = 'rgba(255, 0, 0, 0.1)';
  } else if (log.type === 'TERMINAL_COMMAND_STARTED') {
    icon = '💻';
    iconBg = 'rgba(0, 128, 255, 0.1)';
  } else if (log.type === 'TERMINAL_COMMAND_ENDED') {
    icon = '✅';
    iconBg = 'rgba(0, 255, 0, 0.1)';
  } else if (log.type === 'agent_thinking') {
    icon = '🧠';
    iconBg = 'rgba(128, 0, 255, 0.1)';
  } else if (log.type === 'agent_actions') {
    icon = '⚡';
    iconBg = 'rgba(255, 215, 0, 0.1)';
  }

  const timestampNum = log.metadata?.timestamp ? Number(log.metadata.timestamp) : Date.now();
  const timeStr = new Date(timestampNum).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <Card key={log.eventId} borderWidth={1} p="$3" theme="dark" bg="$backgroundPress">
      <XStack gap="$3" ai="center">
        <Circle size={36} bg={iconBg as any} jc="center" ai="center">
          <Text fos="$4">{icon}</Text>
        </Circle>
        <YStack f={1}>
          <XStack jc="space-between" ai="center">
            <Text fos="$3" fow="bold" col="$color" f={1} numberOfLines={1}>
              {log.payload?.title || log.type}
            </Text>
            <Text fos="$1" col="$colorMuted" ml="$2">
              {timeStr}
            </Text>
          </XStack>
          <Text fos="$2" col="$colorMuted" numberOfLines={2}>
            {log.payload?.description}
          </Text>
          {log.payload?.command && (
            <Text fos="$1" col="$green10" ff="$mono" mt="$1" numberOfLines={1} bg="$background" p="$1" br="$1">
              {log.payload.command}
            </Text>
          )}
          {log.payload?.commandOutput ? (
            <ScrollView style={{ maxHeight: 120, marginTop: 8 }} nestedScrollEnabled>
              <YStack bg="$background" p="$2" br="$2">
                <Text fos="$1" col="$color" ff="$mono">
                  {log.payload.commandOutput}
                </Text>
              </YStack>
            </ScrollView>
          ) : null}
        </YStack>
      </XStack>
    </Card>
  );
}
