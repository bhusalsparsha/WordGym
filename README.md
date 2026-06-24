# WordGym

A real-time multiplayer word game built on **Cloudflare Workers + Durable Objects** with a modern Next.js frontend.

WordChain is the first game inside the **WordGym platform**.

---

## Tech Stack

### Frontend
- Next.js 15
- TypeScript
- Tailwind CSS
- Zustand
- Native WebSocket client
- Framer Motion

### Backend
- Cloudflare Workers
- Durable Objects (real-time game rooms)
- D1 (persistent database)
- KV (caching/config)
- Queues (async jobs)

### Shared Packages
- Pure game engine (game rules + validation)
- Socket event contracts
- Dictionary loader

---

## Workspace Structure

```text
wordgym/
apps/
  web/                 # Next.js frontend (WordGym UI)

workers/
  api/                 # Cloudflare Worker API (auth, rooms, matchmaking)

packages/
  game-engine/        # Core WordChain game logic (pure TS)
  socket-events/      # WebSocket event contracts
  shared/             # Shared utilities & types
  dictionary/         # Word validation / dictionary loader

infrastructure/
  cloudflare/
    deployment/       # Deployment + environment configuration
```
## What is included
### Core Game System
- Server-authoritative game engine (rules, validation, scoring)
- Turn-based real-time word-chain gameplay
- Timer-controlled rounds and match flow
### Real-time Infrastructure
- Durable Object–based room instances
- Single source of truth for game state
- WebSocket-driven gameplay updates
- Player presence + session management
### Backend Systems
- Authentication scaffolding (JWT-based)
- Room creation / join flow
- Match lifecycle management
- Leaderboard + match history storage
### Data Layer
- D1 database for:
  - users
  - matches
  - moves
  - leaderboard snapshots
- KV for caching and lightweight config
### Environment Setup
1. Create environment files:
```
cp .env.example .env.local
```

2. Configure:
   - Frontend API URL
   - Worker API endpoint
   - Auth configuration (JWT / OAuth if enabled)
## Development
### Install dependencies
```
pnpm install
```
### Run locally
```
pnpm dev
```
- Frontend: http://localhost:3000
- Backend: Cloudflare Worker dev endpoint
## Deployment
### Frontend
Vercel (Next.js app)
### Backend
Cloudflare Workers (API layer)
### Database
- Cloudflare D1
- Realtime Layer
- Durable Objects (authoritative game rooms)
## Architecture Notes
- The game engine is fully deterministic and pure TypeScript
- Durable Objects act as the authoritative real-time state machine
- D1 stores persistent user + match history data
- WebSockets are used for live gameplay synchronization
- Worker API handles auth, routing, and room lifecycle
## Design Philosophy
- Game logic is isolated from infrastructure
- Real-time state is server-authoritative (no client trust)
- Shared contracts ensure frontend/backend consistency
- Each game can evolve independently inside the WordGym platform
## Current Status
- WordChain is the first fully implemented game.
- Additional games inside WordGym are planned and currently in early design stage.

