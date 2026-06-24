import type { MatchMode, RoomSnapshot } from '@wordchain/shared';

export interface WorkerEnv {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  JWT_SECRET?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  CORS_ORIGIN?: string;
  CONFIG?: KVNamespace;
  MATCH_JOBS?: Queue;
}

export interface ClientMessage {
  event: string;
  payload?: unknown;
  requestId?: string;
}

export interface ServerMessage {
  event?: string;
  payload?: unknown;
  requestId?: string;
  error?: string;
}

export interface RoomCreationInput {
  username: string;
  mode?: MatchMode;
  timerSeconds?: number;
  roomCode?: string;
}

export interface RoomJoinInput {
  roomCode: string;
  username: string;
  playerId?: string;
}

export interface RoomActionInput {
  roomCode: string;
}

export interface RoomStartResponse {
  room: RoomSnapshot;
  playerId: string;
}
