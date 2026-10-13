import React from 'react';
import { ArrowRight } from 'lucide-react';

interface PromoBannerProps {
  onOpenBulk: () => void;
}

export const PromoBanner: React.FC<PromoBannerProps> = ({ onOpenBulk }) => {
  return (
    <div
      role="region"
      aria-label="Announcement"
      className="bg-axdoro-charcoal text-white py-2 px-4 text-[11px] sm:text-xs font-medium tracking-wide"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-4 text-center sm:text-left">
        <p className="text-zinc-200">
          <span className="font-semibold text-white tracking-wider uppercase text-[10px] mr-2 px-1.5 py-0.5 rounded bg-white/10">
            Axdoro Apparel
          </span>
          Quality T-Shirts (140 GSM) &amp; Tailored Shirts for Everyday &amp; Bulk Needs
        </p>
        <button
          onClick={onOpenBulk}
          className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white rounded py-0.5"
        >
          <span className="underline underline-offset-4 font-semibold text-[11px]">
            Enquire for Bulk Orders
          </span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
