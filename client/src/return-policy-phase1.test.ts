import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 1: Return & Exchange Policy and Navigation Verification', () => {
  const policyPagePath = path.resolve(__dirname, 'pages/ReturnPolicyPage.tsx');
  const requestPagePath = path.resolve(__dirname, 'pages/ReturnRequestPage.tsx');
  const navbarPath = path.resolve(__dirname, 'components/Navbar.tsx');
  const footerPath = path.resolve(__dirname, 'components/Footer.tsx');
  const appPath = path.resolve(__dirname, 'App.tsx');

  it('verifies that ReturnPolicyPage.tsx exists and strictly contains the approved policy sections and rules', () => {
    expect(fs.existsSync(policyPagePath)).toBe(true);
    const content = fs.readFileSync(policyPagePath, 'utf8');

    // 1. Return Policy
    expect(content).toContain('Return Policy');
    expect(content).toContain('seven days of delivery');
    expect(content).toContain('Products must be unused and unworn');
    expect(content).toContain('Products must not be washed');
    expect(content).toContain('Original tags and labels must remain attached');
    expect(content).toContain('Products must remain in their original condition');
    expect(content).toContain('Products must not have stains, marks, makeup, perfume, or body odour');
    expect(content).toContain('Products must not be altered, modified, or repaired');
    expect(content).toContain('Customer-damaged products are not eligible');
    expect(content).toContain('Original packaging must be included wherever applicable');
    expect(content).toContain('Final Sale, Clearance, and Non-Returnable products cannot be returned');

    // 2. Exchange Policy
    expect(content).toContain('Exchange Policy');
    expect(content).toContain('Exchanges depend on replacement stock availability');
    expect(content).toContain('Final Sale, Clearance, and Non-Exchangeable products cannot be exchanged');

    // 3. Terms & Conditions
    expect(content).toContain('Terms &amp; Conditions');
    expect(content).toContain('AXDORO Shipping Responsibility');
    expect(content).toContain('Confirmed AXDORO-caused wrong, damaged, or defective products have applicable shipping charges handled by AXDORO');
    expect(content).toContain('Customer-requested returns and exchanges may incur applicable pickup or shipping charges');
    expect(content).toContain('Applicable return shipping charges may be deducted from refunds');
    expect(content).toContain('Refunds are processed after approved returns pass inspection');
    expect(content).toContain('Refund processing time depends on the payment provider or bank');
    expect(content).toContain('Submitting a request does not guarantee approval');

    // 4. Return Process & 5. Exchange Process
    expect(content).toContain('Return Process');
    expect(content).toContain('Exchange Process');

    // Strict check: Absence of unapproved terms
    expect(content).not.toContain('bespoke');
    expect(content).not.toContain('5 to 7 business days');
    expect(content).not.toContain('5–7 working days');
    expect(content).not.toContain('identical styles');
    expect(content).not.toContain('at your own expense');
    expect(content).not.toContain('AXDORO Responsibility Guarantee');
  });

  it('verifies that ReturnRequestPage.tsx exists with 7-day policy guidance and no unapproved terms', () => {
    expect(fs.existsSync(requestPagePath)).toBe(true);
    const content = fs.readFileSync(requestPagePath, 'utf8');
    expect(content).toContain('Return &amp; Exchange Request');
    expect(content).toContain('7-Day Eligibility Policy');
    expect(content).toContain('seven days of delivery');
    expect(content).toContain('/return-policy');

    expect(content).not.toContain('bespoke');
    expect(content).not.toContain('5 to 7');
  });

  it('verifies that Navbar.tsx includes the Return button on desktop and mobile', () => {
    const content = fs.readFileSync(navbarPath, 'utf8');
    // Desktop return button
    expect(content).toContain("aria-label=\"Return or Exchange an Order\"");
    expect(content).toContain("onNavigate('/returns')");

    // Mobile drawer navigation link
    expect(content).toContain('Return / Exchange');
    expect(content).toContain('Return &amp; Exchange Policy');
  });

  it('verifies that Footer.tsx includes the Return & Exchange Policy link', () => {
    const content = fs.readFileSync(footerPath, 'utf8');
    expect(content).toContain('Return &amp; Exchange Policy');
    expect(content).toContain("onNavigate('/return-policy')");
    expect(content).toContain("onNavigate('/returns')");
  });

  it('verifies that App.tsx routes to ReturnPolicyPage and ReturnRequestPage', () => {
    const content = fs.readFileSync(appPath, 'utf8');
    expect(content).toContain('isReturnPolicyRoute');
    expect(content).toContain('isReturnRoute');
    expect(content).toContain('<ReturnPolicyPage');
    expect(content).toContain('<ReturnRequestPage');
  });
});
