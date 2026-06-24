'use client';

import { Suspense } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, LogIn, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SOCKET_EVENTS } from '@wordchain/socket-events';
import { getGameSocket } from '@/lib/socket';
import { saveSession } from '@/lib/session';
import { getGuestName, saveGuestName } from "@/lib/guest";

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function JoinRoomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
const [roomCode, setRoomCode] = useState(
  () => searchParams.get('room') ?? ''
);
const [username, setUsername] = useState('');
useEffect(() => {
  setUsername(getGuestName());
}, []);
  const [status, setStatus] = useState<'idle' | 'joining' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setRoomCode(code);
    }
  }, [searchParams]);

  const normalizedRoomCode = useMemo(() => normalizeRoomCode(roomCode), [roomCode]);

  const handleJoinRoom = () => {
    if (!normalizedRoomCode || !username.trim()) {
      setStatus('error');
      setMessage('Enter both a room code and username.');
      return;
    }

    setStatus('joining');
    setMessage('');
    saveGuestName(username.trim()); // persist custom name
    const socket = getGameSocket();
    socket.connect();

    socket.emit(
      SOCKET_EVENTS.JOIN_ROOM,
      {
        roomCode: normalizedRoomCode,
        username: username.trim(),
      },
      (response: { room?: { roomCode: string; status?: string }; player?: { id: string }; error?: string }) => {
        if (!response.room || !response.player || response.room.status !== 'lobby') {
          setStatus('error');
          setMessage('That room does not exist.');
          return;
        }

        saveSession({ roomCode: response.room.roomCode, playerId: response.player.id, username: username.trim() });
        setStatus('ready');
        router.push(`/room/${response.room.roomCode}`);
      },
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-10">
        {/* Header Logo */}
        <header className="text-center space-y-1.5 select-none">
          <h1 className="text-5xl sm:text-6xl tracking-tight leading-none">
            <span
              className="font-bold text-[#f5f5f3]"
              style={{ fontFamily: "var(--font-baskerville), 'Libre Baskerville', Georgia, serif" }}
            >
              Word
            </span>
            <span
              className="text-[#f5f5f3]"
              style={{ fontFamily: "'Edu NSW ACT Hand Cursive', cursive", fontWeight: 400 }}
            >
              Gym
            </span>
          </h1>
        </header>
        </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <section className="glass-card p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-500 font-bold">Join Room</p>
          <h1 className="mt-3 text-4xl font-bold text-[#f5f5f3]">Enter the code and jump in.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#8f8f8c]">
            Join a private lobby or reconnect to a match you were already playing. If your saved session matches the room, the backend can restore the same seat.
          </p>

          <div className="mt-8 space-y-4">
            <label className="space-y-2">
              <span className="text-sm text-[#8f8f8c] font-semibold">Room code</span>
              <input className="field uppercase tracking-[0.35em]" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="ABC123" maxLength={8} />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-[#8f8f8c] font-semibold">Username</span>
              <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your display name" />
            </label>

            <Button onClick={handleJoinRoom} className="w-full">
              {status === 'joining' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Join room
            </Button>
            {message ? <p className={`text-sm ${status === 'error' ? 'text-error' : 'text-amber-500'}`}>{message}</p> : null}
          </div>
        </section>

        <aside className="glass-panel p-6">
          <div className="flex items-center gap-3 text-amber-500 font-bold pb-4 border-b border-[#2e2e2a]">
            <Shield className="h-5 w-5" />
            <span className="text-sm uppercase tracking-[0.3em]">Validation</span>
          </div>
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
              <p className="text-sm text-[#8f8f8c]">Instant checks</p>
              <p className="mt-2 text-sm leading-6 text-[#f5f5f3]">
                The backend verifies the room code, current match state, reconnect credentials, and active player status before you enter the lobby.
              </p>
            </div>
            <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
              <p className="text-sm text-[#8f8f8c]">Need a room?</p>
              <Button href="/create-room" variant="secondary" className="mt-3 w-full">
                Create one first <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function JoinRoomPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-[#8f8f8c]">Loading...</div>}>
      <JoinRoomForm />
    </Suspense>
  );
}