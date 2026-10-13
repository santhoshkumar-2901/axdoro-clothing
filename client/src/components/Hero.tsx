import React from 'react';
import { ArrowRight, Layers, CheckCircle2 } from 'lucide-react';

interface HeroProps {
  onExplore: () => void;
  onOpenBulk: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExplore, onOpenBulk }) => {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-axdoro-border bg-axdoro-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left Column: Editorial Headline & Copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-axdoro-surface border border-axdoro-border text-axdoro-charcoal text-[11px] font-mono font-bold tracking-wider uppercase shadow-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-axdoro-accent" />
              <span>Contemporary Apparel &bull; T-Shirts &amp; Shirts</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-axdoro-charcoal tracking-tight leading-[1.1]">
              AXDORO &ndash; Clothing Made for Every Occasion
            </h1>

            <p className="text-base sm:text-lg font-medium text-axdoro-charcoal">
              Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.
            </p>

            <p className="text-xs sm:text-sm text-axdoro-text-muted max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Discover quality clothing designed for everyday wear and professional bulk requirements.
              AXDORO focuses on delivering comfortable, well-selected apparel with a smooth and reliable ordering experience.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5">
              <button
                onClick={onExplore}
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white font-semibold text-xs uppercase tracking-wider transition-all shadow-card hover:shadow-elevated flex items-center justify-center gap-2 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <span>Explore Collection</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onOpenBulk}
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-axdoro-surface hover:bg-axdoro-surface-muted border border-axdoro-border-strong text-axdoro-charcoal font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <Layers className="w-4 h-4 text-axdoro-accent-muted" />
                <span>Enquire for Bulk Orders</span>
              </button>
            </div>

            {/* Factual Highlights (WCAG-compliant contrast) */}
            <div className="pt-6 border-t border-axdoro-border flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs text-axdoro-text-muted">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-axdoro-accent-muted flex-shrink-0" />
                <span>140 GSM Combed Cotton</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-axdoro-accent-muted flex-shrink-0" />
                <span>Oxford &amp; Linen Tailored Weaves</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-axdoro-accent-muted flex-shrink-0" />
                <span>Direct Bulk Order Coordination</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Visual Apparel Frame */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="relative rounded-2xl overflow-hidden border border-axdoro-border bg-axdoro-surface shadow-elevated p-3">
                <div className="relative rounded-xl overflow-hidden bg-stone-100 aspect-[3/4]">
                  <img
                    src="https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=1000&auto=format&fit=crop&q=80"
                    alt="AXDORO Contemporary Apparel Showcase"
                    width={600}
                    height={800}
                    className="w-full h-full object-cover object-center transform hover:scale-[1.02] transition-transform duration-700"
                    loading="eager"
                  />
                </div>

                {/* Editorial Caption Bar */}
                <div className="mt-3 px-3 py-2.5 rounded-lg bg-axdoro-bg border border-axdoro-border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-axdoro-accent-muted uppercase font-bold block">
                      Contemporary Drop
                    </span>
                    <h3 className="text-xs font-bold text-axdoro-charcoal mt-0.5">
                      Tailored Shirts &amp; 140 GSM Tees
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-axdoro-text-muted font-semibold">
                    Core Essentials
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
