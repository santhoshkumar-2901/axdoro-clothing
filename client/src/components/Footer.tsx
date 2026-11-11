import React, { useState, useEffect } from 'react';
import { ProductCategory, Category } from '../types/product.ts';
import { MessageSquare, Mail, Phone } from 'lucide-react';
import { useScrollLock } from '../utils/scrollLock.ts';

interface FooterProps {
  onSelectCategory: (category: ProductCategory | 'all') => void;
  onOpenBulk: () => void;
  onScrollToShop: () => void;
  onScrollToAbout?: () => void;
  categories?: Category[];
  onNavigate?: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({
  onSelectCategory,
  onOpenBulk,
  onScrollToShop,
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center">
              <img
                src="/logo-dark.png"
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
            <div className="pt-2 space-y-3">
              <a
                href="https://wa.me/919941816815?text=Hello%20AXDORO%20Team!%20I%20have%20an%20enquiry."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer font-medium shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                <span>WhatsApp Us: +91 99418 16815</span>
              </a>

              {/* Social & Community Presence */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-axdoro-charcoal">
                  Connect With AXDORO
                </span>
                <div className="flex items-center gap-2.5">
                  {/* Instagram */}
                  <a
                    href="https://www.instagram.com/axdoro.in?psln=MWN6MjdndnllbDlwdw=="
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="AXDORO on Instagram"
                    title="Instagram (@axdoro.in)"
                    className="w-8 h-8 rounded-full border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal hover:bg-pink-600 hover:text-white hover:border-pink-600 transition-all flex items-center justify-center shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                    </svg>
                  </a>

                  {/* WhatsApp Community */}
                  <a
                    href="https://chat.whatsapp.com/H2VBZSt3H968N2gBvK9lCT?s=cl&p=a&iam=2"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Join AXDORO WhatsApp Community"
                    title="WhatsApp Community"
                    className="w-8 h-8 rounded-full border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all flex items-center justify-center shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.14c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.13 8.13 0 0 1-1.25-4.37c0-4.5 3.66-8.16 8.16-8.16 2.18 0 4.23.85 5.77 2.39a8.13 8.13 0 0 1 2.39 5.77c-.01 4.5-3.67 8.16-8.17 8.16zm4.47-6.1c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.53.07-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.66.31-.23.25-.88.86-.88 2.09s.9 2.43 1.03 2.6c.12.17 1.77 2.7 4.28 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.18-.48-.3z" />
                    </svg>
                  </a>

                  {/* Pinterest */}
                  <a
                    href="https://pin.it/75899hMNX"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="AXDORO on Pinterest"
                    title="Pinterest"
                    className="w-8 h-8 rounded-full border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal hover:bg-red-600 hover:text-white hover:border-red-600 transition-all flex items-center justify-center shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.291 1.199-.332 1.368-.053.224-.177.271-.409.165-1.527-.71-2.48-2.937-2.48-4.726 0-3.847 2.796-7.382 8.067-7.382 4.236 0 7.528 3.018 7.528 7.054 0 4.21-2.654 7.597-6.338 7.597-1.238 0-2.402-.643-2.799-1.406l-.762 2.909c-.276 1.055-1.022 2.378-1.523 3.187C9.37 23.772 10.655 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
                    </svg>
                  </a>

                  {/* LinkedIn */}
                  <a
                    href="https://www.linkedin.com/company/axdoro/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="AXDORO on LinkedIn"
                    title="LinkedIn"
                    className="w-8 h-8 rounded-full border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all flex items-center justify-center shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                    </svg>
                  </a>
                </div>
              </div>
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

          {/* Business Contact */}
          <div id="contact-section" className="space-y-3 scroll-mt-24">
            <h4 className="font-bold text-axdoro-charcoal uppercase tracking-wider text-xs">Contact Us</h4>
            <div className="space-y-2.5 text-axdoro-text-muted">
              <p className="font-semibold text-axdoro-charcoal">JANA V</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-axdoro-charcoal flex-shrink-0" />
                <span>+91 99418 16815</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-axdoro-charcoal flex-shrink-0" />
                <a href="mailto:janavvagj@gmail.com" className="hover:text-axdoro-charcoal transition-colors">
                  janavvagj@gmail.com
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
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-[11px]">
            <button
              type="button"
              onClick={() => {
                if (onNavigate) {
                  onNavigate('/return-policy');
                } else {
                  window.location.href = '/return-policy';
                }
              }}
              className="text-axdoro-text-muted hover:text-axdoro-charcoal transition-colors cursor-pointer font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded px-1 py-0.5"
            >
              Return &amp; Exchange Policy
            </button>
            <button
              type="button"
              onClick={() => {
                if (onNavigate) {
                  onNavigate('/returns');
                } else {
                  window.location.href = '/returns';
                }
              }}
              className="text-axdoro-text-muted hover:text-axdoro-charcoal transition-colors cursor-pointer font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded px-1 py-0.5"
            >
              Return Order
            </button>
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
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
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
