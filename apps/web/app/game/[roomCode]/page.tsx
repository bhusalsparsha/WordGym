'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SOCKET_EVENTS } from '@wordchain/socket-events';
import { getGameSocket } from '@/lib/socket';
import { loadSession, saveSession } from '@/lib/session';
import { useGameStore } from '@/store/game-store';
import { recordPlay } from '@/lib/streak';
import type { RoomSnapshot } from '@wordchain/shared';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';


// ---------------------------------------------------------------------------
// Minimal client-side solo dictionary check (uses the same package the server
// uses, so validation is consistent without hitting the socket).
// ---------------------------------------------------------------------------
import { hasWord, getRandomStartingWord } from '@wordchain/dictionary';

const SOLO_PLAYER_ID = 'solo';
const SOLO_TURN_MS = 15_000;

function buildSoloRoom(roomCode: string, username: string, currentWord: string | null, score: number, usedWords: string[], turnExpiresAt: string | null): RoomSnapshot {
  return {
    roomCode: roomCode.toUpperCase(),
    status: 'live',
    mode: 'standard',
    players: [{ id: SOLO_PLAYER_ID, username, ready: true, score, isHost: true, connectionStatus: 'connected', playerNumber: 1 }],
    currentWord,
    requiredLetter: currentWord ? currentWord.at(-1)!.toLowerCase() : null,
    turnExpiresAt,
    usedWords,
    winnerId: null,
    currentTurnPlayerId: SOLO_PLAYER_ID,
  };
}

