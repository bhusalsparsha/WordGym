import { eliminatePlayer, endGame, getRequiredLetter, startGame, submitWord, type WordChainState } from '@wordchain/game-engine';
import { loadDictionary } from '@wordchain/dictionary';
import { SOCKET_EVENTS, type GameOverPayload, type PlayerEliminatedPayload, type RematchInvitePayload, type RematchPayload, type YourTurnPayload } from '@wordchain/socket-events';
import { D1Repository } from './d1';
import type { PlayerProfile, RoomSnapshot } from '@wordchain/shared';
import type { ClientMessage, RoomCreationInput, RoomJoinInput, RoomStartResponse, WorkerEnv } from './types';

interface RoomRecord {
  id: string;
  roomCode: string;
  hostUserId: string;
  status: 'lobby' | 'ready' | 'live' | 'finished';
  mode: 'standard';
  timerSeconds: number;
  players: PlayerProfile[];
  spectators: PlayerProfile[];
  state: WordChainState | null;
  matchId: string | null;
  nextPlayerNumber: number;
  rematchRequests: string[];
  rematchStartAt: number | null;
  createdAt: string;
  updatedAt: string;
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/\s+/g, ' ');
}

function makeUniqueUsername(baseUsername: string, takenUsernames: string[]): string {
  const normalized = normalizeUsername(baseUsername) || 'Player';
  if (!takenUsernames.includes(normalized)) {
    return normalized;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${normalized} ${suffix}`;
    if (!takenUsernames.includes(candidate)) {
      return candidate;
    }
  }

  return `${normalized} ${Math.floor(Math.random() * 1000)}`;
}

export class RoomDurableObject implements RoomDurableObject {
  private room: RoomRecord | null = null;
  private readonly clients = new Set<WebSocket>();
  private readonly clientPlayers = new Map<WebSocket, string>();
  private readonly dictionary = loadDictionary();
  private readonly repository: D1Repository;
  private static readonly REMATCH_DELAY_MS = 5000;
  // Add these to the class body, near REMATCH_DELAY_MS
private static readonly RECONNECT_GRACE_MS = 15_000;
private static readonly DISCONNECT_ALARM_PREFIX = 'disconnect:';

  constructor(private readonly state: DurableObjectState, private readonly env: WorkerEnv) {
    this.repository = new D1Repository(env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket' || url.pathname.endsWith('/ws')) {
      return this.handleWebSocket(request);
    }

    if (request.method === 'POST' && url.pathname.endsWith('/create')) {
      const payload = (await request.json()) as RoomCreationInput;
      return this.createRoom(payload);
    }

    if (request.method === 'POST' && url.pathname.endsWith('/join')) {
      const payload = (await request.json()) as RoomJoinInput;
      return this.joinRoom(payload);
    }

    if (request.method === 'POST' && url.pathname.endsWith('/action')) {
      const payload = (await request.json()) as ClientMessage & { roomCode: string; playerId?: string };
      return this.handleAction(payload);
    }

    if (request.method === 'GET' && url.pathname.endsWith('/snapshot')) {
      await this.loadRoom();
      return Response.json({ room: this.toSnapshot() });
    }

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.loadRoom();
    if (!this.room) {
      return;
    }
      // ── Check for any expired disconnect-grace timers ──
  const now = Date.now();
  const gracEntries = await this.state.storage.list<number>({
    prefix: RoomDurableObject.DISCONNECT_ALARM_PREFIX,
  });

  for (const [key, graceDue] of gracEntries) {
    if (now < graceDue) continue; // not yet expired, skip

    const disconnectedPlayerId = key.slice(RoomDurableObject.DISCONNECT_ALARM_PREFIX.length);
    const player = [...this.room.players, ...this.room.spectators]
      .find((p) => p.id === disconnectedPlayerId);

    // Only act if still disconnected and game is still live
    if (player && player.connectionStatus === 'disconnected' && this.room.status === 'live') {
      await this.state.storage.delete(key);
      // Treat as forfeit: the disconnected player loses
      const activePlayers = this.room.players.filter((p) => !p.isEliminated && !p.isSpectator);
      const winner = activePlayers.find((p) => p.id !== disconnectedPlayerId)?.id ?? null;
      this.room.state = endGame(this.room.state!, winner, now);
      this.room.status = 'finished';
      await this.persistRoom();
      await this.persistMatchSummary(winner);
      this.broadcast(SOCKET_EVENTS.GAME_OVER, this.createGameOverPayload('disconnect', winner));
      return;
    }

    // Player reconnected before grace expired — just clean up the key
    await this.state.storage.delete(key);
  }

  // Re-schedule alarm for the next pending grace timer, if any remain.
  // Only skip turn-timeout processing when the turn timer itself has NOT
  // yet expired — if it has already passed, fall through so the game
  // doesn't stall waiting for the grace period to clear.
  const remaining = await this.state.storage.list<number>({
    prefix: RoomDurableObject.DISCONNECT_ALARM_PREFIX,
  });
  if (remaining.size > 0) {
    const nextDue = Math.min(...remaining.values());
    const turnExpiryVal = this.room.state?.turnExpiresAt
      ? new Date(this.room.state.turnExpiresAt).getTime()
      : Infinity;
    const turnExpiry = isNaN(turnExpiryVal) ? Infinity : turnExpiryVal;
    if (now < turnExpiry) {
      // Turn timer hasn't expired yet — safe to wait for grace period.
      await this.state.storage.setAlarm(Math.min(nextDue, turnExpiry));
      return;
    }
    // Turn timer has also expired — fall through to process it, then
    // reschedule remaining grace alarms afterwards if still needed.
  }

    if (this.room.state?.status === 'active') {
      // Guard: only proceed with elimination if the turn timer has actually expired.
      // This prevents a race condition where alarm() fires concurrently with a
      // word submission (accepted or rejected) and falsely eliminates the player.
      const turnExpiryVal = this.room.state.turnExpiresAt
        ? new Date(this.room.state.turnExpiresAt).getTime()
        : 0;
      const turnExpiry = isNaN(turnExpiryVal) ? 0 : turnExpiryVal;
      if (now < turnExpiry) {
        // Turn is still live — reschedule alarm and do nothing else.
        await this.state.storage.setAlarm(turnExpiry);
        return;
      }

      const activePlayers = this.room.players.filter((p) => !p.isEliminated && !p.isSpectator);
      const losingPlayer = this.room.state.players[this.room.state.currentTurnIndex];

      if (activePlayers.length > 2) {
        // 3+ player game: eliminate timed-out player, continue with the rest
        const newState = eliminatePlayer(this.room.state, losingPlayer?.id ?? '', now);
        if (!newState) {
          // eliminatePlayer returned null — only 2 left, fall through to end
          const winner = activePlayers.find((p) => p.id !== losingPlayer?.id)?.id ?? null;
          this.room.state = endGame(this.room.state, winner, now);
          this.room.status = 'finished';
          this.room.players = this.room.players.map((p) =>
            p.id === losingPlayer?.id ? { ...p, isEliminated: true, isSpectator: true } : p,
          );
          await this.persistRoom();
          await this.persistMatchSummary(winner);
          this.broadcast(SOCKET_EVENTS.GAME_OVER, this.createGameOverPayload('timeout', winner));
          return;
        }

        this.room.state = newState;
        this.room.players = this.room.players.map((p) =>
          p.id === losingPlayer?.id ? { ...p, isEliminated: true, isSpectator: true } : p,
        );
        await this.persistRoom();
        const nextExpiryVal = this.room.state.turnExpiresAt
          ? new Date(this.room.state.turnExpiresAt).getTime()
          : now;
        const nextExpiry = isNaN(nextExpiryVal) ? now : nextExpiryVal;
        await this.state.storage.setAlarm(nextExpiry);

        const eliminatedPayload: PlayerEliminatedPayload = {
          roomCode: this.room.roomCode,
          playerId: losingPlayer?.id ?? '',
          remainingPlayerIds: this.room.players.filter((p) => !p.isEliminated).map((p) => p.id),
        };
        this.broadcast(SOCKET_EVENTS.PLAYER_ELIMINATED, eliminatedPayload);
        const nextAlarmPlayerId = this.room.state.players[this.room.state.currentTurnIndex]?.id ?? '';
        const alarmTimerISO = this.room.state.turnExpiresAt ? new Date(this.room.state.turnExpiresAt).toISOString() : null;
        this.broadcast(SOCKET_EVENTS.TURN_CHANGED, {
          roomCode: this.room.roomCode,
          playerId: nextAlarmPlayerId,
          timerExpiresAt: alarmTimerISO,
          requiredLetter: this.room.state.requiredLetter ?? null,
        });
        if (nextAlarmPlayerId) {
          this.sendToPlayer(nextAlarmPlayerId, SOCKET_EVENTS.YOUR_TURN, {
            roomCode: this.room.roomCode,
            requiredLetter: this.room.state.requiredLetter ?? null,
            timerExpiresAt: alarmTimerISO,
          } satisfies YourTurnPayload);
        }
        this.broadcastSnapshot();
        return;
      }

      // 2-player game: end immediately
      const winner = activePlayers.find((p) => p.id !== losingPlayer?.id)?.id ?? null;
      this.room.state = endGame(this.room.state, winner, now);
      this.room.status = 'finished';
      await this.persistRoom();
      await this.persistMatchSummary(winner);
      this.broadcast(SOCKET_EVENTS.GAME_OVER, this.createGameOverPayload('timeout', winner));
      return;
    }

    if (this.room.status === 'finished' && this.room.rematchStartAt && Date.now() >= this.room.rematchStartAt) {
      await this.startRematch();
    }
  }

  private async createRoom(payload: RoomCreationInput): Promise<Response> {
    await this.loadRoom();
    if (this.room) {
      return Response.json({ room: this.toSnapshot(), playerId: this.room.hostUserId });
    }

    const roomCode = payload.roomCode ?? createRoomCode();
    const hostUserId = createId('user');
    const roomId = createId('room');
    const host: PlayerProfile = {
      id: hostUserId,
      username: payload.username,
      ready: false,
      score: 0,
      isHost: true,
      playerNumber: 1,
      connectionStatus: 'connected',
    };

    this.room = {
      id: roomId,
      roomCode,
      hostUserId,
      status: 'lobby',
      mode: 'standard',
      timerSeconds: payload.timerSeconds ?? 15,
      players: [host],
      spectators: [],
      state: null,
      matchId: null,
      nextPlayerNumber: 2,
      rematchRequests: [],
      rematchStartAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.repository.upsertUser({ id: hostUserId, username: payload.username });
    await this.repository.upsertRoom(this.room);
    await this.persistRoom();

    return Response.json({ room: this.toSnapshot(), playerId: hostUserId } satisfies RoomStartResponse);
  }

  private async joinRoom(payload: RoomJoinInput): Promise<Response> {
    await this.loadRoom();
    if (!this.room) {
      return Response.json({ error: 'Room not found' }, { status: 404 });
    }

    const username = normalizeUsername(payload.username);
    if (!username) {
      return Response.json({ error: 'Username is required' }, { status: 400 });
    }

    const playerId = payload.playerId ?? createId('user');
    const existing = [...this.room.players, ...this.room.spectators].find((player) => player.id === playerId);
    if (existing) {
      existing.username = username;
      existing.connectionStatus = 'connected';
      await this.repository.upsertUser({ id: existing.id, username });
      await this.persistRoom();
      this.broadcastSnapshot();
      return Response.json({ room: this.toSnapshot(), playerId: existing.id } satisfies RoomStartResponse);
    }

    const takenUsernames = this.room.players
      .filter((player) => player.connectionStatus !== 'disconnected' || player.id === playerId)
      .map((player) => player.username.toLowerCase());
    const normalizedLower = username.toLowerCase();
    if (takenUsernames.includes(normalizedLower)) {
      const suggestedUsername = makeUniqueUsername(username, this.room.players.map((player) => player.username));
      return Response.json(
        {
          error: 'Username already taken in this room',
          code: 'USERNAME_TAKEN',
          suggestedUsername,
        },
        { status: 409 },
      );
    }

    const player: PlayerProfile = {
      id: playerId,
      username,
      ready: false,
      score: 0,
      isHost: false,
      playerNumber: this.room.nextPlayerNumber,
      connectionStatus: 'connected',
    };

    this.room.nextPlayerNumber += 1;
    this.room.players.push(player);
    await this.repository.upsertUser({ id: player.id, username: player.username });
    await this.persistRoom();
    this.broadcastSnapshot();
    return Response.json({ room: this.toSnapshot(), playerId: player.id } satisfies RoomStartResponse);
  }

  private async handleAction(message: ClientMessage & { roomCode: string; playerId?: string }): Promise<Response> {
    await this.loadRoom();
    if (!this.room) {
      return Response.json({ error: 'Room not found' }, { status: 404 });
    }

    switch (message.event) {
      case SOCKET_EVENTS.PLAYER_READY: {
        const ready = Boolean((message.payload as { ready?: boolean } | undefined)?.ready);
        const player = this.room.players.find((entry) => entry.id === message.playerId);
        if (player) {
          player.ready = ready;
        }
        if (this.room.status === 'lobby' && this.room.players.length >= 2 && this.room.players.every((entry) => entry.ready)) {
          await this.startMatch();
        } else {
          await this.persistRoom();
          this.broadcastSnapshot();
        }
        return Response.json({ room: this.toSnapshot() });
      }
      case SOCKET_EVENTS.SUBMIT_WORD: {
        return this.submitWord(message.playerId ?? '', message.payload as { word?: string } | undefined);
      }
      case SOCKET_EVENTS.REMATCH_REQUESTED: {
        const requestingPlayerId = message.playerId;
        const requestingPlayer = [...this.room.players, ...this.room.spectators].find((p) => p.id === requestingPlayerId);

        if (!requestingPlayer || requestingPlayer.connectionStatus === 'disconnected') {
          return Response.json({ error: 'Player is no longer present in this room' }, { status: 400 });
        }

        if (this.room.status !== 'finished') {
          return Response.json({ room: this.toSnapshot() });
        }

        const pendingRequests = new Set(this.room.rematchRequests);
        const wasNewRequest = !pendingRequests.has(requestingPlayerId ?? '');
        pendingRequests.add(requestingPlayerId ?? '');
        this.room.rematchRequests = [...pendingRequests];

        if (wasNewRequest) {
          const invitePayload: RematchInvitePayload = {
            roomCode: this.room.roomCode,
            fromPlayerId: requestingPlayerId ?? '',
            fromUsername: requestingPlayer.username,
          };

          for (const [socket, socketPlayerId] of this.clientPlayers.entries()) {
            if (socketPlayerId !== requestingPlayerId && this.isPresentPlayer(socketPlayerId)) {
              try {
                socket.send(JSON.stringify({ event: SOCKET_EVENTS.REMATCH_INVITE, payload: invitePayload }));
              } catch {
                // socket closed, ignore
              }
            }
          }
        }

        const connectedPlayerCount = [...this.room.players, ...this.room.spectators].filter(
          (p) => p.connectionStatus !== 'disconnected',
        ).length;
        const requiredVotes = Math.max(connectedPlayerCount, 2);
        if (this.room.rematchRequests.length >= requiredVotes && !this.room.rematchStartAt) {
          this.room.rematchStartAt = Date.now() + RoomDurableObject.REMATCH_DELAY_MS;
          await this.state.storage.setAlarm(this.room.rematchStartAt);
        }

        await this.persistRoom();
        this.broadcast(SOCKET_EVENTS.REMATCH_REQUESTED, {
          roomCode: this.room.roomCode,
          room: this.toSnapshot(),
        } satisfies RematchPayload & { room: RoomSnapshot });

        if (this.room.rematchStartAt) {
          return Response.json({ room: this.toSnapshot(), rematchStartAt: this.room.rematchStartAt });
        }

        return Response.json({ room: this.toSnapshot() });
      }
      default:
        return Response.json({ error: 'Unsupported action' }, { status: 400 });
    }
  }

private async submitWord(playerId: string, payload?: { word?: string }): Promise<Response> {
  if (!this.room?.state) {
    return Response.json({ error: 'Match has not started' }, { status: 400 });
  }

  const player = [...this.room.players, ...this.room.spectators].find((p) => p.id === playerId);
  if (player?.isSpectator || player?.isEliminated) {
    return Response.json({ error: 'Spectators and eliminated players cannot submit words' }, { status: 403 });
  }

  const now = Date.now();
  const result = submitWord(this.room.state, {
    playerId,
    word: payload?.word ?? '',
    dictionary: this.dictionary,
    submittedAt: now,
  });

  if (result.submissionStatus === 'accepted') {
    // Only commit engine state on acceptance. On rejection, the engine may
    // have internally flagged the player as eliminated (its own rule), but
    // we don't want that side-effect — elimination is solely driven by
    // alarm() / turn-timer expiry in this DO. Keeping the pre-submission
    // state on rejection means the player can keep trying until the clock runs out.
    this.room.state = result.state;

    // Sync scores from the engine; deliberately do NOT spread other engine
    // flags (isEliminated, isSpectator) so DO-level state stays authoritative.
    this.room.players = this.room.players.map((roomPlayer) => {
      const enginePlayer = result.state.players.find((p) => p.id === roomPlayer.id);
      if (!enginePlayer) return roomPlayer;
      return { ...roomPlayer, score: enginePlayer.score };
    });

    const timerExpiresAtISO = result.state.turnExpiresAt
      ? new Date(result.state.turnExpiresAt).toISOString()
      : null;
    const nextPlayerId = result.state.players[result.state.currentTurnIndex]?.id ?? playerId;

    await this.persistRoom();
    const resultExpiryVal = result.state.turnExpiresAt
      ? new Date(result.state.turnExpiresAt).getTime()
      : now;
    const resultExpiry = isNaN(resultExpiryVal) ? now : resultExpiryVal;
    await this.state.storage.setAlarm(resultExpiry);
    this.sendToPlayer(playerId, SOCKET_EVENTS.WORD_ACCEPTED, {
      roomCode: this.room.roomCode,
      word: result.move?.word ?? '',
      playerId,
      nextRequiredLetter: result.state.requiredLetter ?? '',
      timerExpiresAt: timerExpiresAtISO,
      score: this.room.players.find((p) => p.id === playerId)?.score ?? 0,
    });
    this.broadcast(SOCKET_EVENTS.TURN_CHANGED, {
      roomCode: this.room.roomCode,
      playerId: nextPlayerId,
      timerExpiresAt: timerExpiresAtISO,
      requiredLetter: result.state.requiredLetter ?? null,
    });
    this.broadcast(SOCKET_EVENTS.TIMER_UPDATED, {
      roomCode: this.room.roomCode,
      turnExpiresAt: timerExpiresAtISO,
    });
    this.sendToPlayer(nextPlayerId, SOCKET_EVENTS.YOUR_TURN, {
      roomCode: this.room.roomCode,
      requiredLetter: result.state.requiredLetter ?? null,
      timerExpiresAt: timerExpiresAtISO,
    } satisfies YourTurnPayload);
    if (result.state.status === 'finished') {
      await this.persistMatchSummary(result.state.winnerId ?? null);
      this.broadcast(SOCKET_EVENTS.GAME_OVER, this.createGameOverPayload('victory', result.state.winnerId ?? null));
    }
  } else {
      // 'rejected' — invalid word. Player keeps their turn.
  // Do NOT commit result.state. Elimination is alarm()'s responsibility only.
  this.sendToPlayer(playerId, SOCKET_EVENTS.WORD_REJECTED, {
    roomCode: this.room.roomCode,
    word: payload?.word ?? '',
    reason: result.rejectionReason ?? 'Invalid word.',
  });

  // Re-arm the alarm so the turn timer continues ticking normally.
  if (this.room.state.turnExpiresAt) {
    const roomExpiryVal = new Date(this.room.state.turnExpiresAt).getTime();
    if (!isNaN(roomExpiryVal)) {
      await this.state.storage.setAlarm(roomExpiryVal);
    }
  }

  await this.persistRoom();
  }

  this.broadcastSnapshot();
  return Response.json({ room: this.toSnapshot(), accepted: result.submissionStatus === 'accepted' });
}

  private async startMatch(): Promise<void> {
    if (!this.room) {
      return;
    }

    // No auto-generated starting word: currentWord is null until Player 1 submits the first word
    this.room.state = startGame({
      roomCode: this.room.roomCode,
      players: this.room.players,
      startingWord: null,
      mode: this.room.mode,
      turnDurationMs: this.room.timerSeconds * 1000,
      startedAt: Date.now(),
    });
    this.room.status = 'live';
    this.room.matchId = this.room.matchId ?? createId('match');
    await this.persistRoom();
    const startExpiryVal = this.room.state.turnExpiresAt
      ? new Date(this.room.state.turnExpiresAt).getTime()
      : Date.now();
    const startExpiry = isNaN(startExpiryVal) ? Date.now() : startExpiryVal;
    await this.state.storage.setAlarm(startExpiry);

    const startTimerISO = this.room.state.turnExpiresAt ? new Date(this.room.state.turnExpiresAt).toISOString() : null;
    this.broadcast(SOCKET_EVENTS.GAME_STARTED, { roomCode: this.room.roomCode, room: this.toSnapshot() });
    this.broadcast(SOCKET_EVENTS.TIMER_UPDATED, {
      roomCode: this.room.roomCode,
      turnExpiresAt: startTimerISO,
    });
    this.broadcastSnapshot();
    // Notify first player that it is their turn
    const firstTurnPlayerId = this.room.state.players[this.room.state.currentTurnIndex]?.id ?? '';
    if (firstTurnPlayerId) {
      this.sendToPlayer(firstTurnPlayerId, SOCKET_EVENTS.YOUR_TURN, {
        roomCode: this.room.roomCode,
        requiredLetter: this.room.state.requiredLetter ?? null,
        timerExpiresAt: startTimerISO,
      } satisfies YourTurnPayload);
    }
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    await this.loadRoom();
    if (!this.room) {
      return new Response('Room not found', { status: 404 });
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? undefined;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    this.clients.add(server);
if (playerId) {
  this.clientPlayers.set(server, playerId);
  this.markPlayerPresence(playerId, 'connected');

  // Cancel any pending disconnect-grace alarm for this player
  const gracKey = `${RoomDurableObject.DISCONNECT_ALARM_PREFIX}${playerId}`;
  void this.state.storage.delete(gracKey);
  // If no other grace alarms are pending and the room has a turn timer,
  // restore the alarm to the turn expiry so the turn timer still works.
  void this.state.storage.list({ prefix: RoomDurableObject.DISCONNECT_ALARM_PREFIX }).then((entries) => {
    if (entries.size === 0 && this.room?.state?.turnExpiresAt) {
      const socketExpiryVal = new Date(this.room.state.turnExpiresAt).getTime();
      if (!isNaN(socketExpiryVal)) {
        void this.state.storage.setAlarm(socketExpiryVal);
      }
    }
  });

  this.broadcast(SOCKET_EVENTS.PLAYER_RECONNECTED, { roomCode: this.room.roomCode, playerId });
  void this.persistRoom();
  this.broadcastSnapshot();
}

    server.addEventListener('message', async (event) => {
      const data = this.parseMessage(event.data);
      if (!data) {
        return;
      }
      const resolvedPlayerId = this.clientPlayers.get(server)   
    ?? (data as ClientMessage & { playerId?: string }).playerId
    ?? (data.payload as { playerId?: string } | undefined)?.playerId;
    

      const response = await this.handleAction({
        event: data.event,
        payload: data.payload,
        requestId: data.requestId,
        roomCode: this.room?.roomCode ?? '',
        playerId: resolvedPlayerId,
      });

      if (data.requestId) {
        server.send(JSON.stringify({ requestId: data.requestId, event: data.event, payload: await response.json() }));
      }
    });

    server.addEventListener('close', () => {
      this.clients.delete(server);
      const trackedPlayerId = this.clientPlayers.get(server);
      if (trackedPlayerId) {
        this.markPlayerPresence(trackedPlayerId, 'disconnected');

        if (this.room && this.room.status === 'finished') {
          this.room.rematchRequests = this.room.rematchRequests.filter((id) => id !== trackedPlayerId);
          if (this.room.rematchRequests.length < 2 && this.room.rematchStartAt) {
            this.room.rematchStartAt = null;
            void this.state.storage.deleteAlarm();
          }
        }

        this.clientPlayers.delete(server);
        this.broadcast(SOCKET_EVENTS.PLAYER_DISCONNECTED, {
          roomCode: this.room?.roomCode ?? '',
          playerId: trackedPlayerId,
        });

        // Grace period: don't end/eliminate immediately on disconnect.
        // Schedule a reconnection-deadline alarm only for live games.
        // If the player reconnects before it fires, the alarm is cancelled in handleWebSocket.
        if (this.room?.status === 'live') {
          const graceDue = Date.now() + RoomDurableObject.RECONNECT_GRACE_MS;
          void this.state.storage
            .put(`${RoomDurableObject.DISCONNECT_ALARM_PREFIX}${trackedPlayerId}`, graceDue)
            .then(() => this.state.storage.setAlarm(graceDue));
        }

        void this.persistRoom();
        this.broadcastSnapshot();
      }
    });

    server.addEventListener('error', () => {
      this.clients.delete(server);
    });

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  private parseMessage(data: unknown): ClientMessage | null {
    if (typeof data !== 'string') {
      return null;
    }

    try {
      return JSON.parse(data) as ClientMessage;
    } catch {
      return null;
    }
  }

  private broadcast(event: string, payload: unknown): void {
    const message = JSON.stringify({ event, payload });
    for (const socket of this.clients) {
      try {
        socket.send(message);
      } catch {
        this.clients.delete(socket);
        this.clientPlayers.delete(socket);
      }
    }
  }

  private sendToPlayer(targetPlayerId: string, event: string, payload: unknown): void {
    const message = JSON.stringify({ event, payload });
    for (const [socket, socketPlayerId] of this.clientPlayers.entries()) {
      if (socketPlayerId === targetPlayerId) {
        try {
          socket.send(message);
        } catch {
          // Socket is dead — prune it from both maps so it isn't retried.
          this.clients.delete(socket);
          this.clientPlayers.delete(socket);
        }
      }
    }
  }

  private broadcastSnapshot(): void {
    this.broadcast(SOCKET_EVENTS.ROOM_SNAPSHOT, { room: this.toSnapshot() });
  }

  private isPresentPlayer(playerId: string): boolean {
    if (!this.room) {
      return false;
    }

    return [...this.room.players, ...this.room.spectators].some((player) => player.id === playerId && player.connectionStatus !== 'disconnected');
  }

  private pruneRematchRequests(): void {
    if (!this.room) {
      return;
    }

    const connectedIds = new Set(
      [...this.room.players, ...this.room.spectators]
        .filter((player) => player.connectionStatus !== 'disconnected')
        .map((player) => player.id),
    );

    this.room.rematchRequests = this.room.rematchRequests.filter((playerId) => connectedIds.has(playerId));
  }

  private getRematchParticipants(): PlayerProfile[] {
    if (!this.room) {
      return [];
    }

    const requestedIds = new Set(this.room.rematchRequests);
    const allPresentPlayers = [...this.room.players, ...this.room.spectators].filter(
      (player, index, players) => players.findIndex((entry) => entry.id === player.id) === index,
    );

    return allPresentPlayers.filter((player) => requestedIds.has(player.id) && player.connectionStatus !== 'disconnected');
  }

  private async startRematch(): Promise<void> {
    if (!this.room) {
      return;
    }

    this.pruneRematchRequests();
    const participants = this.getRematchParticipants().sort((a, b) => a.playerNumber - b.playerNumber);
    if (participants.length < 2) {
      this.room.rematchStartAt = null;
      await this.state.storage.deleteAlarm();
      await this.persistRoom();
      this.broadcastSnapshot();
      return;
    }

    const allPresentPlayers = [...this.room.players, ...this.room.spectators].filter(
      (player, index, players) => players.findIndex((entry) => entry.id === player.id) === index,
    );
    const participantIds = new Set(participants.map((player) => player.id));
    const spectators = allPresentPlayers
      .filter((player) => !participantIds.has(player.id) && player.connectionStatus !== 'disconnected')
      .map((player) => ({
        ...player,
        ready: false,
        score: 0,
        isHost: false,
        isEliminated: false,
        isSpectator: true,
      }));

    const nextPlayers = participants.map((player, index) => ({
      ...player,
      ready: false,
      score: 0,
      isHost: index === 0,
      isEliminated: false,
      isSpectator: false,
      connectionStatus: player.connectionStatus === 'disconnected' ? 'connected' : player.connectionStatus,
    }));

    this.room.players = nextPlayers;
    this.room.spectators = spectators;
    this.room.hostUserId = nextPlayers[0]?.id ?? this.room.hostUserId;
    this.room.state = startGame({
      roomCode: this.room.roomCode,
      players: nextPlayers,
      startingWord: null,
      mode: this.room.mode,
      turnDurationMs: this.room.timerSeconds * 1000,
      startedAt: Date.now(),
    });
    this.room.status = 'live';
    this.room.matchId = createId('match');
    this.room.rematchRequests = [];
    this.room.rematchStartAt = null;

    await this.persistRoom();
    const rematchExpiryVal = this.room.state.turnExpiresAt
      ? new Date(this.room.state.turnExpiresAt).getTime()
      : Date.now();
    const rematchExpiry = isNaN(rematchExpiryVal) ? Date.now() : rematchExpiryVal;
    await this.state.storage.setAlarm(rematchExpiry);

    const rematchTimerISO = this.room.state.turnExpiresAt ? new Date(this.room.state.turnExpiresAt).toISOString() : null;
    this.broadcast(SOCKET_EVENTS.GAME_STARTED, { roomCode: this.room.roomCode, room: this.toSnapshot() });
    this.broadcast(SOCKET_EVENTS.TIMER_UPDATED, {
      roomCode: this.room.roomCode,
      turnExpiresAt: rematchTimerISO,
    });
    this.broadcastSnapshot();
    // Notify first player that it is their turn
    const firstPlayerId = this.room.state.players[this.room.state.currentTurnIndex]?.id ?? '';
    if (firstPlayerId) {
      this.sendToPlayer(firstPlayerId, SOCKET_EVENTS.YOUR_TURN, {
        roomCode: this.room.roomCode,
        requiredLetter: this.room.state.requiredLetter ?? null,
        timerExpiresAt: rematchTimerISO,
      } satisfies YourTurnPayload);
    }
  }

  private markPlayerPresence(playerId: string, connectionStatus: PlayerProfile['connectionStatus']) {
    if (!this.room) {
      return;
    }

    const player = [...this.room.players, ...this.room.spectators].find((entry) => entry.id === playerId);
    if (player) {
      player.connectionStatus = connectionStatus;
    }
  }

  private createGameOverPayload(reason: GameOverPayload['reason'], winnerId: string | null): GameOverPayload {
    const totalWords = this.room?.state?.usedWords.length ?? 0;
    const lastWord = this.room?.state?.usedWords[this.room?.state?.usedWords.length - 1] ?? '';

    return {
      roomCode: this.room?.roomCode ?? '',
      winnerId,
      reason,
      statistics: {
        totalWords,
        lastWord: lastWord,
        fastestSubmissionMs: null,
      },
    };
  }

  private async loadRoom(): Promise<void> {
    if (this.room) {
      return;
    }

    const storedRoom = await this.state.storage.get<RoomRecord>('room');
    if (storedRoom) {
      // Migration: backfill nextPlayerNumber and playerNumber for rooms created before this change
      if (!storedRoom.nextPlayerNumber) {
        storedRoom.nextPlayerNumber = storedRoom.players.length + 1;
        storedRoom.players = storedRoom.players.map((p, i) => ({
          ...p,
          playerNumber: p.playerNumber ?? i + 1,
        }));
      }
      
      storedRoom.rematchRequests ??= [];
      storedRoom.rematchStartAt ??= null;
      storedRoom.spectators ??= [];
    }
    this.room = storedRoom ?? null;
  }

  private async persistRoom(): Promise<void> {
    if (!this.room) {
      return;
    }

    this.room.updatedAt = new Date().toISOString();
    await this.state.storage.put('room', this.room);
  }

  private async persistMatchSummary(winnerId: string | null): Promise<void> {
    if (!this.room || !this.room.state || !this.room.matchId) {
      return;
    }

    const lastWord = this.room.state.usedWords[this.room.state.usedWords.length - 1] ?? '';
    await this.repository.createMatch({
      id: this.room.matchId,
      roomId: this.room.id,
      winnerUserId: winnerId,
      mode: this.room.mode,
      startedAt: this.room.state.startedAt ? new Date(this.room.state.startedAt).toISOString() : null,
      endedAt: this.room.state.endedAt ? new Date(this.room.state.endedAt).toISOString() : null,
      totalWords: this.room.state.usedWords.length,
      lastWord: lastWord,
      fastestSubmissionMs: null,
    });
  }

  private toSnapshot(): RoomSnapshot {
    const room = this.room;
    const currentTurnPlayer = room?.state
      ? room.state.players[room.state.currentTurnIndex]
      : null;
    return {
      roomCode: room?.roomCode ?? '',
      status: room?.status ?? 'lobby',
      mode: room?.mode ?? 'standard',
      players: [...(room?.players ?? []), ...(room?.spectators ?? [])],
      currentWord: room?.state?.currentWord ?? null,
      requiredLetter: room?.state?.currentWord ? getRequiredLetter(room.state.currentWord) : null,
      currentTurnPlayerId: currentTurnPlayer?.id ?? null,
      turnExpiresAt: room?.state?.turnExpiresAt ? new Date(room.state.turnExpiresAt).toISOString() : null,
      usedWords: room?.state?.usedWords ?? [],
      winnerId: room?.state?.winnerId ?? null,
      rematchRequests: room?.rematchRequests ?? [],
      rematchStartAt: room?.rematchStartAt ?? null,
    };
  }
}