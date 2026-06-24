import type { RoomSnapshot } from '@wordchain/shared';
import { SOCKET_EVENTS, type CreateRoomPayload, type JoinRoomPayload } from '@wordchain/socket-events';

interface ClientMessageEnvelope {
  event: string;
  payload?: unknown;
  requestId?: string;
  playerId?: string;
}

type SocketHandler = (payload: any) => void;
type AckHandler = (payload: any) => void;

interface PendingRequest {
  resolve: AckHandler;
  reject: (error: Error) => void;
}

class WorkerSocketBridge {
  private readonly listeners = new Map<string, Set<SocketHandler>>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private roomSocket: WebSocket | null = null;
  private activeRoomCode: string | null = null;
  private activePlayerId: string | null = null;

  connect() {
    if (this.roomSocket && this.roomSocket.readyState === WebSocket.OPEN) {
      return this;
    }

    if (this.activeRoomCode) {
      void this.openRoomSocket(this.activeRoomCode);
    }

    return this;
  }

  disconnect() {
    if (this.roomSocket) {
      this.roomSocket.close();
      this.roomSocket = null;
    }

    this.activeRoomCode = null;
    this.activePlayerId = null;
    this.pendingRequests.clear();
    return this;
  }

  on(event: string, handler: SocketHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)?.add(handler);
    return this;
  }

  off(event: string, handler?: SocketHandler) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return this;
    }

    if (handler) {
      handlers.delete(handler);
    } else {
      handlers.clear();
    }

    return this;
  }

  emit(event: string, payload: any, ack?: AckHandler) {
    if (event === SOCKET_EVENTS.CREATE_ROOM) {
      void this.createRoom(payload as CreateRoomPayload, ack).catch((err) => {
      // Dispatch as a generic error event so the UI can react
      this.dispatch('error', { message: err?.message ?? 'Unknown error' });
    });
    return;
  
    }

    if (event === SOCKET_EVENTS.JOIN_ROOM) {
      return void this.joinRoom(payload as JoinRoomPayload, ack);
    }

    if (event === SOCKET_EVENTS.LEAVE_ROOM) {
      return void this.sendAction(event, payload, ack);
    }

    return void this.sendAction(event, payload, ack);
  }

  getCurrentRoomCode() {
    return this.activeRoomCode;
  }

  private get apiBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
  }

  private get websocketBaseUrl(): string {
    return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8787";
  }

 private async createRoom(payload: CreateRoomPayload, ack?: AckHandler) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { room?: RoomSnapshot; playerId?: string; error?: string };
      if (!response.ok) {
        ack?.({ error: data.error ?? 'Unable to create room' });
        return;
      }

      if (data.room?.roomCode) {
        this.activeRoomCode = data.room.roomCode;
        this.activePlayerId = data.playerId ?? null;
        await this.openRoomSocket(data.room.roomCode);
      }

      ack?.({ room: data.room, player: { id: data.playerId } });
    } catch (err) {
      ack?.({ error: err instanceof Error ? err.message : 'Unable to create room' });
    }
  }

  private async joinRoom(payload: JoinRoomPayload, ack?: AckHandler) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { room?: RoomSnapshot; playerId?: string; error?: string; suggestedUsername?: string };
      if (!response.ok) {
        ack?.({ error: data.error ?? 'Unable to join room', suggestedUsername: data.suggestedUsername });
        return;
      }

      if (data.room?.roomCode) {
        this.activeRoomCode = data.room.roomCode;
        this.activePlayerId = data.playerId ?? null;
        await this.openRoomSocket(data.room.roomCode);
      }

      ack?.({ room: data.room, player: { id: data.playerId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to join room';
      ack?.({ error: message });
      this.dispatch('error', { message });
    }
  }

  private async sendAction(event: string, payload: any, ack?: AckHandler) {
    if (!this.activeRoomCode) {
      throw new Error('No active room connection');
    }

    if (!this.roomSocket || this.roomSocket.readyState !== WebSocket.OPEN) {
      await this.openRoomSocket(this.activeRoomCode);
    }

    const requestId = ack ? crypto.randomUUID() : undefined;
    if (ack && requestId) {
      this.pendingRequests.set(requestId, {
        resolve: ack,
        reject: () => undefined,
      });
    }

    this.roomSocket?.send(JSON.stringify({ 
  event, 
  payload,
  playerId: this.activePlayerId ?? undefined,
  requestId 
} satisfies ClientMessageEnvelope));
  }

  private async openRoomSocket(roomCode: string) {
    if (this.roomSocket && this.activeRoomCode === roomCode && this.roomSocket.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.roomSocket) {
      this.roomSocket.close();
    }

    const playerQuery = this.activePlayerId ? `?playerId=${encodeURIComponent(this.activePlayerId)}` : '';
    const roomSocket = new WebSocket(`${this.websocketBaseUrl}/${roomCode}/ws${playerQuery}`);
    this.roomSocket = roomSocket;
    this.activeRoomCode = roomCode;

roomSocket.addEventListener('message', (event) => {
  if (typeof event.data !== 'string') {
    return;
  }

  try {
    const message = JSON.parse(event.data) as {
      event?: string;
      payload?: unknown;
      requestId?: string;
    };

    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const pending = this.pendingRequests.get(message.requestId);
      this.pendingRequests.delete(message.requestId);
      pending?.resolve(message.payload);
      return;
    }

    if (message.event) {
      this.dispatch(message.event, message.payload);
    }
  } catch {
    return;
  }
});

    roomSocket.addEventListener('close', () => {
      if (this.roomSocket === roomSocket) {
        this.roomSocket = null;
        this.dispatch('disconnect', undefined);
      }
    });

    roomSocket.addEventListener('error', () => {
      if (this.roomSocket === roomSocket) {
        this.roomSocket = null;
        this.dispatch('disconnect', undefined);
      }
    });

try {
  await new Promise<void>((resolve, reject) => {
    roomSocket.addEventListener('open', () => {
      this.dispatch('connect', undefined);
      resolve();
    }, { once: true });

    roomSocket.addEventListener('error', () => {
      reject(new Error('WebSocket connection failed'));
    }, { once: true });

    // Also guard against immediate close (e.g. 500 before open)
    roomSocket.addEventListener('close', (e) => {
      reject(new Error(`WebSocket closed before open (code: ${e.code})`));
    }, { once: true });
  });
} catch (err) {
  this.dispatch('disconnect', undefined);
}
  }

  private dispatch(event: string, payload: unknown) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }
}

let socketInstance: WorkerSocketBridge | null = null;

export function getGameSocket() {
  if (!socketInstance) {
    socketInstance = new WorkerSocketBridge();
  }

  return socketInstance;
}

export function resetGameSocket() {
  socketInstance?.disconnect();
  socketInstance = null;
}

