import React from 'react';
import {
  RotateCcw,
  ShieldCheck,
  Truck,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface ReturnPolicyPageProps {
  onNavigate?: (path: string) => void;
}

export const ReturnPolicyPage: React.FC<ReturnPolicyPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-axdoro-bg text-axdoro-text py-10 sm:py-14 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header Hero */}
        <div className="border-b border-axdoro-border pb-8 text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-axdoro-surface-muted text-axdoro-accent text-xs font-semibold uppercase tracking-wider">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Customer Service &amp; Policies</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-axdoro-charcoal tracking-tight">
            Return &amp; Exchange Policy
          </h1>
          <p className="text-sm sm:text-base text-axdoro-text-muted max-w-2xl mx-auto leading-relaxed">
            Please review the complete AXDORO Return &amp; Exchange Policy below. All requests are evaluated strictly according to these terms.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate?.('/returns')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-xs sm:text-sm font-semibold transition-all shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <span>Submit a Return Request</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="https://wa.me/919941816815?text=Hello%20AXDORO!%20I%20have%20a%20question%20about%20my%20order."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-axdoro-surface hover:bg-axdoro-surface-muted border border-axdoro-border text-axdoro-charcoal text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <span>Contact Support</span>
            </a>
          </div>
        </div>

        {/* Quick Summary Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <h2 className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">7-Day Window</h2>
            <p className="text-xs text-axdoro-text-muted leading-relaxed">
              Return and exchange requests must be submitted within seven days of delivery.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h2 className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">Original Condition</h2>
            <p className="text-xs text-axdoro-text-muted leading-relaxed">
              Products must be unused, unworn, unwashed, and in original condition with tags attached.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <h2 className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">Shipping Terms</h2>
            <p className="text-xs text-axdoro-text-muted leading-relaxed">
              AXDORO handles shipping for confirmed AXDORO-caused errors; other requests may incur charges.
            </p>
          </div>
        </div>

        {/* 1. Return Policy */}
        <section id="return-policy" className="space-y-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-axdoro-charcoal text-white flex items-center justify-center text-sm font-bold">
              1
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-axdoro-charcoal tracking-tight">
              Return Policy
            </h2>
          </div>

          <div className="bg-axdoro-surface border border-axdoro-border rounded-xl p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-axdoro-text">
            <ul className="space-y-3 pl-4 list-disc marker:text-axdoro-accent">
              <li>
                <strong>Submission Window:</strong> Return requests must be submitted within <strong>seven days of delivery</strong>.
              </li>
              <li>
                <strong>Product Condition Requirements:</strong>
                <ul className="mt-2 space-y-1.5 pl-5 list-circle text-axdoro-text-muted">
                  <li>Products must be unused and unworn.</li>
                  <li>Products must not be washed.</li>
                  <li>Original tags and labels must remain attached.</li>
                  <li>Products must remain in their original condition.</li>
                  <li>Products must not have stains, marks, makeup, perfume, or body odour.</li>
                  <li>Products must not be altered, modified, or repaired.</li>
                  <li>Customer-damaged products are not eligible.</li>
                  <li>Original packaging must be included wherever applicable.</li>
                </ul>
              </li>
              <li>
                <strong>Return Exclusions:</strong> Final Sale, Clearance, and Non-Returnable products cannot be returned.
              </li>
              <li>
                <strong>Inspection Requirement:</strong> Returned products are subject to inspection. Refunds are processed after approved returns pass inspection.
              </li>
              <li>
                <strong>Request Approval:</strong> Submitting a request does not guarantee approval.
              </li>
            </ul>
          </div>
        </section>

        {/* 2. Exchange Policy */}
        <section id="exchange-policy" className="space-y-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-axdoro-charcoal text-white flex items-center justify-center text-sm font-bold">
              2
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-axdoro-charcoal tracking-tight">
              Exchange Policy
            </h2>
          </div>

          <div className="bg-axdoro-surface border border-axdoro-border rounded-xl p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-axdoro-text">
            <ul className="space-y-3 pl-4 list-disc marker:text-axdoro-accent">
              <li>
                <strong>Submission Window:</strong> Exchange requests must be submitted within <strong>seven days of delivery</strong>.
              </li>
              <li>
                <strong>Stock Availability:</strong> Exchanges depend on replacement stock availability.
              </li>
              <li>
                <strong>Product Condition Requirements:</strong> Products submitted for exchange must satisfy all standard condition requirements:
                <ul className="mt-2 space-y-1.5 pl-5 list-circle text-axdoro-text-muted">
                  <li>Products must be unused and unworn.</li>
                  <li>Products must not be washed.</li>
                  <li>Original tags and labels must remain attached.</li>
                  <li>Products must remain in their original condition.</li>
                  <li>Products must not have stains, marks, makeup, perfume, or body odour.</li>
                  <li>Products must not be altered, modified, or repaired.</li>
                  <li>Customer-damaged products are not eligible.</li>
                  <li>Original packaging must be included wherever applicable.</li>
                </ul>
              </li>
              <li>
                <strong>Exchange Exclusions:</strong> Final Sale, Clearance, and Non-Exchangeable products cannot be exchanged.
              </li>
              <li>
                <strong>Inspection Requirement:</strong> Returned products are subject to inspection.
              </li>
              <li>
                <strong>Request Approval:</strong> Submitting a request does not guarantee approval.
              </li>
            </ul>
          </div>
        </section>

        {/* 3. Terms & Conditions */}
        <section id="terms-and-conditions" className="space-y-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-axdoro-charcoal text-white flex items-center justify-center text-sm font-bold">
              3
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-axdoro-charcoal tracking-tight">
              Terms &amp; Conditions
            </h2>
          </div>

          <div className="bg-axdoro-surface border border-axdoro-border rounded-xl p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-axdoro-text">
            {/* AXDORO Shipping Responsibility Banner */}
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-blue-950 mb-0.5">AXDORO Shipping Responsibility:</strong>
                Confirmed AXDORO-caused wrong, damaged, or defective products have applicable shipping charges handled by AXDORO.
              </div>
            </div>

            <ul className="space-y-3 pl-4 list-disc marker:text-axdoro-accent">
              <li>
                <strong>Customer Shipping &amp; Pickup Charges:</strong> Customer-requested returns and exchanges may incur applicable pickup or shipping charges.
              </li>
              <li>
                <strong>Refund Deductions:</strong> Applicable return shipping charges may be deducted from refunds.
              </li>
              <li>
                <strong>Inspection Prerequisite:</strong> Returned products are subject to inspection. Refunds are processed after approved returns pass inspection.
              </li>
              <li>
                <strong>Refund Processing Timeline:</strong> Refund processing time depends on the payment provider or bank.
              </li>
              <li>
                <strong>No Guarantee of Approval:</strong> Submitting a request does not guarantee approval. All requests are subject to verification and inspection.
              </li>
            </ul>
          </div>
        </section>

        {/* 4. Return Process */}
        <section id="return-process" className="space-y-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-axdoro-charcoal text-white flex items-center justify-center text-sm font-bold">
              4
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-axdoro-charcoal tracking-tight">
              Return Process
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 01</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Submit Request</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                Submit a return request within seven days of delivery providing your Order ID, phone number, email address, return reason, and optional supporting description or photos.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 02</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Administrative Review</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                AXDORO reviews the submitted request against order records, verifies the seven-day delivery window, and evaluates eligibility. Submitting a request does not guarantee approval.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 03</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Product Return</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                If the request is approved, return instructions are provided. Confirmed AXDORO-caused wrong, damaged, or defective products have applicable shipping charges handled by AXDORO. Customer-requested returns may incur applicable shipping or pickup charges.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 04</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Inspection &amp; Refund</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                Returned products are subject to inspection. Refunds are processed after approved returns pass inspection. Applicable return shipping charges may be deducted from refunds. Refund processing time depends on the payment provider or bank.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Exchange Process */}
        <section id="exchange-process" className="space-y-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-axdoro-charcoal text-white flex items-center justify-center text-sm font-bold">
              5
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-axdoro-charcoal tracking-tight">
              Exchange Process
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 01</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Submit Request</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                Submit an exchange request within seven days of delivery with your Order ID, contact details, exchange reason, and requested replacement details.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 02</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Review &amp; Stock Verification</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                AXDORO verifies the order and replacement stock availability. Exchanges depend on replacement stock availability. Submitting a request does not guarantee approval.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 03</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Product Return</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                Upon approval, instructions are provided for sending the product. Confirmed AXDORO-caused issues have applicable shipping handled by AXDORO. Customer-requested exchanges may incur applicable pickup or shipping charges.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-axdoro-surface border border-axdoro-border space-y-2">
              <span className="text-xs font-bold text-axdoro-accent font-mono">STEP 04</span>
              <h3 className="text-sm font-bold text-axdoro-charcoal">Inspection &amp; Replacement</h3>
              <p className="text-xs text-axdoro-text-muted leading-relaxed">
                Returned products are subject to inspection to ensure all condition requirements are satisfied. Following approved inspection, the replacement item is dispatched.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <div className="p-8 rounded-2xl bg-axdoro-surface border border-axdoro-border text-center space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-axdoro-charcoal">
            Ready to initiate a return or exchange?
          </h2>
          <p className="text-xs sm:text-sm text-axdoro-text-muted max-w-lg mx-auto">
            Make sure you have your Order ID and contact details handy before submitting.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate?.('/returns')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-xs sm:text-sm font-semibold transition-all shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <span>Submit Return Request</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onNavigate?.('/');
              }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-axdoro-border text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <span>Back to Store</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
