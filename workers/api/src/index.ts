import { RoomDurableObject } from './room-do';
import { createJwt, verifyJwt } from './auth/jwt';
import { D1Repository } from './d1';
import type { WorkerEnv } from './types';


function corsHeaders(origin: string | null, allowOrigin = '*') {
  const headers = new Headers();
  // If the origin is present, use it. Otherwise, default to allowOrigin or '*'
  headers.set('Access-Control-Allow-Origin', origin || allowOrigin);
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Credentials', 'true');
  return headers;
}

function jsonResponse(body: unknown, init?: ResponseInit, origin: string | null = null): Response {
  const headers = corsHeaders(origin, '*');
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function createRoomStub(env: WorkerEnv, roomCode: string) {
  const id = env.ROOMS.idFromName(roomCode);
  return env.ROOMS.get(id);
}


function roomCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:api\/rooms\/)?([A-Z0-9-]+)\/(?:ws|snapshot|action)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export { RoomDurableObject };
export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handling Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Wrapping all routing in a try/catch to catch D1 or DO errors safely
    try {
      if (url.pathname === '/health') {
        return jsonResponse({ ok: true, runtime: 'cloudflare-workers' }, undefined, origin);
      }

      if (url.pathname === '/api/auth/token' && request.method === 'POST') {
        const body = (await readJson(request)) as { userId?: string; username?: string } | null;
        if (!body?.userId || !body.username) {
          return jsonResponse({ error: 'userId and username are required' }, { status: 400 }, origin);
        }

        const secret = env.JWT_SECRET ?? 'dev-secret';
        const token = await createJwt({ sub: body.userId, username: body.username, role: 'player', iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE }, secret);
        return jsonResponse({ token }, undefined, origin);
      }

      if (url.pathname === '/api/auth/verify' && request.method === 'POST') {
        const body = (await readJson(request)) as { token?: string } | null;
        if (!body?.token) {
          return jsonResponse({ error: 'token is required' }, { status: 400 }, origin);
        }

        const claims = await verifyJwt(body.token, env.JWT_SECRET ?? 'dev-secret');
        return jsonResponse({ claims }, undefined, origin);
      }

      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const body = (await readJson(request)) as { username?: string; mode?: string; timerSeconds?: number } | null;
        if (!body?.username) {
          return jsonResponse({ error: 'username is required' }, { status: 400 }, origin);
        }

        const roomCode = `${body.username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'WLD'}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
        const stub = await createRoomStub(env, roomCode);
        const response = await stub.fetch(new Request('https://do/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: body.username, mode: body.mode, timerSeconds: body.timerSeconds, roomCode }),
        }));

        const doHeaders = corsHeaders(origin);
        doHeaders.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
        return new Response(response.body, { status: response.status, headers: doHeaders });
      }

      if (url.pathname === '/api/rooms/join' && request.method === 'POST') {
        const body = (await readJson(request)) as { roomCode?: string; username?: string; playerId?: string } | null;
        if (!body?.roomCode || !body.username) {
          return jsonResponse({ error: 'roomCode and username are required' }, { status: 400 }, origin);
        }

        const stub = await createRoomStub(env, body.roomCode.toUpperCase());
        const response = await stub.fetch(new Request('https://do/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: body.roomCode.toUpperCase(), username: body.username, playerId: body.playerId }),
        }));

        const doHeaders = corsHeaders(origin);
        doHeaders.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
        return new Response(response.body, { status: response.status, headers: doHeaders });
      }

      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const repo = new D1Repository(env);
        const rows = await repo.getLeaderboard(20);
        return jsonResponse({ leaderboard: rows.results ?? [] }, undefined, origin);
      }
const wsMatch = url.pathname.match(/^\/([A-Z0-9-]+)\/ws$/i);
if (wsMatch && request.method === 'GET') {
  const roomCode = wsMatch[1].toUpperCase();
  const stub = await createRoomStub(env, roomCode);
  // Returns the DO response DIRECTLY and does not reconstruct it.
  // Wrapping a 101 WebSocket upgrade response in `new Response(...)` strips the internal `webSocket` property and kills the handshake.
  return stub.fetch(request);
}
      const roomCode = roomCodeFromPath(url.pathname);
      if (roomCode) {
        const stub = await createRoomStub(env, roomCode);

        if (request.method === 'GET' && url.pathname.endsWith('/snapshot')) {
          const response = await stub.fetch(new Request('https://do/snapshot'));
          return new Response(response.body, { status: response.status, headers: corsHeaders(origin) });
        }


        if (request.method === 'POST' && url.pathname.endsWith('/action')) {
          const response = await stub.fetch(new Request('https://do/action', { method: 'POST', body: await request.clone().text(), headers: { 'Content-Type': 'application/json' } }));
          return new Response(response.body, { status: response.status, headers: corsHeaders(origin) });
        }
      }

      return jsonResponse({ error: 'Not found' }, { status: 404 }, origin);

    } catch (err: any) {
    return jsonResponse(
    { error: 'Internal Server Error', detail: err?.message ?? String(err) },
    { status: 500 },
    origin
  );
}
  },
};