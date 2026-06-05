import { create } from 'zustand';
import { createConnectTransport } from '@connectrpc/connect-web';
import { createClient } from '@connectrpc/connect';
import { CompanionService } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_connect';
import { AgentEvent } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_pb';
import * as Haptics from 'expo-haptics';

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

  // User preferences
  userTheme: UserTheme;
  userLanguage: UserLanguage;
  hapticsEnabled: boolean;

  connect: (ip: string, port: number, token: string) => Promise<void>;
  disconnect: () => void;
  respond: (eventId: string, optionId: string, feedbackText?: string) => Promise<boolean>;

  // Preferences actions
  setTheme: (theme: UserTheme) => void;
  setLanguage: (lang: UserLanguage) => void;
  setHapticsEnabled: (enabled: boolean) => void;
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

  // Preference defaults
  userTheme: 'system',
  userLanguage: 'en',
  hapticsEnabled: true,

  setTheme: (theme) => set({ userTheme: theme }),
  setLanguage: (lang) => set({ userLanguage: lang }),
  setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),

  connect: async (ip, port, token) => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    set({ ip, port, token, status: 'CONNECTING', errorMessage: null, queue: [], telemetryLogs: [] });

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
      const stream = client.streamAgentEvents({}, { signal: abortController.signal });
      set({ status: 'CONNECTED' });

      (async () => {
        try {
          for await (const event of stream) {
            set((state) => {
              const isTelemetry = event.type.startsWith('FILE_') || event.type.startsWith('TERMINAL_') || event.type.includes('TEST_EVENT');
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
    set({ ip: null, port: null, token: null, status: 'DISCONNECTED', queue: [], telemetryLogs: [], errorMessage: null });
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
  }
}));
