'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Flame, Link2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SOCKET_EVENTS } from '@wordchain/socket-events';
import { getGameSocket } from '@/lib/socket';
import { saveSession } from '@/lib/session';
import { getGuestName, saveGuestName } from "@/lib/guest";

const timerChoices = [10, 15, 20, 30];

export default function CreateRoomPage() {
  const router = useRouter();
const [username, setUsername] = useState('');
useEffect(() => {
  setUsername(getGuestName());
}, []);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [roomCode, setRoomCode] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
useEffect(() => {
  setOrigin(window.location.origin);
}, []);


useEffect(() => {
  const socket = getGameSocket();
  const handleError = ({ message }: { message: string }) => {
    setStatus('error');
    setError(message);
  };
  socket.on('error', handleError);
  return () => { socket.off('error', handleError); };
}, []); 

const handleCreateRoom = () => {
  if (!username.trim()) {
    setStatus('error');
    setError('Enter a username before creating a room.');
    return;
  }

  setStatus('creating');
  setError('');
  saveGuestName(username.trim()); // persist custom name
  const socket = getGameSocket();


  socket.emit(
    SOCKET_EVENTS.CREATE_ROOM,
    { username: username.trim(), mode: 'casual', timerSeconds },
    (response: { room: { roomCode: string }; player: { id: string } }) => {
      setRoomCode(response.room.roomCode);
      saveSession({ roomCode: response.room.roomCode, playerId: response.player.id, username: username.trim() });
      setStatus('ready');
      router.push(`/room/${response.room.roomCode}`);
    },
  );
};

  const handleJoinRoom = () => {
    const code = joinRoomCode.trim().toUpperCase();
    if (!code) {
      setStatus('error');
      setError('Enter a room code to join another player.');
      return;
    }

    router.push(`/join-room?room=${code}`);
  };

  const inviteLink = roomCode ? `${origin}/join-room?room=${roomCode}` : '';

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
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
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-[#8f8f8c] font-sans font-semibold">
            Daily Word Games
          </p>
        </header>
        </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-start">
        <section className="glass-card p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-500 font-bold">Create Room</p>
          <h1 className="mt-3 text-4xl font-bold text-[#f5f5f3]">Set the pace for the match.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#8f8f8c]">
            Generate an invite-only room, choose the tempo, and let your friends join by code or link. The backend owns the match clock and validates every submitted word.
          </p>

          <div className="mt-8 grid gap-4">
            <label className="space-y-2">
              <span className="text-sm text-[#8f8f8c] font-semibold">Username</span>
              <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your display name" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-[#8f8f8c] font-semibold">Timer</span>
                <select className="field" value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value))}>
                  {timerChoices.map((choice) => (
                    <option key={choice} value={choice} className="bg-[#1e1e1c]">
                      {choice} seconds
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Button onClick={handleCreateRoom} className="mt-2 w-full">
              {status === 'creating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
              Create private room
            </Button>
            {error ? <p className="text-sm text-error">{error}</p> : null}
          </div>
        </section>

        <aside className="glass-panel p-6">
          <div className="flex items-center justify-between border-b border-[#2e2e2a] pb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#8f8f8c]">Waiting room</p>
              <h2 className="mt-1 text-2xl font-bold text-[#f5f5f3]">Invite lobby</h2>
            </div>
            <Users className="h-5 w-5 text-amber-500" />
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
              <p className="text-sm text-[#8f8f8c]">Invitation link</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#2e2e2a] bg-[#1e1e1c] px-3 py-3 text-sm text-[#f5f5f3]">
                <Link2 className="h-4 w-4 text-amber-500" />
                <span className="truncate">{inviteLink || 'Create a room to generate a link'}</span>
              </div>
              <Button
                variant="secondary"
                className="mt-3 w-full"
                onClick={async () => {
                  if (!inviteLink) return;
                  await navigator.clipboard.writeText(inviteLink);
                }}
                disabled={!inviteLink}
              >
                <Copy className="h-4 w-4" />
                Copy invite link
              </Button>
            </div>
            <div className="rounded-lg border border-[#2e2e2a] bg-[#121211] p-4">
              <p className="text-sm text-[#8f8f8c]">Join a room</p>
              <p className="mt-2 text-sm leading-6 text-[#f5f5f3]">
                Have a code from another player? Use it here to jump straight to the join screen.
              </p>
              <input
                className="field mt-3 uppercase tracking-[0.35em]"
                value={joinRoomCode}
                onChange={(event) => setJoinRoomCode(event.target.value)}
                placeholder="ABC123"
                maxLength={8}
              />
              <Button variant="secondary" className="mt-3 w-full" onClick={handleJoinRoom}>
                Join room
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
