import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 select-none',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-zinc-900 text-zinc-50 shadow-sm',
        secondary:
          'border-zinc-200 bg-zinc-100 text-zinc-700',
        outline:
          'border-zinc-200 text-zinc-800 bg-white',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-700 font-medium',
        warning:
          'border-amber-200 bg-amber-50 text-amber-700 font-medium',
        destructive:
          'border-red-200 bg-red-50 text-red-700 font-medium',
        info:
          'border-sky-200 bg-sky-50 text-sky-700 font-medium',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
