import React from 'react';
import { ArrowRight, Layers, CheckCircle2 } from 'lucide-react';

interface HeroProps {
  onExplore: () => void;
  onOpenBulk: () => void;
  heroImageUrl?: string | null;
}

export const Hero: React.FC<HeroProps> = ({ onExplore, onOpenBulk, heroImageUrl }) => {
  const [imageSrc, setImageSrc] = React.useState<string>(heroImageUrl || '/hero-bg.jpg');

  React.useEffect(() => {
    setImageSrc(heroImageUrl || '/hero-bg.jpg');
  }, [heroImageUrl]);

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-axdoro-border bg-[#0D0B14]">
      {/* Background Picture & Atmospheric Gradient Overlays */}
      <div className="absolute inset-0 z-0">
        <img
          src={imageSrc}
          alt="AXDORO Contemporary Apparel Lifestyle"
          className="w-full h-full object-cover object-[75%_center] lg:object-right"
          loading="eager"
          onError={() => setImageSrc('/hero-bg.jpg')}
        />
        {/* Deep purple gradient vignette: dark on the left for text contrast, transparent on the right for models */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D0B14] via-[#0D0B14]/90 to-transparent lg:via-[#0D0B14]/75 lg:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0B14] via-transparent to-transparent opacity-80" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left Column: Editorial Headline & Copy (All Content 100% Preserved) */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/15 text-stone-200 text-[11px] font-mono font-bold tracking-wider uppercase shadow-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5B842]" />
              <span>Contemporary Apparel &bull; T-Shirts &amp; Shirts</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
              AXDORO &ndash; Clothing Made for Every Occasion
            </h1>

            <p className="text-base sm:text-lg font-medium text-stone-200">
              Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.
            </p>

            <p className="text-xs sm:text-sm text-stone-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Discover quality clothing designed for everyday wear and professional bulk requirements.
              AXDORO focuses on delivering comfortable, well-selected apparel with a smooth and reliable ordering experience.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5">
              <button
                onClick={onExplore}
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-[#E5B842] hover:bg-[#D4A731] text-black font-bold text-xs uppercase tracking-wider transition-all shadow-card hover:shadow-elevated flex items-center justify-center gap-2 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B842]"
              >
                <span>Explore Collection</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onOpenBulk}
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm border border-white/20 text-white font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B842]"
              >
                <Layers className="w-4 h-4 text-[#E5B842]" />
                <span>Enquire for Bulk Orders</span>
              </button>
            </div>

            {/* Factual Highlights (WCAG-compliant contrast) */}
            <div className="pt-6 border-t border-white/10 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs text-stone-300">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#E5B842] flex-shrink-0" />
                <span>140 GSM Combed Cotton</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#E5B842] flex-shrink-0" />
                <span>Oxford &amp; Linen Tailored Weaves</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#E5B842] flex-shrink-0" />
                <span>Direct Bulk Order Coordination</span>
              </div>
            </div>
          </div>

          {/* Right Column: Spacer to reveal background models seamlessly like reference */}
          <div className="hidden lg:block lg:col-span-5 min-h-[380px]" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
};
