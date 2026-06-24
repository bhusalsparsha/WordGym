import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  href?: string;
} & ButtonHTMLAttributes<HTMLButtonElement> &
  AnchorHTMLAttributes<HTMLAnchorElement>;

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[#d97706] text-white hover:bg-amber-700 active:scale-[0.98]',
  secondary: 'border border-[#2e2e2a] bg-[#1e1e1c] text-[#f5f5f3] hover:bg-[#252522] active:scale-[0.98]',
  ghost: 'text-[#8f8f8c] hover:bg-[#1e1e1c] hover:text-[#f5f5f3]',
};

export function Button({ children, className, href, variant = 'primary', ...props }: ButtonProps) {
  const classes = cn('neo-button', variantClasses[variant], className);

  if (href) {
    return (
      <Link href={href} className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
