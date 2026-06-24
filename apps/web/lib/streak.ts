/**
 * streak.ts
 * Tracks a daily play streak in localStorage.
 * No login required — works purely client-side.
 *
 * Storage key: "wordgym-streak"
 * Shape: { currentStreak: number; lastPlayedDate: string }
 *   lastPlayedDate is an ISO date string truncated to YYYY-MM-DD (local time).
 */

export interface StreakData {
  currentStreak: number;
  lastPlayedDate: string | null; // "YYYY-MM-DD" in local time, or null if never played
}

const STREAK_KEY = 'wordgym-streak';

/** Return today's date as "YYYY-MM-DD" in the user's local timezone. */
function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Number of calendar days between two "YYYY-MM-DD" strings. */
function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

/** Read streak data from localStorage. Returns defaults if nothing stored yet. */
export function loadStreak(): StreakData {
  if (typeof window === 'undefined') {
    return { currentStreak: 0, lastPlayedDate: null };
  }
  const raw = window.localStorage.getItem(STREAK_KEY);
  if (!raw) return { currentStreak: 0, lastPlayedDate: null };
  try {
    return JSON.parse(raw) as StreakData;
  } catch {
    return { currentStreak: 0, lastPlayedDate: null };
  }
}

/** Persist streak data to localStorage. */
function saveStreak(data: StreakData): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

/**
 * Call this whenever the user successfully completes / plays a game.
 * - Same day  → no change (already counted today)
 * - Yesterday → streak + 1
 * - Older     → streak resets to 1
 * Returns the updated StreakData.
 */
export function recordPlay(): StreakData {
  const today = toLocalDateString();
  const data = loadStreak();

  if (data.lastPlayedDate === today) {
    return data;
  }

  let newStreak: number;
  if (data.lastPlayedDate === null) {
    newStreak = 1;
  } else {
    const gap = daysBetween(data.lastPlayedDate, today);
    if (gap === 1) {
      newStreak = data.currentStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  const updated: StreakData = { currentStreak: newStreak, lastPlayedDate: today };
  saveStreak(updated);
  return updated;
}

export function getStreak(): StreakData {
  const data = loadStreak();
  if (!data.lastPlayedDate) return data;

  const today = toLocalDateString();
  const gap = daysBetween(data.lastPlayedDate, today);

  if (gap <= 1) {
    // Streak is still alive (played today, or played yesterday and hasn't played today yet).
    return data;
  }

  // Streak is broken — decay to 0 and persist.
  const decayed: StreakData = { currentStreak: 0, lastPlayedDate: data.lastPlayedDate };
  saveStreak(decayed);
  return decayed;
}

/** Wipe streak data */
export function clearStreak(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STREAK_KEY);
}