import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, ChevronDown } from 'lucide-react';
import { ThemeId, THEME_OPTIONS, ThemeOption } from '../lib/theme.ts';

interface ThemePreviewSwitcherProps {
  currentTheme: ThemeId;
  onSelectTheme: (theme: ThemeId) => void;
  variant?: 'desktop' | 'mobile';
}

export const ThemePreviewSwitcher: React.FC<ThemePreviewSwitcherProps> = ({
  currentTheme,
  onSelectTheme,
  variant = 'desktop',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const activeOption = THEME_OPTIONS.find((t) => t.id === currentTheme) || THEME_OPTIONS[0];

  // =========================================================================
  // MOBILE VARIANT: Inline segmented grid inside mobile drawer
  // Avoids floating popovers that get clipped by drawer bounds or overflow narrow viewports
  // =========================================================================
  if (variant === 'mobile') {
    return (
      <div
        className="w-full space-y-2.5 py-1"
        role="region"
        aria-label="Theme preview switcher"
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-axdoro-charcoal">
            <Palette className="w-3.5 h-3.5 text-axdoro-accent flex-shrink-0" />
            <span>Theme Preview</span>
          </div>
          <span className="text-[10px] font-mono text-axdoro-text-muted">
            Temporary Preview
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Select theme preview palette"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {THEME_OPTIONS.map((opt: ThemeOption) => {
            const isSelected = opt.id === currentTheme;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectTheme(opt.id)}
                className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                  isSelected
                    ? 'border-axdoro-accent bg-axdoro-accent-subtle/50 text-axdoro-charcoal shadow-sm'
                    : 'border-axdoro-border bg-axdoro-surface hover:border-axdoro-border-strong text-axdoro-text'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Color Swatch Dots */}
                  <div className="flex items-center -space-x-1 flex-shrink-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                      style={{ backgroundColor: opt.colors.primary }}
                      aria-hidden="true"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                      style={{ backgroundColor: opt.colors.accent }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{opt.name}</div>
                    <div className="text-[10px] text-axdoro-text-muted truncate">
                      {opt.badge}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <Check className="w-4 h-4 text-axdoro-accent flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // =========================================================================
  // DESKTOP VARIANT: Compact navbar popover button
  // =========================================================================
  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        id="theme-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Theme preview: currently ${activeOption.name}. Click to change theme.`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-axdoro-border bg-axdoro-surface/80 hover:bg-axdoro-surface hover:border-axdoro-border-strong text-axdoro-text hover:text-axdoro-charcoal text-xs font-medium transition-all shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
      >
        <Palette className="w-3.5 h-3.5 text-axdoro-accent flex-shrink-0" />
        <span className="hidden xl:inline text-axdoro-text-muted">Theme:</span>
        <span className="font-semibold text-axdoro-charcoal">{activeOption.name}</span>
        {/* Palette preview pill */}
        <div className="flex items-center -space-x-1 ml-0.5" aria-hidden="true">
          <span
            className="w-2.5 h-2.5 rounded-full border border-black/20"
            style={{ backgroundColor: activeOption.colors.primary }}
          />
          <span
            className="w-2.5 h-2.5 rounded-full border border-black/20"
            style={{ backgroundColor: activeOption.colors.accent }}
          />
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-axdoro-text-muted transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-labelledby="theme-switcher-trigger"
          className="absolute right-0 mt-2 w-64 rounded-xl border border-axdoro-border bg-axdoro-surface shadow-elevated p-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150"
        >
          <div className="px-2.5 py-1.5 border-b border-axdoro-border mb-1">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-axdoro-text-muted block">
              Brand Palette Preview
            </span>
            <span className="text-[11px] text-axdoro-text-muted">
              Temporary client evaluation switcher
            </span>
          </div>

          <div className="space-y-1">
            {THEME_OPTIONS.map((opt: ThemeOption) => {
              const isSelected = opt.id === currentTheme;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectTheme(opt.id);
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full px-2.5 py-2 rounded-lg text-left transition-colors flex items-center justify-between gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                    isSelected
                      ? 'bg-axdoro-accent-subtle text-axdoro-charcoal font-semibold'
                      : 'hover:bg-axdoro-bg text-axdoro-text hover:text-axdoro-charcoal'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Visual Hex Swatches */}
                    <div className="flex items-center -space-x-1 flex-shrink-0" aria-hidden="true">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                        style={{ backgroundColor: opt.colors.primary }}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                        style={{ backgroundColor: opt.colors.accent }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate">
                        {opt.name}
                      </div>
                      <div className="text-[10px] text-axdoro-text-muted truncate">
                        {opt.badge} &bull; {opt.description}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-axdoro-accent flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
