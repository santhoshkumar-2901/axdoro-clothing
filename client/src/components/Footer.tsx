import React, { useState, useEffect } from 'react';
import { ProductCategory, Category } from '../types/product.ts';
import { MessageSquare, Mail, Phone } from 'lucide-react';
import { useScrollLock } from '../utils/scrollLock.ts';

interface FooterProps {
  onSelectCategory: (category: ProductCategory | 'all') => void;
  onOpenBulk: () => void;
  onScrollToShop: () => void;
  onScrollToAbout: () => void;
  categories?: Category[];
  onNavigate?: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({
  onSelectCategory,
  onOpenBulk,
  onScrollToShop,
  onScrollToAbout,
  categories = [],
  onNavigate,
}) => {
  const [activePolicyModal, setActivePolicyModal] = useState<string | null>(null);

  // Global reference-counted scroll lock while policy dialog is open
  useScrollLock(Boolean(activePolicyModal));

  useEffect(() => {
    if (!activePolicyModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePolicyModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePolicyModal]);

  const policyPlaceholders: Record<string, string> = {
    'Privacy Policy':
      'Privacy Policy terms are currently pending formal client review. Official data handling and privacy terms provided by the business owner will be published prior to production release.',
    'Terms & Conditions':
      'Terms & Conditions are currently pending formal client review. Official terms of service and commercial guidelines will be published prior to production release.',
    'Shipping Policy':
      'Shipping Policy terms and dispatch schedules are currently pending formal client review. Carrier partners, delivery timelines, and shipping fee structures will be confirmed by the business owner prior to production release.',
    'Return / Exchange Policy':
      'Return and Exchange policies are currently pending formal client review. Eligibility windows, item condition requirements, and exchange workflows will be confirmed by the business owner prior to production release.',
    'Cancellation Policy':
      'Cancellation Policy terms are currently pending formal client review. Permitted cancellation timeframes and order status cutoffs will be confirmed by the business owner prior to production release.',
    'FAQ':
      'Frequently Asked Questions covering fabric care, 140 GSM cotton specifications, and bulk order processes are currently pending formal client review.',
  };

  return (
    <footer className="bg-axdoro-bg border-t border-axdoro-border text-axdoro-text-muted text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center">
              <img
                src="/logo-transparent.png"
                alt="AXDORO"
                width={128}
                height={32}
                className="h-8 w-auto object-contain"
              />
            </div>
            <p className="text-axdoro-text-muted leading-relaxed max-w-sm">
              A contemporary clothing brand focused on quality, comfort, modern style, and dependable bulk order execution.
            </p>
            <p className="text-[11px] font-mono text-axdoro-charcoal font-semibold">
              &ldquo;Wear Your Attitude. Express Your Style.&rdquo;
            </p>
            <div className="pt-2">
              <a
                href="https://wa.me/919941816815?text=Hello%20AXDORO%20Team!%20I%20have%20an%20enquiry."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer font-medium shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                <span>WhatsApp Us: +91 99418 16815</span>
              </a>
            </div>
          </div>

          {/* Quick Collection Links */}
          <div className="space-y-3">
            <h4 className="font-bold text-axdoro-charcoal uppercase tracking-wider text-xs">Collection</h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => {
                    if (onNavigate && window.location.pathname !== '/') {
                      onNavigate('/');
                      setTimeout(() => onScrollToShop(), 50);
                    } else {
                      onSelectCategory('all');
                      onScrollToShop();
                    }
                  }}
                  className="hover:text-axdoro-charcoal transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded py-0.5"
                >
                  All Styles
                </button>
              </li>
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate(`/category/${cat.slug}`);
                        } else {
                          onSelectCategory(cat.slug);
                          onScrollToShop();
                        }
                      }}
                      className="hover:text-axdoro-charcoal transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded py-0.5"
                    >
                      {cat.name}
                    </button>
                  </li>
                ))
              ) : (
                <>
                  <li>
                    <button
                      onClick={() => {
                        if (onNavigate) onNavigate('/category/t-shirts');
                        else { onSelectCategory('t-shirts'); onScrollToShop(); }
                      }}
                      className="hover:text-axdoro-charcoal transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded py-0.5"
                    >
                      T-Shirts (140 GSM)
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        if (onNavigate) onNavigate('/category/shirts');
                        else { onSelectCategory('shirts'); onScrollToShop(); }
                      }}
                      className="hover:text-axdoro-charcoal transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded py-0.5"
                    >
                      Shirts Collection
                    </button>
                  </li>
                </>
              )}
              <li>
                <button
                  onClick={onOpenBulk}
                  className="text-axdoro-accent-muted hover:text-axdoro-accent font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded py-0.5"
                >
                  Bulk Order Enquiry
                </button>
              </li>
            </ul>
          </div>

          {/* About & Policies */}
          <div className="space-y-3">
            <h4 className="font-bold text-axdoro-charcoal uppercase tracking-wider text-xs">Customer Care</h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={onScrollToAbout}
                  className="hover:text-axdoro-charcoal transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded py-0.5"
                >
                  About AXDORO
                </button>
              </li>
            </ul>
          </div>

          {/* Business Contact */}
          <div className="space-y-3">
            <h4 className="font-bold text-axdoro-charcoal uppercase tracking-wider text-xs">Contact &amp; Owner</h4>
            <div className="space-y-2.5 text-axdoro-text-muted">
              <p className="font-semibold text-axdoro-charcoal">JANA VITHIYABATHI</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-axdoro-charcoal flex-shrink-0" />
                <span>+91 99418 16815</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-axdoro-charcoal flex-shrink-0" />
                <a href="mailto:Janavvagj@gmail.com" className="hover:text-axdoro-charcoal transition-colors">
                  Janavvagj@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="border-t border-axdoro-border mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-stone-500">
          <div>
            &copy; {new Date().getFullYear()} AXDORO. All rights reserved. Premium Clothing Platform.
          </div>
        </div>
      </div>

      {/* Policy Dev Placeholder Modal */}
      {activePolicyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-dialog-title"
          onClick={() => setActivePolicyModal(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-axdoro-surface border border-axdoro-border-strong rounded-xl p-6 max-w-md w-full shadow-elevated space-y-4"
          >
            <div className="flex justify-between items-center border-b border-axdoro-border pb-3">
              <h3 id="policy-dialog-title" className="font-bold text-sm text-axdoro-charcoal">{activePolicyModal}</h3>
              <button
                onClick={() => setActivePolicyModal(null)}
                className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <p className="text-xs text-axdoro-text leading-relaxed">
              {policyPlaceholders[activePolicyModal]}
            </p>
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
              Notice: This is a clearly flagged development placeholder. Official legal copy requires project owner release before production launch.
            </div>
            <button
              onClick={() => setActivePolicyModal(null)}
              className="w-full py-2.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </footer>
  );
};
