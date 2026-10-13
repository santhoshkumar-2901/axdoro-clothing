import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'brand' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantStyles = {
      default:
        'bg-axdoro-charcoal text-white shadow-sm hover:bg-black/85 active:bg-black focus-visible:ring-axdoro-charcoal',
      brand:
        'bg-axdoro-accent text-white shadow-sm hover:bg-axdoro-accent/90 active:bg-axdoro-accent-muted focus-visible:ring-axdoro-accent',
      destructive:
        'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-600',
      outline:
        'border border-axdoro-border-strong bg-axdoro-surface text-axdoro-text shadow-sm hover:bg-axdoro-bg hover:border-axdoro-charcoal focus-visible:ring-axdoro-charcoal',
      secondary:
        'bg-axdoro-surface-muted border border-axdoro-border text-axdoro-text shadow-sm hover:bg-axdoro-border/60 hover:border-axdoro-border-strong focus-visible:ring-axdoro-charcoal',
      ghost:
        'hover:bg-axdoro-border/40 hover:text-axdoro-text text-axdoro-text-muted focus-visible:ring-axdoro-accent',
      link:
        'text-axdoro-accent underline-offset-4 hover:underline hover:text-axdoro-accent-muted focus-visible:ring-axdoro-accent p-0 h-auto',
    };

    const sizeStyles = {
      default: 'h-9 px-4 py-2 text-xs',
      sm: 'h-7 rounded-md px-2.5 text-[11px]',
      lg: 'h-11 rounded-lg px-6 text-sm',
      icon: 'h-8 w-8',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-axdoro-bg disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
