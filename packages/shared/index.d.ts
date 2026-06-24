export type GameStatus = 'waiting' | 'active' | 'finished';
export type RoomStatus = 'lobby' | 'ready' | 'live' | 'finished';
export type MatchMode = 'casual' | 'ranked' | 'daily';
export type PlayerConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
export type SubmissionStatus = 'accepted' | 'rejected' | 'expired';

export interface PlayerProfile {
  id: string;
  username: string;
  avatarUrl?: string;
  ready: boolean;
  score: number;
  isHost: boolean;
  connectionStatus: PlayerConnectionStatus;
}

export interface MoveRecord {
  id: string;
  matchId: string;
  playerId: string;
  word: string;
  submittedAt: string;
  accepted: boolean;
  rejectionReason?: string;
}

export interface MatchStatistics {
  totalWords: number;
  lastWord: string;
  fastestSubmissionMs: number | null;
  winnerId: string | null;
}

export interface RoomSnapshot {
  roomCode: string;
  status: RoomStatus;
  mode: MatchMode;
  players: PlayerProfile[];
  currentWord: string | null;
  requiredLetter: string | null;
  turnExpiresAt: string | null;
  usedWords: string[];
  winnerId: string | null;
}

export interface DictionaryValidationResult {
  valid: boolean;
  reason?: string;
  normalizedWord?: string;
}
