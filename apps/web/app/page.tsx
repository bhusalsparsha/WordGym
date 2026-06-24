'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Link2, Map, Sparkles, User, Flame } from 'lucide-react';
import { recordPlay } from '@/lib/streak';

export default function HomePage() {
  const [activeModal, setActiveModal] = useState<'wordchain' | 'comingsoon' | null>(null);
  const [date, setDate] = useState('');
  const [comingSoonGame, setComingSoonGame] = useState('');
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setDate(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
  }, []);

  useEffect(() => {
    // Read the real streak from localStorage on mount (client-only).
    const { currentStreak } = recordPlay();
    setStreak(currentStreak);
  }, []);

  const openComingSoon = (gameName: string) => {
    setComingSoonGame(gameName);
    setActiveModal('comingsoon');
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-between px-4 pb-12 pt-16 sm:px-6">
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

        {/* Today Streak Box */}
        <div className="rounded-xl border border-[#2e2e2a] bg-[#1e1e1c] p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">
              Today
            </p>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#f5f5f3]">
              {date}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-amber-500 font-semibold text-sm sm:text-base">
            <Flame className="h-4 w-4 sm:h-5 sm:w-5 fill-amber-500" />
            {streak > 0 ? (
              <span>{streak}-day streak</span>
            ) : (
              <span className="text-[#8f8f8c]">No streak yet</span>
            )}
          </div>
        </div>

        {/* Choose a Game section */}
        <section className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8f8f8c]">
              Choose a Game
            </h3>
            <div className="border-b border-[#2e2e2a] w-full" />
          </div>

          <div className="divide-y divide-[#2e2e2a]">
            {/* Word Chain Game */}
            <button
              onClick={() => setActiveModal('wordchain')}
              className="flex w-full items-center justify-between py-5 text-left group hover:opacity-90 transition"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2e2e2a] bg-[#1e1e1c] text-[#f5f5f3] group-hover:border-[#d97706]/40 transition">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#f5f5f3] font-sans">
                    Word Chain
                  </h4>
                  <p className="text-xs sm:text-sm text-[#8f8f8c] font-sans">
                    Connect words one letter at a time
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8f8f8c] group-hover:translate-x-1 group-hover:text-[#f5f5f3] transition-all" />
            </button>

            {/* Hangman Game */}
            <button
              onClick={() => openComingSoon('Hangman')}
              className="flex w-full items-center justify-between py-5 text-left group hover:opacity-90 transition"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2e2e2a] bg-[#1e1e1c] text-[#f5f5f3] transition">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#f5f5f3] font-sans">
                    Hangman
                  </h4>
                  <p className="text-xs sm:text-sm text-[#8f8f8c] font-sans">
                    Guess the word before time runs out
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8f8f8c] group-hover:translate-x-1 group-hover:text-[#f5f5f3] transition-all" />
            </button>

            {/* SpellCraft Game */}
            <button
              onClick={() => openComingSoon('SpellCraft')}
              className="flex w-full items-center justify-between py-5 text-left group hover:opacity-90 transition"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2e2e2a] bg-[#1e1e1c] text-[#f5f5f3] font-serif font-bold italic transition">
                  Sc
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#f5f5f3] font-sans">
                    SpellCraft
                  </h4>
                  <p className="text-xs sm:text-sm text-[#8f8f8c] font-sans">
                    Build words from your given letters
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8f8f8c] group-hover:translate-x-1 group-hover:text-[#f5f5f3] transition-all" />
            </button>

            {/* Lexihunt Game */}
            <button
              onClick={() => openComingSoon('Lexihunt')}
              className="flex w-full items-center justify-between py-5 text-left group hover:opacity-90 transition"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2e2e2a] bg-[#1e1e1c] text-[#f5f5f3] transition">
                  <Map className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#f5f5f3] font-sans">
                    Lexihunt
                  </h4>
                  <p className="text-xs sm:text-sm text-[#8f8f8c] font-sans">
                    Hunt for hidden words in the grid
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8f8f8c] group-hover:translate-x-1 group-hover:text-[#f5f5f3] transition-all" />
            </button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-16 flex items-center justify-between border-t border-[#2e2e2a]/55 pt-6 text-[11px] sm:text-xs text-[#8f8f8c]">
        <div className="flex gap-4">
          <span className="cursor-pointer hover:text-[#f5f5f3] transition">About</span>
          <span className="cursor-pointer hover:text-[#f5f5f3] transition">Archive</span>
          <span className="cursor-pointer hover:text-[#f5f5f3] transition">Stats</span>
        </div>
        <span className="font-serif italic text-[#8f8f8c]">website_url</span>
      </footer>

      {/* Word Chain Modes Overlay Modal */}
      {activeModal === 'wordchain' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl border border-[#2e2e2a] bg-[#1e1e1c] p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold font-serif text-[#f5f5f3]">Word Chain</h3>
            <p className="mt-2 text-sm text-[#8f8f8c]">Select a game mode to start chaining words.</p>

            <div className="mt-6 space-y-3">
              <Link
                href="/game/solo"
                className="flex items-center justify-between rounded-lg border border-[#2e2e2a] bg-[#121211] p-4 text-left hover:border-amber-600 transition"
              >
                <div>
                  <p className="font-bold text-[#f5f5f3]">Solo Practice</p>
                  <p className="text-xs text-[#8f8f8c] mt-0.5">Chain words by yourself against the clock.</p>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-500" />
              </Link>

              <Link
                href="/create-room"
                className="flex items-center justify-between rounded-lg border border-[#2e2e2a] bg-[#121211] p-4 text-left hover:border-amber-600 transition"
              >
                <div>
                  <p className="font-bold text-[#f5f5f3]">Play with Friends</p>
                  <p className="text-xs text-[#8f8f8c] mt-0.5">Create a private lobby and invite players.</p>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-500" />
              </Link>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="mt-6 w-full rounded-lg border border-[#2e2e2a] py-2.5 text-sm font-semibold hover:bg-[#252522] transition text-[#f5f5f3]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Coming Soon Modal */}
      {activeModal === 'comingsoon' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-xl border border-[#2e2e2a] bg-[#1e1e1c] p-6 shadow-xl text-center relative animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-4">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-bold font-serif text-[#f5f5f3]">Coming Soon</h3>
            <p className="mt-2 text-sm text-[#8f8f8c]">
              We are working hard to bring {comingSoonGame} to WordGym. Stay tuned!
            </p>
            <button
              onClick={() => setActiveModal(null)}
              className="mt-6 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition"
            >
              Awesome
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
