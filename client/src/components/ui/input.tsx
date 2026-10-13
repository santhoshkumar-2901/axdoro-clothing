import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-axdoro-border-strong bg-axdoro-surface px-3 py-1 text-xs text-axdoro-text shadow-sm transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-axdoro-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent focus-visible:ring-offset-2 focus-visible:ring-offset-axdoro-bg disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-axdoro-surface-muted',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-xs font-semibold text-axdoro-text leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
));
Label.displayName = 'Label';

export { Input, Label };
