import React, { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';

export const Newsletter: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setTimeout(() => {
        setEmail('');
        setSubscribed(false);
      }, 4000);
    }
  };

  return (
    <section className="py-16 border-b border-axdoro-border bg-axdoro-bg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-4">
        <div className="w-10 h-10 rounded-full bg-axdoro-surface border border-axdoro-border flex items-center justify-center mx-auto text-axdoro-charcoal shadow-subtle">
          <Mail className="w-5 h-5 text-axdoro-accent-muted" />
        </div>
        <h3 className="text-2xl font-extrabold text-axdoro-charcoal tracking-tight">
          Stay Informed on New Drops &amp; Fabric Specs
        </h3>
        <p className="text-xs sm:text-sm text-axdoro-text-muted max-w-md mx-auto leading-relaxed">
          Get notified when seasonal collections release and receive advance bulk pricing updates directly.
        </p>

        {subscribed ? (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs inline-flex items-center gap-2 animate-in zoom-in-95 shadow-subtle"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">Thank you for your interest!</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center justify-center gap-2.5 max-w-md mx-auto pt-2">
            <div className="w-full relative">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address..."
                className="w-full px-4 py-2.5 rounded-lg bg-axdoro-surface border border-axdoro-border-strong text-xs text-axdoro-text placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent focus:border-axdoro-accent shadow-subtle transition-all"
              />
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white font-semibold text-xs uppercase tracking-wider transition-colors shadow-subtle cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Subscribe
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
