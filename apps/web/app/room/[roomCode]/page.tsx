'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, Copy, RefreshCcw, Share2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SOCKET_EVENTS } from '@wordchain/socket-events';
import { getGameSocket } from '@/lib/socket';
import { loadSession, saveSession } from '@/lib/session';
import type { RoomSnapshot } from '@wordchain/shared';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [origin, setOrigin] = useState('');

  const activePlayers = (room?.players ?? []).filter((player) => player.connectionStatus !== 'disconnected');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const socket = getGameSocket();
    const session = loadSession();

    const handleSnapshot = (payload: { room: RoomSnapshot }) => {
      setRoom(payload.room);
    };

    socket.on(SOCKET_EVENTS.ROOM_SNAPSHOT, handleSnapshot);
    socket.on(SOCKET_EVENTS.GAME_STARTED, ({ room: nextRoom }: { room: RoomSnapshot }) => {
      setRoom(nextRoom);
      router.push(`/game/${nextRoom.roomCode}`);
    });

    socket.connect();
    socket.emit(
      SOCKET_EVENTS.JOIN_ROOM,
      {
        roomCode,
        username: session?.username ?? 'Guest',
        playerId: session?.playerId,
      },
      (response: { room?: RoomSnapshot; player?: { id: string }; error?: string; suggestedUsername?: string }) => {
        if (response.room && response.room.status !== 'lobby') {
          setNotice('That room does not exist.');
          return;
        }

        if (!response.room || !response.player) {
          if (response.suggestedUsername) {
            socket.emit(
              SOCKET_EVENTS.JOIN_ROOM,
              {
                roomCode,
                username: response.suggestedUsername,
                playerId: session?.playerId,
              },
              (retryResponse: { room?: RoomSnapshot; player?: { id: string } }) => {
                if (!retryResponse.room || !retryResponse.player) {
                  setNotice('That username is already taken. Please pick another one in the join screen.');
                  return;
                }

                setRoom(retryResponse.room);
                saveSession({ roomCode: retryResponse.room.roomCode, playerId: retryResponse.player.id, username: response.suggestedUsername ?? session?.username ?? 'Guest' });
              },
            );
            return;
          }

          setNotice(response.error ?? 'Unable to join room.');
          return;
        }

        setRoom(response.room);
        saveSession({ roomCode: response.room.roomCode, playerId: response.player.id, username: session?.username ?? 'Guest' });
      },
    );

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_SNAPSHOT, handleSnapshot);
      socket.off(SOCKET_EVENTS.GAME_STARTED);
    };
  }, [roomCode, router]);

  const handleToggleReady = () => {
    const socket = getGameSocket();
    const session = loadSession();
    socket.emit(
      SOCKET_EVENTS.PLAYER_READY,
      { roomCode, ready: !isReady },
      () => {
        setIsReady((current) => !current);
        setNotice(!isReady ? 'Ready signal sent. Waiting for the lobby to fill.' : 'Readiness cleared.');
      },
    );
    if (session) {
      saveSession({ ...session, roomCode });
    }
  };

  const inviteLink = origin ? `${origin}/join-room?room=${roomCode}` : '';

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#2e2e2a]/60 pb-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-amber-500 font-bold">Waiting room</p>
          <h1 className="mt-2 text-4xl font-bold text-[#f5f5f3]">Room {roomCode}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(inviteLink)}>
            <Copy className="h-4 w-4" /> Copy invite
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/join-room?room=${roomCode}`)}>
            <Share2 className="h-4 w-4" /> Invite more
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <section className="glass-card p-8">
          <div className="flex items-center justify-between border-b border-[#2e2e2a] pb-4">
            <div>
              <p className="text-sm text-[#8f8f8c]">Lobby status</p>
              <h2 className="mt-1 text-2xl font-bold text-[#f5f5f3]">{room?.status === 'live' ? 'Match already active' : 'Waiting for players'}</h2>
            </div>
            <Users className="h-5 w-5 text-amber-500" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {(activePlayers.length > 0
              ? activePlayers
              : [
                  { id: 'p1', username: 'Player 1', ready: false, score: 0, isHost: true, connectionStatus: 'connected' },
                  { id: 'p2', username: 'Waiting for player', ready: false, score: 0, isHost: false, connectionStatus: 'disconnected' },
                ]
            ).map((player, index) => (
              <motion.div key={player.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#8f8f8c]">Player {index + 1}</p>
                    <p className="mt-1 text-xl font-bold text-[#f5f5f3]">{player.username}</p>
                  </div>
                  <span className={`rounded-md px-3 py-1 text-xs font-semibold ${player.ready ? 'bg-green-500/10 border border-green-500/20 text-green-500' : 'bg-[#1e1e1c] border border-[#2e2e2a] text-[#8f8f8c]'}`}>
                    {player.ready ? 'Ready' : 'Not ready'}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-[#8f8f8c]">
                  <span>Score</span>
                  <span>{player.score}</span>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={handleToggleReady}>{isReady ? 'Mark not ready' : 'I am ready'}</Button>
            <Button variant="secondary" onClick={() => router.push('/create-room')}>
              Leave lobby <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
          {notice ? <p className="mt-4 text-sm text-amber-500">{notice}</p> : null}
        </section>

        <aside className="glass-panel p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-[#8f8f8c] border-b border-[#2e2e2a] pb-3">Share link</p>
          <div className="mt-4 rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8f8f8c]">Invite URL</p>
            <p className="mt-2 break-all text-sm text-[#f5f5f3]">{inviteLink}</p>
          </div>
          <div className="mt-4 rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
            <div className="flex items-center gap-3 text-green-500">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Reconnect support is enabled</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#8f8f8c]">
              If a player refreshes, the same player ID can be passed back to the server and the lobby will restore the previous seat.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
