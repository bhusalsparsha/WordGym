import type { MatchMode, PlayerProfile, RoomSnapshot } from '@wordchain/shared';

export const SOCKET_EVENTS = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  PLAYER_READY: 'player_ready',
  GAME_STARTED: 'game_started',
  SUBMIT_WORD: 'submit_word',
  WORD_ACCEPTED: 'word_accepted',
  WORD_REJECTED: 'word_rejected',
  TURN_CHANGED: 'turn_changed',
  TIMER_UPDATED: 'timer_updated',
  PLAYER_DISCONNECTED: 'player_disconnected',
  PLAYER_RECONNECTED: 'player_reconnected',
  GAME_OVER: 'game_over',
  PLAYER_ELIMINATED: 'player_eliminated',
  YOUR_TURN: 'your_turn',
  REMATCH_REQUESTED: 'rematch_requested',
  REMATCH_ACCEPTED: 'rematch_accepted',
  REMATCH_INVITE: 'rematch_invite',
  ROOM_SNAPSHOT: 'room_snapshot',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export interface CreateRoomPayload {
  username: string;
  mode?: MatchMode;
  timerSeconds?: number;
}

export interface JoinRoomPayload {
  roomCode: string;
  username: string;
  playerId?: string;
}

export interface LeaveRoomPayload {
  roomCode: string;
}

export interface PlayerReadyPayload {
  roomCode: string;
  ready: boolean;
}

export interface SubmitWordPayload {
  roomCode: string;
  word: string;
  clientTurnId?: string;
}

export interface RematchPayload {
  roomCode: string;
}

export interface RematchInvitePayload {
  roomCode: string;
  fromPlayerId: string;
  fromUsername: string;
}

export interface PlayerEliminatedPayload {
  roomCode: string;
  playerId: string;
  remainingPlayerIds: string[];
}

export interface RoomSnapshotPayload {
  room: RoomSnapshot;
  players: PlayerProfile[];
}

export interface WordAcceptedPayload {
  roomCode: string;
  word: string;
  playerId: string;
  nextRequiredLetter: string;
  timerExpiresAt: string | null;
  score: number;
}

export interface WordRejectedPayload {
  roomCode: string;
  word: string;
  reason: string;
  targetPlayerId?: string;
}

export interface YourTurnPayload {
  roomCode: string;
  requiredLetter: string | null;
  timerExpiresAt: string | null;
}

export interface TurnChangedPayload {
  roomCode: string;
  playerId: string;
  timerExpiresAt: string | null;
  requiredLetter: string | null;
}

export interface GameOverPayload {
  roomCode: string;
  winnerId: string | null;
  reason: 'victory' | 'timeout' | 'disconnect' | 'draw';
  statistics: {
    totalWords: number;
    lastWord: string;
    fastestSubmissionMs: number | null;
  };
}
