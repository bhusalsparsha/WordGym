const ADJECTIVES = ['Swift', 'Bold', 'Calm', 'Brave', 'Keen', 'Sharp', 'Wild', 'Sly', 'Nimble', 'Fierce'];
const NOUNS = ['Fox', 'Owl', 'Wolf', 'Bear', 'Hawk', 'Lynx', 'Stag', 'Crow', 'Viper', 'Panther'];

const GUEST_NAME_KEY = 'wg-guest-name';

export function getGuestId(): string {
  let id = document.cookie.match(/guestId=([^;]+)/)?.[1];

  if (!id) {
    id = crypto.randomUUID();
    document.cookie = `guestId=${id}; max-age=31536000; path=/`;
  }

  return id;
}

export function getGuestName(): string {
  const stored = localStorage.getItem(GUEST_NAME_KEY);
  if (stored) return stored;

  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  const name = `${adj}${noun}${num}`;

  localStorage.setItem(GUEST_NAME_KEY, name);
  return name;
}

/**
 * Persist a custom username chosen by the player so it survives across
 * rooms and matches.  Pass `null` to clear (revert to auto-generated name).
 */
export function saveGuestName(name: string | null): void {
  if (typeof window === 'undefined') return;
  if (name === null) {
    localStorage.removeItem(GUEST_NAME_KEY);
  } else {
    localStorage.setItem(GUEST_NAME_KEY, name.trim());
  }
}