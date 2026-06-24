import type { WorkerEnv } from './types';

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export interface UserRecord {
  id: string;
  username: string;
  avatarUrl?: string | null;
  provider?: string | null;
  providerId?: string | null;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  winnerUserId?: string | null;
  mode: string;
  startedAt?: string | null;
  endedAt?: string | null;
  totalWords: number;
  lastWord?: string | null;
  fastestSubmissionMs?: number | null;
}

export class D1Repository {
  constructor(private readonly env: WorkerEnv) {}

  async upsertUser(user: UserRecord): Promise<UserRecord> {
    await this.env.DB.prepare(
      `INSERT INTO users (id, username, avatar_url, provider, provider_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         avatar_url = excluded.avatar_url,
         provider = excluded.provider,
         provider_id = excluded.provider_id,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(user.id, user.username, user.avatarUrl ?? null, user.provider ?? null, user.providerId ?? null)
      .run();

    return user;
  }

  async upsertRoom(room: { id: string; roomCode: string; hostUserId?: string | null; status: string; mode: string; timerSeconds: number }): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO rooms (id, room_code, host_user_id, status, mode, timer_seconds)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(room_code) DO UPDATE SET
         host_user_id = excluded.host_user_id,
         status = excluded.status,
         mode = excluded.mode,
         timer_seconds = excluded.timer_seconds,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(room.id, room.roomCode, room.hostUserId ?? null, room.status, room.mode, room.timerSeconds)
      .run();
  }

  async createMatch(match: MatchRecord): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO matches (id, room_id, winner_user_id, mode, started_at, ended_at, total_words, last_word, fastest_submission_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(match.id, match.roomId, match.winnerUserId ?? null, match.mode, match.startedAt ?? null, match.endedAt ?? null, match.totalWords, match.lastWord, match.fastestSubmissionMs ?? null)
      .run();
  }

  async addMove(matchId: string, playerId: string, word: string, accepted: boolean, rejectionReason?: string): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO moves (id, match_id, player_id, word, accepted, rejection_reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(createId('move'), matchId, playerId, word, accepted ? 1 : 0, rejectionReason ?? null)
      .run();
  }

  async getLeaderboard(limit = 20) {
    return this.env.DB.prepare(
      `SELECT u.id, u.username, COALESCE(l.total_wins, 0) AS total_wins, COALESCE(l.total_games, 0) AS total_games,
              COALESCE(l.total_words, 0) AS total_words, COALESCE(l.last_word, '') AS last_word,
              l.fastest_submission_ms
       FROM users u
       LEFT JOIN leaderboard_snapshots l ON l.user_id = u.id
       ORDER BY total_wins DESC, total_words DESC, u.username ASC
       LIMIT ?`,
    )
      .bind(limit)
      .all();
  }
}
