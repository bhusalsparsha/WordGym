import type { Metadata } from 'next';
import { Inter, Libre_Baskerville } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  variable: '--font-baskerville',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'WordGym',
  description: 'Daily Word Games',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Edu NSW ACT Hand Cursive loaded via googlefonts since next/font doesn't support it */}
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Edu+NSW+ACT+Hand+Cursive:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} ${libreBaskerville.variable} bg-background text-[#f5f5f3] antialiased`}>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
