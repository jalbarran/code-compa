import { create } from 'zustand';
import { createConnectTransport } from '@connectrpc/connect-web';
import { createClient } from '@connectrpc/connect';
import { CompanionService } from '../../../../packages/proto-ts/src/proto/codecompa/v1/companion_connect';
import { AgentEvent } from '../../../../packages/proto-ts/src/proto/codecompa/v1/companion_pb';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

interface ConnectionState {
  ip: string | null;
  port: number | null;
  token: string | null;
  status: ConnectionStatus;
  errorMessage: string | null;
  queue: AgentEvent[];
  history: AgentEvent[];

  connect: (ip: string, port: number, token: string) => Promise<void>;
  disconnect: () => void;
  respond: (eventId: string, optionId: string, feedbackText?: string) => Promise<boolean>;
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

  connect: async (ip, port, token) => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    set({ ip, port, token, status: 'CONNECTING', errorMessage: null, queue: [] });

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
              if (state.queue.some((e) => e.eventId === event.eventId)) {
                return state;
              }
              return { queue: [event, ...state.queue] };
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
    set({ ip: null, port: null, token: null, status: 'DISCONNECTED', queue: [], errorMessage: null });
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
          const newHistory = event ? [event, ...state.history] : state.history;
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
