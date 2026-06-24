'use client';

import { useMemo, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { RefreshCcw, Shield, Trophy, Timer, Hash, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/game-store';
import { SOCKET_EVENTS } from '@wordchain/socket-events';
import { getGameSocket, resetGameSocket } from '@/lib/socket';
import { loadSession } from '@/lib/session';
import type { RoomSnapshot } from '@wordchain/shared';

export default function MatchEndPage() {
  const router = useRouter();
  const params = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();
  const roomCode = params.roomCode.toUpperCase();
  const isSolo = roomCode === 'SOLO';

  // Solo params passed via query string from game page
  const soloScore = searchParams.get('score') ?? '0';
  const soloWords = searchParams.get('words') ?? '0';
  const soloRequiredLetter = searchParams.get('letter') ?? '?';

  // Multiplayer params
  const winnerId = searchParams.get('winner');
  const multiScore = searchParams.get('score') ?? '0';

  const { room, setRoom, playerId } = useGameStore();
  const currentRoom = room?.roomCode.toUpperCase() === roomCode ? room : null;

  const [notification, setNotification] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Establish multiplayer websocket connection to monitor rematch state
  useEffect(() => {
    if (isSolo) return;

    const socket = getGameSocket();
    const session = loadSession();

    socket.connect();

    const handleSnapshot = (payload: { room: RoomSnapshot }) => {
      setRoom(payload.room);
    };

    const handleInvite = (payload: { fromUsername: string; fromPlayerId: string }) => {
      // Avoid notifying about our own requests
      if (payload.fromPlayerId !== playerId) {
        setNotification(`${payload.fromUsername} requested a rematch!`);
        setTimeout(() => {
          setNotification(null);
        }, 4000);
      }
    };

    socket.on(SOCKET_EVENTS.ROOM_SNAPSHOT, handleSnapshot);
    socket.on(SOCKET_EVENTS.REMATCH_REQUESTED, handleSnapshot);
    socket.on(SOCKET_EVENTS.REMATCH_INVITE, handleInvite);
    socket.on(SOCKET_EVENTS.GAME_STARTED, ({ room: nextRoom }: { room: RoomSnapshot }) => {
      setRoom(nextRoom);
      router.push(`/game/${nextRoom.roomCode.toLowerCase()}`);
    });

    // Send a Join Room action to fetch the current room snapshot
    socket.emit(
      SOCKET_EVENTS.JOIN_ROOM,
      {
        roomCode,
        username: session?.username ?? 'Guest',
        playerId: session?.playerId,
      },
      (response: { room?: RoomSnapshot; player?: { id: string } }) => {
        if (response.room) {
          setRoom(response.room);
        }
      }
    );

    return () => {
      resetGameSocket();
    };
  }, [isSolo, roomCode, router, setRoom, playerId]);

  // Rematch countdown countdown tick
  useEffect(() => {
    if (!currentRoom?.rematchStartAt) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(Math.ceil((currentRoom.rematchStartAt! - Date.now()) / 1000), 0);
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 200);

    return () => clearInterval(interval);
  }, [currentRoom?.rematchStartAt]);

  // Solo — derive last word from usedWords in store (skip the starting word at index 0)
  const chainedWords = useMemo(() => {
    if (!isSolo) return [];
    return (currentRoom?.usedWords ?? []).slice(1);
  }, [isSolo, currentRoom?.usedWords]);

  const lastWord = useMemo(() => {
    if (!chainedWords.length) return null;
    return chainedWords[chainedWords.length - 1];
  }, [chainedWords]);

  // Multiplayer winner label
  const currentPlayer = currentRoom?.players.find((p) => p.id === playerId) ?? null;
  const winnerPlayer = currentRoom?.players.find((p) => p.id === winnerId) ?? null;
  const playerOne = currentRoom?.players[0] ?? null;
  const playerTwo = currentRoom?.players[1] ?? null;

  const winnerLabel = useMemo(() => {
    if (!winnerId) return 'Draw';
    if (winnerPlayer) return `Winner: ${winnerPlayer.username}`;
    if (currentPlayer?.id === winnerId) return `Winner: ${currentPlayer.username}`;
    return `Winner: ${winnerId}`;
  }, [currentPlayer, winnerId, winnerPlayer]);

  const matchDescription = useMemo(() => {
    if (currentRoom?.players.length === 2) {
      return `${playerOne?.username ?? 'Player 1'} vs ${playerTwo?.username ?? 'Player 2'}`;
    }
    if (currentRoom?.players.length && currentRoom.players.length > 2) {
      return `The room closed with ${currentRoom.players.length} active players.`;
    }
    return 'The server finalised the match and published the result to all clients.';
  }, [currentRoom?.players.length, playerOne?.username, playerTwo?.username]);

  const handlePlayAgain = () => {
    if (isSolo) {
      router.push('/create-room');
      return;
    }

    const socket = getGameSocket();
    socket.emit(SOCKET_EVENTS.REMATCH_REQUESTED, { roomCode });
  };

  const handleReturnToDashboard = () => {
    resetGameSocket();
    router.push('/');
  };

  const hasRequestedRematch = !isSolo && currentRoom?.rematchRequests?.includes(playerId ?? '');

  if (isSolo) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="glass-panel w-full max-w-2xl p-8"
        >
          {/* Header */}
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-4xl font-serif font-bold text-[#f5f5f3]">Game Over</h1>
          </div>
          <p className="mt-2 text-sm text-[#8f8f8c]">
            Time ran out on the letter{' '}
            <span className="font-bold text-amber-500 uppercase">{soloRequiredLetter}</span>
          </p>

          {/* Last word highlight */}
          {lastWord && (
            <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500">Last Word</p>
              <p className="mt-2 text-4xl font-bold font-sans tracking-widest text-amber-400 uppercase">
                {lastWord}
              </p>
            </div>
          )}

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { icon: Hash, label: 'Words', value: soloWords },
              { icon: Zap, label: 'Score', value: soloScore },
              { icon: Timer, label: 'Time', value: '15s' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5">
                <Icon className="mx-auto h-4 w-4 text-[#8f8f8c] mb-2" />
                <p className="text-2xl font-bold text-[#f5f5f3]">{value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">{label}</p>
              </div>
            ))}
          </div>

          {/* Full chain */}
          {chainedWords.length > 0 && (
            <div className="mt-6 rounded-lg border border-[#2e2e2a] bg-[#121211] p-5 text-left">
              <div className="flex items-center justify-between border-b border-[#2e2e2a] pb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">Full Chain</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">
                  {chainedWords.length} {chainedWords.length === 1 ? 'word' : 'words'}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chainedWords.map((w) => (
                  <span
                    key={w}
                    className="rounded-md border border-[#2e2e2a] bg-[#1e1e1c] px-3 py-1 text-xs font-semibold text-[#f5f5f3] uppercase"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={() => router.push('/create-room')}>
              <RefreshCcw className="h-4 w-4" /> Play Again
            </Button>
            <Button variant="secondary" onClick={() => router.push('/')}>
              Return to Dashboard
            </Button>
          </div>
        </motion.div>
      </main>
    );
  }

  // ── Multiplayer layout
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6 lg:px-8">
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-500 font-semibold"
        >
          {notification}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass-panel w-full max-w-2xl p-8"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
          <Trophy className="h-10 w-10" />
        </div>
        <p className="mt-6 text-xs uppercase tracking-[0.3em] text-amber-500 font-bold">Match complete</p>
        <h1 className="mt-3 text-4xl font-serif font-bold text-[#f5f5f3]">{winnerLabel}</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#8f8f8c]">{matchDescription}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Session score', value: `${multiScore} pts` },
            { label: 'Dictionary size', value: '9k+ words' },
            { label: 'Tempo active', value: '15s limit' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5 text-left">
              <p className="text-xs text-[#8f8f8c] font-bold uppercase tracking-wider">{item.label}</p>
              <p className="mt-2 text-xl font-bold text-[#f5f5f3]">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Players in Room status list */}
        {currentRoom && (
          <div className="mt-8 rounded-lg border border-[#2e2e2a] bg-[#121211] p-5 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c] border-b border-[#2e2e2a] pb-2">
              Players in Room
            </p>
            <div className="mt-3 space-y-2.5">
              {currentRoom.players.map((player) => {
                const requested = currentRoom.rematchRequests?.includes(player.id);
                const isCurrent = player.id === playerId;
                const isDisconnected = player.connectionStatus === 'disconnected';
                return (
                  <div key={player.id} className="flex items-center justify-between py-1 border-b border-[#2e2e2a]/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${isDisconnected ? 'bg-[#ef4444]' : 'bg-green-500'}`} />
                      <span className={`text-sm font-semibold ${isCurrent ? 'text-amber-400' : 'text-[#f5f5f3]'}`}>
                        {player.username} {isCurrent && '(You)'}
                      </span>
                      {player.isSpectator && (
                        <span className="rounded bg-[#2e2e2a] text-[9px] px-1.5 py-0.5 text-[#8f8f8c] font-bold uppercase tracking-wider">
                          Spectator
                        </span>
                      )}
                    </div>
                    <div>
                      {isDisconnected ? (
                        <span className="text-xs text-[#8f8f8c] italic">Left Room</span>
                      ) : requested ? (
                        <span className="rounded bg-green-500/10 border border-green-500/20 text-xs px-2.5 py-0.5 text-green-400 font-semibold">
                          Wants Rematch
                        </span>
                      ) : (
                        <span className="text-xs text-[#8f8f8c] italic">Deciding...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            onClick={handlePlayAgain}
            disabled={hasRequestedRematch || countdown !== null}
          >
            <RefreshCcw className={`h-4 w-4 ${hasRequestedRematch && countdown === null ? 'animate-spin' : ''}`} />{' '}
            {countdown !== null
              ? `Starting in ${countdown}s`
              : hasRequestedRematch
              ? 'Waiting for Rematch...'
              : 'Play Again'}
          </Button>
          <Button variant="secondary" onClick={handleReturnToDashboard}>
            Return to Dashboard
          </Button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#8f8f8c]">
          <Shield className="h-4 w-4 text-green-500" />
          Rules are enforced server-side for multiplayer lobbies.
        </div>
      </motion.div>
    </main>
  );
}