import React from 'react';
import { ShieldCheck, HeartHandshake, Scissors, Layers, Sparkles } from 'lucide-react';

interface EditorialSectionProps {
  onOpenBulk: () => void;
}

export const EditorialSection: React.FC<EditorialSectionProps> = ({ onOpenBulk }) => {
  const brandLetters = [
    { letter: 'A', word: 'Attitude', desc: 'Confidence and individuality in everyday clothing.' },
    { letter: 'X', word: 'eXpression', desc: 'Clothing as a medium to express personal identity.' },
    { letter: 'D', word: 'Design', desc: 'Practical, modern, and wearable cuts engineered for comfort.' },
    { letter: 'O', word: 'Originality', desc: 'Thoughtful collections that represent individual character.' },
    { letter: 'R', word: 'Reliability', desc: 'Clear communication, prompt responses, and dependable service.' },
    { letter: 'O', word: 'Outfit', desc: 'Bringing everything together for everyday and group requirements.' },
  ];

  const pillars = [
    {
      icon: <Scissors className="w-5 h-5 text-axdoro-charcoal" />,
      title: 'Quality-Focused Selection',
      desc: 'Selected apparel fabrics starting with 140 GSM combed cottons and structured Oxford weaves.',
    },
    {
      icon: <Layers className="w-5 h-5 text-axdoro-charcoal" />,
      title: 'Bulk Order Capabilities',
      desc: 'Specialized workflow to assist companies, colleges, teams, and events with volume requirements.',
    },
    {
      icon: <HeartHandshake className="w-5 h-5 text-axdoro-charcoal" />,
      title: 'Clear Communication',
      desc: 'Transparent pricing, honest specifications, and direct coordination from enquiry to delivery.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-axdoro-charcoal" />,
      title: 'Versatile Modern Silhouettes',
      desc: 'Clean aesthetics designed to transition smoothly from daily wear to professional gatherings.',
    },
  ];

  return (
    <section id="about-section" className="py-20 border-b border-axdoro-border bg-axdoro-bg relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Editorial Story Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-axdoro-surface border border-axdoro-border text-axdoro-charcoal text-[11px] font-mono font-bold tracking-wider uppercase mb-4 shadow-subtle">
            <Sparkles className="w-3.5 h-3.5 text-axdoro-accent-muted" />
            <span>Brand Heritage &bull; The AXDORO Meaning</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-axdoro-charcoal tracking-tight">
            More Than Clothing. Made for Your Requirements.
          </h2>
          <p className="text-xs sm:text-sm text-axdoro-text-muted mt-4 leading-relaxed">
            AXDORO is a growing clothing brand created with a simple objective &mdash; to offer clothing that combines comfort, style, and quality while making the buying experience straightforward for customers.
          </p>
          <p className="text-xs font-mono text-axdoro-charcoal mt-3 font-semibold uppercase tracking-widest">
            &ldquo;AXDORO &ndash; Wear Your Attitude. Express Your Style.&rdquo;
          </p>
        </div>

        {/* 6-Letter Editorial Meaning Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-20">
          {brandLetters.map((item, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl border border-axdoro-border bg-axdoro-surface hover:border-axdoro-border-strong transition-all shadow-subtle group text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-axdoro-surface-muted border border-axdoro-border text-axdoro-charcoal font-black text-base flex items-center justify-center mx-auto mb-3 group-hover:bg-axdoro-charcoal group-hover:text-white transition-colors">
                {item.letter}
              </div>
              <h3 className="font-bold text-xs text-axdoro-charcoal mb-1">{item.word}</h3>
              <p className="text-[11px] text-axdoro-text-muted leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Brand Pillars */}
        <div className="border-t border-axdoro-border pt-16">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-mono text-axdoro-accent-muted uppercase tracking-widest font-bold block mb-1.5">
              Our Commitment
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-axdoro-charcoal tracking-tight">
              Why Choose AXDORO?
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pillars.map((p, idx) => (
              <div
                key={idx}
                className="p-6 rounded-xl border border-axdoro-border bg-axdoro-surface hover:shadow-card transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-axdoro-surface-muted border border-axdoro-border flex items-center justify-center mb-4">
                    {p.icon}
                  </div>
                  <h4 className="font-bold text-sm text-axdoro-charcoal mb-2">{p.title}</h4>
                  <p className="text-xs text-axdoro-text-muted leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bulk CTA Callout Strip */}
          <div className="mt-14 rounded-2xl border border-axdoro-border bg-axdoro-surface p-8 sm:p-10 shadow-card flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 text-center md:text-left">
              <span className="text-[11px] font-mono tracking-widest text-axdoro-accent-muted font-bold uppercase block">
                Volume &bull; Uniforms &bull; Custom Specifications
              </span>
              <h4 className="text-xl font-bold text-axdoro-charcoal">Looking for Clothing in Bulk?</h4>
              <p className="text-xs text-axdoro-text-muted max-w-xl">
                From team requirements to events, organizations, and businesses &mdash; AXDORO provides direct coordination and volume options.
              </p>
            </div>
            <button
              onClick={onOpenBulk}
              className="px-6 py-3.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white font-semibold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Start Bulk Enquiry
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
