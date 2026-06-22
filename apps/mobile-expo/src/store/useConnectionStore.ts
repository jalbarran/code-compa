import { create } from 'zustand';
import { createConnectTransport } from '@connectrpc/connect-web';
import { createClient } from '@connectrpc/connect';
import { CompanionService } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_connect';
import { AgentEvent } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_pb';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

async function triggerHapticNotification() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (e) {
    // Ignore haptic errors on unsupported platforms/devices
  }
}

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
export type UserTheme = 'system' | 'light' | 'dark';
export type UserLanguage = 'en' | 'es';

export interface HistoryEntry {
  event: AgentEvent;
  selectedOptionId: string;
  feedbackText: string;
  resolvedAt: number; // unix timestamp ms
}

interface ConnectionState {
  ip: string | null;
  port: number | null;
  token: string | null;
  status: ConnectionStatus;
  errorMessage: string | null;
  queue: AgentEvent[];
  history: HistoryEntry[];
  telemetryLogs: AgentEvent[];
  activeConnections: any[];
  deviceName: string;

  // User preferences
  userTheme: UserTheme;
  userLanguage: UserLanguage;
  hapticsEnabled: boolean;
  notificationFilter: 'all' | 'agent_thinking' | 'agent_actions';

  connect: (ip: string, port: number, token: string) => Promise<void>;
  disconnect: () => void;
  respond: (eventId: string, optionId: string, feedbackText?: string) => Promise<boolean>;
  fetchActiveConnections: () => Promise<void>;
  revokeConnection: (id: string) => Promise<boolean>;

  // Preferences actions
  setTheme: (theme: UserTheme) => void;
  setLanguage: (lang: UserLanguage) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setNotificationFilter: (filter: 'all' | 'agent_thinking' | 'agent_actions') => void;
  setDeviceName: (name: string) => void;
}

let activeAbortController: AbortController | null = null;

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  ip: null,
  port: null,
  token: null,
  status: 'DISCONNECTED',
  errorMessage: null,
  queue: [],
  history: [],
  telemetryLogs: [],
  activeConnections: [],
  deviceName: Platform.OS === 'web' ? 'Web Companion' : (Platform.OS === 'android' ? 'Android Device' : 'iOS Device'),

  // Preference defaults
  userTheme: 'system',
  userLanguage: 'en',
  hapticsEnabled: true,
  notificationFilter: 'all',

  setTheme: (theme) => set({ userTheme: theme }),
  setLanguage: (lang) => set({ userLanguage: lang }),
  setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
  setNotificationFilter: (filter) => set({ notificationFilter: filter }),
  setDeviceName: (name) => set({ deviceName: name }),

  connect: async (ip, port, token) => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    set({ ip, port, token, status: 'CONNECTING', errorMessage: null, queue: [], telemetryLogs: [], activeConnections: [] });

    const transport = createConnectTransport({
      baseUrl: `http://${ip}:${port}`,
      interceptors: [
        (next) => async (req) => {
          req.header.set('Authorization', `Bearer ${token}`);
          return await next(req);
        }
      ]
    });

    const client = createClient(CompanionService, transport);
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      const stream = client.streamAgentEvents({ deviceName: get().deviceName }, { signal: abortController.signal });
      set({ status: 'CONNECTED' });

      // Load initial active connections
      get().fetchActiveConnections();

      (async () => {
        try {
          for await (const event of stream) {
            if (event.type === 'INTERVENTION_RESOLVED') {
              set((state) => ({
                queue: state.queue.filter((e) => e.eventId !== event.eventId)
              }));
              continue;
            }

            set((state) => {
              const isTelemetry = event.type.startsWith('FILE_') || event.type.startsWith('TERMINAL_') || event.type.includes('TEST_EVENT') || event.type === 'agent_thinking' || event.type === 'agent_actions';
              if (isTelemetry) {
                if (state.telemetryLogs.some((e) => e.eventId === event.eventId)) {
                  return state;
                }
                return { telemetryLogs: [event, ...state.telemetryLogs] };
              } else {
                if (state.queue.some((e) => e.eventId === event.eventId)) {
                  return state;
                }
                // Trigger alerts
                if (state.hapticsEnabled) {
                  triggerHapticNotification();
                }
                return { queue: [event, ...state.queue] };
              }
            });
          }
        } catch (streamErr: any) {
          if (streamErr.name === 'AbortError' || abortController.signal.aborted) {
            return;
          }
          console.error('Stream error:', streamErr);
          set({ status: 'ERROR', errorMessage: streamErr.message || 'Stream connection failed' });
        }
      })();
    } catch (err: any) {
      console.error('Connection error:', err);
      set({ status: 'ERROR', errorMessage: err.message || 'Failed to connect to companion bridge' });
    }
  },

  disconnect: () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    set({ ip: null, port: null, token: null, status: 'DISCONNECTED', queue: [], telemetryLogs: [], errorMessage: null, activeConnections: [] });
  },

  respond: async (eventId, optionId, feedbackText = '') => {
    const { ip, port, token, status } = get();
    if (status !== 'CONNECTED' || !ip || !port || !token) {
      return false;
    }

    const transport = createConnectTransport({
      baseUrl: `http://${ip}:${port}`,
      interceptors: [
        (next) => async (req) => {
          req.header.set('Authorization', `Bearer ${token}`);
          return await next(req);
        }
      ]
    });

    const client = createClient(CompanionService, transport);

    try {
      const response = await client.respondToIntervention({
        eventId,
        selectedOptionId: optionId,
        feedbackText,
      });

      if (response.success) {
        set((state) => {
          const event = state.queue.find((e) => e.eventId === eventId);
          const newQueue = state.queue.filter((e) => e.eventId !== eventId);
          const newHistory: HistoryEntry[] = event
            ? [{ event, selectedOptionId: optionId, feedbackText, resolvedAt: Date.now() }, ...state.history]
            : state.history;
          return { queue: newQueue, history: newHistory };
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to submit intervention response:', err);
      return false;
    }
  },

  fetchActiveConnections: async () => {
    const { ip, port, token, status } = get();
    if (status !== 'CONNECTED' || !ip || !port || !token) {
      return;
    }
    const transport = createConnectTransport({
      baseUrl: `http://${ip}:${port}`,
      interceptors: [
        (next) => async (req) => {
          req.header.set('Authorization', `Bearer ${token}`);
          return await next(req);
        }
      ]
    });
    const client = createClient(CompanionService, transport);
    try {
      const res = await client.listConnections({});
      set({ activeConnections: res.connections || [] });
    } catch (err) {
      console.error('Failed to list connections:', err);
    }
  },

  revokeConnection: async (id: string) => {
    const { ip, port, token, status } = get();
    if (status !== 'CONNECTED' || !ip || !port || !token) {
      return false;
    }
    const transport = createConnectTransport({
      baseUrl: `http://${ip}:${port}`,
      interceptors: [
        (next) => async (req) => {
          req.header.set('Authorization', `Bearer ${token}`);
          return await next(req);
        }
      ]
    });
    const client = createClient(CompanionService, transport);
    try {
      const res = await client.disconnectConnection({ id });
      if (res.success) {
        await get().fetchActiveConnections();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to revoke connection:', err);
      return false;
    }
  }
}));
