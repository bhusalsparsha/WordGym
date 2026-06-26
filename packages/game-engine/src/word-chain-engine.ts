import type { DictionaryValidationResult, GameStatus, MatchMode, MoveRecord, PlayerProfile, RoomSnapshot, SubmissionStatus } from '@wordchain/shared';

export interface WordChainPlayer extends PlayerProfile {
  id: string;
  score: number;
  lastSubmissionAt: number | null;
  isEliminated: boolean;
  isSpectator: boolean;
}

export interface WordChainState {
  roomCode: string;
  status: GameStatus;
  mode: MatchMode;
  players: WordChainPlayer[];
  currentTurnIndex: number;
  currentWord: string | null;
  requiredLetter: string | null;
  usedWords: string[];
  turnDurationMs: number;
  turnExpiresAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  winnerId: string | null;
  moves: MoveRecord[];
}

export interface StartGameInput {
  roomCode: string;
  players: PlayerProfile[];
  startingWord?: string | null;
  mode?: MatchMode;
  turnDurationMs?: number;
  startedAt?: number;
}

export interface SubmitWordInput {
  playerId: string;
  word: string;
  submittedAt?: number;
  dictionary: ReadonlySet<string>;
}

export interface SubmitWordResult {
  state: WordChainState;
  submissionStatus: SubmissionStatus;
  rejectionReason?: string;
  move?: MoveRecord;
}

const MIN_WORD_LENGTH = 2;

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createMoveRecord(matchId: string, playerId: string, word: string, submittedAt: number, accepted: boolean, rejectionReason?: string): MoveRecord {
  return {
    id: generateId('move'),
    matchId,
    playerId,
    word,
    submittedAt: new Date(submittedAt).toISOString(),
    accepted,
    rejectionReason,
  };
}

export function getRequiredLetter(word: string): string {
  const normalized = normalizeWord(word);
  return normalized.at(-1) ?? '';
}

