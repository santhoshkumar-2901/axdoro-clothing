import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'brand' | 'secondary' | 'outline' | 'charcoal' | 'success' | 'warning' | 'destructive' | 'info';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-axdoro-charcoal text-white border-transparent shadow-sm',
    brand: 'bg-axdoro-accent text-white border-transparent shadow-sm',
    secondary: 'bg-axdoro-surface-muted border-axdoro-border text-axdoro-text',
    outline: 'border-axdoro-border-strong text-axdoro-text bg-transparent',
    charcoal: 'bg-axdoro-charcoal text-white border-transparent shadow-sm',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    destructive: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase transition-colors tracking-wide',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
