import { WORDS } from './words';
export { WORDS } from './words';
    
let cachedDictionary: ReadonlySet<string> | null = null;

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

export function loadDictionary(): ReadonlySet<string> {
  if (cachedDictionary) {
    return cachedDictionary;
  }

  const words = WORDS.map(normalizeWord).filter(Boolean);

  cachedDictionary = new Set(words);
  return cachedDictionary;
}

export function hasWord(word: string): boolean {
  return loadDictionary().has(normalizeWord(word));
}

export function getRandomStartingWord(minLength = 4): string {
  const words = [...loadDictionary()].filter((word) => word.length >= minLength);
  return words[Math.floor(Math.random() * words.length)] ?? 'chain';
}

export function createDictionarySnapshot(): string[] {
  return [...loadDictionary()].sort((a, b) => a.localeCompare(b));
}