export function validateWord(params: {
  word: string;
  requiredLetter: string | null;
  usedWords: ReadonlySet<string>;
  dictionary: ReadonlySet<string>;
}): DictionaryValidationResult {
  const normalizedWord = normalizeWord(params.word);

  if (normalizedWord.length < MIN_WORD_LENGTH) {
    return { valid: false, reason: 'Word must contain at least two letters.' };
  }

  if (!/^[a-z]+(?:'[a-z]+)?$/u.test(normalizedWord)) {
    return { valid: false, reason: 'Only alphabetic words are allowed.' };
  }

  // requiredLetter is null on the very first word — no starting-letter constraint
  if (params.requiredLetter !== null && params.requiredLetter !== '' && normalizedWord[0] !== params.requiredLetter) {
    return {
      valid: false,
      reason: `Word must start with "${params.requiredLetter.toUpperCase()}".`,
      normalizedWord,
    };
  }

  if (!params.dictionary.has(normalizedWord)) {
    return { valid: false, reason: 'Word was not found in the dictionary.', normalizedWord };
  }

  if (params.usedWords.has(normalizedWord)) {
    return { valid: false, reason: 'That word was already used in this match.', normalizedWord };
  }

  return { valid: true, normalizedWord };
}

export function startGame(input: StartGameInput): WordChainState {
  const startedAt = input.startedAt ?? Date.now();
  // startingWord is null when the first-turn player provides it
  const normalizedStartingWord = input.startingWord ? normalizeWord(input.startingWord) : null;

  return {
    roomCode: input.roomCode,
    status: 'active',
    mode: input.mode ?? 'standard',
players: input.players.map((player, index) => ({
  ...player,
  ready: true,
  score: player.score ?? 0,
  isHost: index === 0 ? true : player.isHost,
  connectionStatus: player.connectionStatus ?? 'connected',
  isSpectator: player.isSpectator ?? false,   // add default
  isEliminated: player.isEliminated ?? false, // add default
  lastSubmissionAt: null,
})),
    currentTurnIndex: 0,
    currentWord: normalizedStartingWord,
    requiredLetter: normalizedStartingWord ? getRequiredLetter(normalizedStartingWord) : null,
    usedWords: normalizedStartingWord ? [normalizedStartingWord] : [],
    turnDurationMs: input.turnDurationMs ?? 15_000,
    turnExpiresAt: startedAt + (input.turnDurationMs ?? 15_000),
    startedAt,
    endedAt: null,
    winnerId: null,
    moves: [],
  };
}

/**
 * Eliminates a player from an active game (3+ player mode).
 * Moves them to spectator status and removes from the turn rotation.
 * Returns null if fewer than 2 active players remain (game should end instead).
 */
export function eliminatePlayer(state: WordChainState, eliminatedPlayerId: string, now: number = Date.now()): WordChainState | null {
  const activePlayers = state.players.filter((p) => !p.isEliminated && !p.isSpectator);
  if (activePlayers.length <= 2) {
    return null;
  }

  const updatedPlayers = state.players.map((p) =>
    p.id === eliminatedPlayerId ? { ...p, isEliminated: true, isSpectator: true } : p,
  );

  const remainingActive = updatedPlayers.filter((p) => !p.isEliminated && !p.isSpectator);
  // Advance turn index to next non-eliminated player
  const currentActive = remainingActive[state.currentTurnIndex % remainingActive.length];
  const nextTurnIndex = state.players.findIndex((p) => p.id === currentActive?.id);

  return {
    ...state,
    players: updatedPlayers,
    currentTurnIndex: nextTurnIndex >= 0 ? nextTurnIndex : 0,
    turnExpiresAt: now + state.turnDurationMs,
  };
}

export function switchTurn(state: WordChainState, nextIndex?: number, now: number = Date.now()): WordChainState {
  if (state.status !== 'active') {
    return state;
  }

  let currentTurnIndex = nextIndex;
  if (currentTurnIndex === undefined) {
    const activePlayers = state.players.filter((p) => !p.isEliminated && !p.isSpectator);
    if (activePlayers.length > 0) {
      const currentActive = state.players[state.currentTurnIndex];
      const activeIdx = activePlayers.findIndex((p) => p.id === currentActive?.id);
      const nextActive = activePlayers[(activeIdx + 1) % activePlayers.length];
      currentTurnIndex = state.players.findIndex((p) => p.id === nextActive?.id);
    } else {
      currentTurnIndex = state.currentTurnIndex;
    }
  }

  return {
    ...state,
    currentTurnIndex: currentTurnIndex >= 0 ? currentTurnIndex : 0,
    turnExpiresAt: now + state.turnDurationMs,
  };
}

export function endGame(state: WordChainState, winnerId: string | null, now: number = Date.now()): WordChainState {
  return {
    ...state,
    status: 'finished',
    endedAt: now,
    winnerId,
    turnExpiresAt: null,
  };
}

export function submitWord(state: WordChainState, input: SubmitWordInput): SubmitWordResult {
  if (state.status !== 'active') {
    return {
      state,
      submissionStatus: 'rejected',
      rejectionReason: 'The match is not active.',
    };
  }

  const activePlayer = state.players[state.currentTurnIndex];
  if (!activePlayer || activePlayer.id !== input.playerId) {
    return {
      state,
      submissionStatus: 'rejected',
      rejectionReason: 'It is not your turn.',
    };
  }

  // const turnExpiresAt = state.turnExpiresAt !== null ? new Date(state.turnExpiresAt).getTime() : null;
  const submittedAt = new Date(input.submittedAt ?? Date.now()).getTime();

  // // FIX: Properly handle timer expiration for games with 3+ players
  // if (turnExpiresAt !== null && !isNaN(turnExpiresAt) && submittedAt > turnExpiresAt) {
  //   const activePlayers = state.players.filter((p) => !p.isEliminated && !p.isSpectator);

  //   if (activePlayers.length > 2) {
  //     // 3+ players remaining: Eliminate the current player and move to the next turn
  //     const nextState = eliminatePlayer(state, activePlayer.id, submittedAt);
  //     return {
  //       state: nextState || state, // Fallback to current state if eliminatePlayer somehow returns null
  //       submissionStatus: 'expired',
  //       rejectionReason: 'The submission arrived after the timer expired.',
  //     };
  //   } else {
  //     // Only 2 players remaining: End the game and declare the other player the winner
  //     const winner = activePlayers.find((player) => player.id !== activePlayer.id);
  //     return {
  //       state: endGame(state, winner?.id ?? null, submittedAt),
  //       submissionStatus: 'expired',
  //       rejectionReason: 'The submission arrived after the timer expired.',
  //     };
  //   }
  // }

  const validation = validateWord({

    word: input.word,
    requiredLetter: state.requiredLetter,
    usedWords: new Set(state.usedWords),
    dictionary: input.dictionary,
  });

  // Invalid words are simply rejected, allowing the player to try again before the timer expires
  if (!validation.valid || !validation.normalizedWord) {
    return {
      state,
      submissionStatus: 'rejected',
      rejectionReason: validation.reason ?? 'Invalid word.',
    };
  }

  const normalizedWord = validation.normalizedWord;
  const updatedMoves = [...state.moves, createMoveRecord(state.roomCode, input.playerId, normalizedWord, submittedAt, true)];
  const updatedPlayers = state.players.map((player) =>
    player.id === input.playerId
      ? {
          ...player,
          score: player.score + 1,
          lastSubmissionAt: submittedAt,
        }
      : player,
  );

  const nextActivePlayers = updatedPlayers.filter((p) => !p.isEliminated && !p.isSpectator);
  let nextTurnIndex = state.currentTurnIndex;
  if (nextActivePlayers.length > 0) {
    const currentActiveIdx = nextActivePlayers.findIndex((p) => p.id === input.playerId);
    const nextActivePlayer = nextActivePlayers[(currentActiveIdx + 1) % nextActivePlayers.length];
    nextTurnIndex = updatedPlayers.findIndex((p) => p.id === nextActivePlayer?.id);
  }

  const nextState: WordChainState = {
    ...state,
    currentWord: normalizedWord,
    requiredLetter: getRequiredLetter(normalizedWord),
    usedWords: [...state.usedWords, normalizedWord],
    currentTurnIndex: nextTurnIndex >= 0 ? nextTurnIndex : state.currentTurnIndex,
    turnExpiresAt: submittedAt + state.turnDurationMs,
    players: updatedPlayers,
    moves: updatedMoves,
  };

  return {
    state: nextState,
    submissionStatus: 'accepted',
    move: updatedMoves.at(-1),
  };
}

export function toRoomSnapshot(state: WordChainState): RoomSnapshot {
  const currentPlayer = state.players[state.currentTurnIndex] ?? null;
  return {
    roomCode: state.roomCode,
    status: state.status === 'active' ? 'live' : state.status === 'waiting' ? 'lobby' : 'finished',
    mode: state.mode,
    players: state.players.map(({ lastSubmissionAt, ...player }) => player),
    currentTurnPlayerId: currentPlayer?.id ?? null,
    currentWord: state.currentWord,
    requiredLetter: state.requiredLetter,
    turnExpiresAt: state.turnExpiresAt ? new Date(state.turnExpiresAt).toISOString() : null,
    usedWords: state.usedWords,
    winnerId: state.winnerId,
  };
}