// ---------------------------------------------------------------------------
// Your-turn toast notification
// ---------------------------------------------------------------------------
function YourTurnToast({ visible, requiredLetter }: { visible: boolean; requiredLetter: string | null }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="your-turn-toast"
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 shadow-lg backdrop-blur-sm"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="text-sm font-bold text-amber-400 tracking-wide">
            Your turn{requiredLetter ? ` — start with "${requiredLetter.toUpperCase()}"` : ''}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function GameRoomPage() {
  const router = useRouter();
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toLowerCase();
  const isSolo = roomCode === 'solo';

  // Multiplayer Socket Ref & Store State
  const socketRef = useRef<ReturnType<typeof getGameSocket> | null>(null);
  const [multiWord, setMultiWord] = useState('');
  const [multiValidationMessage, setMultiValidationMessage] = useState('');
  const [multiTimerDisplay, setMultiTimerDisplay] = useState('--');
  const [timerPct, setTimerPct] = useState(100);
  const { room, setRoom, connectionState, setConnectionState, pushMessage, setIdentity, setTimer, playerId } = useGameStore();

  // Your-turn toast state
  const [yourTurnToast, setYourTurnToast] = useState<{ visible: boolean; requiredLetter: string | null }>({ visible: false, requiredLetter: null });
  const yourTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showYourTurnToast = useCallback((requiredLetter: string | null) => {
    if (yourTurnTimerRef.current) clearTimeout(yourTurnTimerRef.current);
    setYourTurnToast({ visible: true, requiredLetter });
    yourTurnTimerRef.current = setTimeout(() => {
      setYourTurnToast((prev) => ({ ...prev, visible: false }));
    }, 3500);
  }, []);

  const currentRoom = room?.roomCode.toLowerCase() === roomCode ? room : null;
  const currentPlayer = currentRoom?.players.find((p) => p.id === playerId) ?? currentRoom?.players[0] ?? null;
  const isSpectator = currentPlayer?.isSpectator || false;
  const isEliminated = currentPlayer?.isEliminated || false;
  const cannotSubmit = isSpectator || isEliminated;
  const isMyTurn = !isSolo && currentRoom?.currentTurnPlayerId === playerId;

  // ---------------------------------------------------------------------------
  // Solo mode bootstrap — runs once, never touches the socket
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isSolo) return;

    const session = loadSession();
    const username = session?.username ?? 'Guest';
    const startingWord = getRandomStartingWord(4);
    const expiresAt = new Date(Date.now() + SOLO_TURN_MS).toISOString();

    setIdentity({ playerId: SOLO_PLAYER_ID, username });
    setRoom(buildSoloRoom('solo', username, startingWord, 0, [startingWord], expiresAt));
    setTimer(expiresAt);
    setConnectionState('connected');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSolo]);

  // ---------------------------------------------------------------------------
  // Multiplayer socket loop — skipped entirely for solo
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isSolo) return;

    const socket = getGameSocket();
    socketRef.current = socket;
    const session = loadSession();

    setConnectionState('connecting');
    socket.connect();

    const handleSnapshot = (payload: { room: RoomSnapshot }) => {
      setRoom(payload.room);
      setTimer(payload.room.turnExpiresAt);
    };

    socket.on(SOCKET_EVENTS.ROOM_SNAPSHOT, handleSnapshot);
    socket.on(SOCKET_EVENTS.WORD_ACCEPTED, ({ word: acceptedWord }: { word: string }) => {
      setMultiWord('');
      setMultiValidationMessage(`"${acceptedWord.toUpperCase()}" accepted`);
      pushMessage({ text: `${acceptedWord} accepted`, tone: 'success' });
    });
    socket.on(SOCKET_EVENTS.WORD_REJECTED, ({ reason }: { reason: string }) => {
      // Server only sends this to the player who submitted — safe to display
      setMultiValidationMessage(reason);
      pushMessage({ text: reason, tone: 'error' });
    });
    socket.on(SOCKET_EVENTS.YOUR_TURN, ({ requiredLetter }: { requiredLetter: string | null }) => {
      showYourTurnToast(requiredLetter);
      setMultiValidationMessage('');
    });
    socket.on(SOCKET_EVENTS.GAME_OVER, ({ winnerId }: { winnerId: string | null }) => {
      pushMessage({ text: winnerId ? 'Match over' : 'Match ended in a draw', tone: 'info' });
      router.push(`/match/${roomCode}?winner=${winnerId ?? ''}`);
    });
    socket.on(SOCKET_EVENTS.PLAYER_DISCONNECTED, () => pushMessage({ text: 'A player disconnected.', tone: 'info' }));
    socket.on(SOCKET_EVENTS.PLAYER_RECONNECTED, () => pushMessage({ text: 'A player reconnected.', tone: 'success' }));
    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));

    socket.emit(
      SOCKET_EVENTS.JOIN_ROOM,
      {
        roomCode: roomCode.toUpperCase(),
        username: session?.username ?? 'Guest',
        playerId: session?.playerId,
      },
      (response: { room?: RoomSnapshot; player?: { id: string }; error?: string }) => {
        if (!response?.room || !response?.player) return;
        setIdentity({ playerId: response.player.id, username: session?.username ?? 'Guest' });
        saveSession({ roomCode: response.room.roomCode, playerId: response.player.id, username: session?.username ?? 'Guest' });
        setRoom(response.room);
        setTimer(response.room.turnExpiresAt);
      },
    );

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_SNAPSHOT, handleSnapshot);
      socket.off(SOCKET_EVENTS.WORD_ACCEPTED);
      socket.off(SOCKET_EVENTS.WORD_REJECTED);
      socket.off(SOCKET_EVENTS.YOUR_TURN);
      socket.off(SOCKET_EVENTS.GAME_OVER);
      socket.off(SOCKET_EVENTS.PLAYER_DISCONNECTED);
      socket.off(SOCKET_EVENTS.PLAYER_RECONNECTED);
      socket.off('connect');
      socket.off('disconnect');
      if (yourTurnTimerRef.current) clearTimeout(yourTurnTimerRef.current);
    };
  }, [isSolo, roomCode, pushMessage, router, setConnectionState, setIdentity, setRoom, setTimer, showYourTurnToast]);

  // ---------------------------------------------------------------------------
  // Solo mode: end the game when the timer expires
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isSolo || !currentRoom?.turnExpiresAt) return;
    const delay = new Date(currentRoom.turnExpiresAt).getTime() - Date.now();
    if (delay <= 0) return;
    const timeout = setTimeout(() => {
      // Time's up — navigate to the match-end screen with the final score
      const finalScore = currentRoom.players[0]?.score ?? 0;
      const wordCount = Math.max((currentRoom.usedWords.length ?? 1) - 1, 0);
      const letter = currentRoom.requiredLetter ?? '';
      recordPlay();
      router.push(`/match/solo?score=${finalScore}&words=${wordCount}&letter=${letter}`);
    }, delay);
    return () => clearTimeout(timeout);
  }, [isSolo, currentRoom?.turnExpiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown display + smooth progress bar via requestAnimationFrame
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (!currentRoom?.turnExpiresAt) {
        setMultiTimerDisplay('--');
        setTimerPct(100);
        rafId = requestAnimationFrame(tick);
        return;
      }
      const remaining = Math.max(new Date(currentRoom.turnExpiresAt).getTime() - Date.now(), 0);
      setMultiTimerDisplay(`${Math.ceil(remaining / 1000)}s`);
      setTimerPct((remaining / SOLO_TURN_MS) * 100);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [currentRoom?.turnExpiresAt]);

  // ---------------------------------------------------------------------------
  // Submit handler — branches on solo vs multiplayer
  // ---------------------------------------------------------------------------
  const handleSubmitWord = useCallback(() => {
    if (cannotSubmit) return;

    const word = multiWord.trim().toLowerCase();
    if (!word) {
      setMultiValidationMessage('Enter a word first.');
      return;
    }

    if (isSolo) {
      if (!currentRoom) return;
      const required = currentRoom.requiredLetter;

      if (word.length < 2) {
        setMultiValidationMessage('Word must be at least 2 letters.');
        return;
      }
      if (required && word[0] !== required) {
        setMultiValidationMessage(`Word must start with "${required.toUpperCase()}".`);
        return;
      }
      if (currentRoom.usedWords.includes(word)) {
        setMultiValidationMessage('That word was already used.');
        return;
      }
      if (!hasWord(word)) {
        setMultiValidationMessage('Not in the dictionary.');
        return;
      }

      // Accept
      const newScore = (currentRoom.players[0]?.score ?? 0) + 1;
      const newUsedWords = [...currentRoom.usedWords, word];
      const nextExpiry = new Date(Date.now() + SOLO_TURN_MS).toISOString();
      const session = loadSession();
      const updatedRoom = buildSoloRoom('solo', session?.username ?? 'Guest', word, newScore, newUsedWords, nextExpiry);

      setRoom(updatedRoom);
      setTimer(nextExpiry);
      setMultiWord('');
      setMultiValidationMessage(`${word.toUpperCase()} accepted`);
      pushMessage({ text: `${word} accepted`, tone: 'success' });
      return;
    }

    // Multiplayer — guard: not your turn
    if (!isMyTurn) {
      setMultiValidationMessage("It's not your turn.");
      return;
    }

    // Multiplayer path
    const socket = socketRef.current ?? getGameSocket();
    socket.emit(SOCKET_EVENTS.SUBMIT_WORD, { roomCode: roomCode.toUpperCase(), word: multiWord.trim() });
  }, [isSolo, multiWord, currentRoom, roomCode, pushMessage, setRoom, setTimer, cannotSubmit, isMyTurn]);

  // UI mappings
  const currentWord = currentRoom?.currentWord?.toUpperCase() ?? '—';
  const requiredLetter = currentRoom?.requiredLetter?.toUpperCase() ?? '—';
  const usedWords = currentRoom?.usedWords ?? [];
  const timerDisplay = multiTimerDisplay;

  const timerTone = useMemo(() => {
    const value = Number(timerDisplay.replace('s', ''));
    if (!Number.isFinite(value)) return 'text-secondary';
    if (value <= 4) return 'text-[#ef4444]';
    if (value <= 8) return 'text-amber-500';
    return 'text-secondary';
  }, [timerDisplay]);

  const roomTitle = isSolo ? 'Solo Practice' : `Room ${roomCode.toUpperCase()}`;
  const modeSubtitle = isSolo ? 'Solo Mode' : 'Multiplayer Duel';
  const otherActivePlayers = (currentRoom?.players ?? []).filter(
    (p) => p.id !== currentPlayer?.id && p.connectionStatus !== 'disconnected',
  );


  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8 justify-between">
      {/* Your-turn toast overlay */}
      <YourTurnToast visible={yourTurnToast.visible} requiredLetter={yourTurnToast.requiredLetter} />

      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#2e2e2a]/60 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-500 font-sans font-bold">{modeSubtitle}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-serif font-bold text-[#f5f5f3] tracking-tight">{roomTitle}</h1>
        </div>
      </div>

      {/* Primary game layout */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.3fr_0.85fr] items-start my-auto">

        {/* Left column: Player info */}
        <section className="rounded-xl border border-[#2e2e2a] bg-[#1e1e1c] p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#2e2e2a] pb-3">
            <User className="h-4 w-4 text-[#8f8f8c]" />
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#8f8f8c]">Player</p>
          </div>
          <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-[#f5f5f3] text-lg break-all">{currentPlayer?.username ?? 'Player'}</p>
              {!isSolo && (
                <p className={`text-xs mt-0.5 font-semibold ${isMyTurn ? 'text-amber-400' : 'text-[#8f8f8c]'}`}>
                  {isMyTurn ? 'Your turn' : "Opponent's turn"}
                </p>
              )}
            </div>
            <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-sm font-bold text-amber-500 shrink-0">
              {currentPlayer?.score ?? 0} pts
            </span>
          </div>
        </section>

        {/* Center column: Main Word Chain panel */}
        <section className="rounded-xl border border-[#2e2e2a] bg-[#1c1c1a] p-6 space-y-6 shadow-md">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">Current word</p>
              <p className="mt-3 break-all text-3xl font-bold font-sans tracking-wide text-[#f5f5f3]">{currentWord}</p>
            </div>
            <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">Required letter</p>
              <p className={`mt-3 text-5xl font-bold font-sans ${timerTone}`}>{requiredLetter}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-[#8f8f8c]">Time Remaining</span>
              <span className={`text-xl font-bold font-sans ${timerTone}`}>{timerDisplay}</span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#2e2e2a]">
              <div
                className={`h-full ${timerPct <= 27 ? 'bg-[#ef4444]' : timerPct <= 53 ? 'bg-amber-500' : 'bg-primary'}`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <input
              className="field text-lg uppercase tracking-[0.15em] text-center font-bold"
              value={multiWord}
              onChange={(e) => setMultiWord(e.target.value)}
              placeholder={isEliminated ? 'YOU ARE ELIMINATED' : isSpectator ? 'YOU ARE SPECTATING' : 'Type word here'}
              onKeyDown={(e) => e.key === 'Enter' && !cannotSubmit && handleSubmitWord()}
              disabled={cannotSubmit}
            />
            <Button onClick={handleSubmitWord} className="w-full text-base py-3" disabled={cannotSubmit}>
              {cannotSubmit ? 'Spectator Mode' : <>Submit Word <ArrowRight className="h-4 w-4" /></>}
            </Button>

            {multiValidationMessage ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#2e2e2a] bg-[#121211] px-4 py-3 text-xs text-slate-300">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>{multiValidationMessage}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c] border-b border-[#2e2e2a] pb-2">
              Used words log
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              {usedWords.map((entry) => (
                <span key={entry} className="rounded-md border border-[#2e2e2a] bg-[#1e1e1c] px-3 py-1 text-xs text-[#f5f5f3] font-semibold">
                  {entry}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Right column: Opponent info */}
        <section className="rounded-xl border border-[#2e2e2a] bg-[#1e1e1c] p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#2e2e2a] pb-3">
            <Users className="h-4 w-4 text-[#8f8f8c]" />
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#8f8f8c]">
              {isSolo ? 'Practice stats' : 'Other active players'}
            </p>
          </div>

          {isSolo ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
                <p className="text-xs text-[#8f8f8c]">Words chained</p>
                <p className="mt-1 text-2xl font-bold text-[#f5f5f3]">{Math.max((currentRoom?.usedWords.length ?? 1) - 1, 0)}</p>
              </div>
              <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4 text-sm text-[#8f8f8c] leading-relaxed">
                Each word must start with the last letter of the previous word and appear in the dictionary.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {otherActivePlayers.length > 0 ? (
                otherActivePlayers.map((player) => (
                  <div key={player.id} className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-[#f5f5f3] text-lg break-all">{player.username}</p>
                      {currentRoom?.currentTurnPlayerId === player.id && (
                        <p className="text-xs mt-0.5 font-semibold text-amber-400">Thinking…</p>
                      )}
                    </div>
                    <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-sm font-bold text-amber-500 shrink-0">
                      {player.score} pts
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4 text-sm text-[#8f8f8c]">
                  No other active players in this room.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-8 flex justify-center">
        <Link href="/" className="text-xs font-semibold text-[#8f8f8c] hover:text-[#f5f5f3] flex items-center gap-1 transition">
          ← Return to Daily Games dashboard
        </Link>
      </footer>
    </main>
  );
}

