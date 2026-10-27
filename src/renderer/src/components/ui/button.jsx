import * as React from 'react';
import { cva } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'bg-zinc-900 text-zinc-50 shadow-sm hover:bg-zinc-800 active:scale-[0.99]',
        destructive:
          'bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.99]',
        outline:
          'border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-100 hover:text-zinc-900 active:scale-[0.99]',
        secondary:
          'bg-zinc-100 text-zinc-900 border border-zinc-200/60 shadow-sm hover:bg-zinc-200 active:scale-[0.99]',
        ghost:
          'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900',
        link:
          'text-zinc-900 underline-offset-4 hover:underline',
        quiet:
          'border border-zinc-200/80 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-6',
        icon: 'h-8 w-8 rounded-md',
        unstyled: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      type={asChild ? undefined : 'button'}
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
