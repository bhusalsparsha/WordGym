import { create } from 'zustand';
import type { RoomSnapshot } from '@wordchain/shared';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface ChatMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface GameStore {
  connectionState: ConnectionState;
  room: RoomSnapshot | null;
  playerId: string | null;
  username: string | null;
  messages: ChatMessage[];
  timerExpiresAt: string | null;
  setConnectionState: (state: ConnectionState) => void;
  setIdentity: (identity: { playerId: string; username: string }) => void;
  setRoom: (room: RoomSnapshot) => void;
  pushMessage: (message: Omit<ChatMessage, 'id'>) => void;
  setTimer: (timerExpiresAt: string | null) => void;
  reset: () => void;
}

const createMessageId = () => Math.random().toString(36).slice(2, 10);

export const useGameStore = create<GameStore>((set) => ({
  connectionState: 'idle',
  room: null,
  playerId: null,
  username: null,
  messages: [],
  timerExpiresAt: null,
  setConnectionState: (connectionState) => set({ connectionState }),
  setIdentity: ({ playerId, username }) => set({ playerId, username }),
  setRoom: (room) => set({ room, timerExpiresAt: room.turnExpiresAt }),
  pushMessage: (message) =>
    set((state) => ({ messages: [...state.messages.slice(-5), { ...message, id: createMessageId() }] })),
  setTimer: (timerExpiresAt) => set({ timerExpiresAt }),
  reset: () =>
    set({
      connectionState: 'idle',
      room: null,
      playerId: null,
      username: null,
      messages: [],
      timerExpiresAt: null,
    }),
}));
