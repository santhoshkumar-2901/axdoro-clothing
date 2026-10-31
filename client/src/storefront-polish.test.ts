import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Storefront Polish, Accessibility & SEO Verification (Phase 6)', () => {
  const clientDir = path.resolve(__dirname, '..');

  it('verifies index.html has complete SEO meta tags, Open Graph and crawler directives', () => {
    const htmlContent = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8');

    // Core document tags
    expect(htmlContent).toContain('<html lang="en">');
    expect(htmlContent).toContain('<meta name="robots" content="index, follow" />');
    expect(htmlContent).toContain('<meta name="theme-color" content="#FFFFFF" />');

    // Open Graph
    expect(htmlContent).toContain('<meta property="og:type" content="website" />');
    expect(htmlContent).toContain('<meta property="og:title" content="AXDORO — Clothing Made for Every Occasion" />');
    expect(htmlContent).toContain('<meta property="og:site_name" content="AXDORO" />');
    expect(htmlContent).toContain('<meta property="og:image" content="/logo-dark.png" />');

    // Twitter Card
    expect(htmlContent).toContain('<meta name="twitter:card" content="summary" />');
    expect(htmlContent).toContain('<meta name="twitter:title" content="AXDORO — Clothing Made for Every Occasion" />');
    expect(htmlContent).toContain('<meta name="twitter:image" content="/logo-dark.png" />');
  });

  it('verifies robots.txt exists and contains proper crawl directives', () => {
    const robotsPath = path.join(clientDir, 'public', 'robots.txt');
    expect(fs.existsSync(robotsPath)).toBe(true);

    const content = fs.readFileSync(robotsPath, 'utf-8');
    expect(content).toContain('User-agent: *');
    expect(content).toContain('Allow: /');
    expect(content).toContain('Disallow: /admin');
    expect(content).toContain('Disallow: /api/');
  });

  it('verifies BulkEnquiryModal adheres to design system colors and dialog accessibility', () => {
    const componentContent = fs.readFileSync(
      path.join(clientDir, 'src', 'components', 'BulkEnquiryModal.tsx'),
      'utf-8'
    );

    // Dialog ARIA landmarks
    expect(componentContent).toContain('role="dialog"');
    expect(componentContent).toContain('aria-modal="true"');
    expect(componentContent).toContain('aria-labelledby="bulk-enquiry-title"');
    expect(componentContent).toContain("if (e.key === 'Escape' && isOpen)");

    // Design tokens & dark mode color defect resolution
    expect(componentContent).toContain('text-axdoro-charcoal');
    expect(componentContent).toContain('text-axdoro-text-muted');
    expect(componentContent).not.toContain('text-zinc-300');
    expect(componentContent).not.toContain('bg-emerald-950/40');
  });

  it('verifies CategoryShowcase uses semantic buttons and image aspect attributes', () => {
    const componentContent = fs.readFileSync(
      path.join(clientDir, 'src', 'components', 'CategoryShowcase.tsx'),
      'utf-8'
    );

    // Semantic buttons
    expect(componentContent).toContain('<button');
    expect(componentContent).toContain('aria-label="View T-Shirts Collection"');
    expect(componentContent).toContain('aria-label="View Shirts Collection"');
    expect(componentContent).toContain('focus-visible:ring-2 focus-visible:ring-axdoro-accent');
    expect(componentContent).toContain('width={800}');
    expect(componentContent).toContain('height={600}');
    expect(componentContent).toContain('loading="lazy"');
  });

  it('verifies Navbar includes Escape handling, logo dimensions, left hamburger, centered logo, and right search/bag', () => {
    const componentContent = fs.readFileSync(
      path.join(clientDir, 'src', 'components', 'Navbar.tsx'),
      'utf-8'
    );

    expect(componentContent).toContain("if (e.key === 'Escape' && mobileMenuOpen)");
    expect(componentContent).toContain('width={144}');
    expect(componentContent).toContain('height={36}');
    expect(componentContent).toContain('aria-controls="mobile-navigation-menu"');
    expect(componentContent).toContain('id="mobile-navigation-menu"');

    // Menu accessibility
    expect(componentContent).toContain('role="menu"');
    expect(componentContent).toContain('role="menuitem"');

    // Verify search and bag controls on navbar
    expect(componentContent).toContain('aria-label="Search Collection"');
    expect(componentContent).toContain('<Search');
    expect(componentContent).toContain('<ShoppingBag');
  });

  it('verifies ProductCard includes explicit image dimensions to prevent layout shifts', () => {
    const componentContent = fs.readFileSync(
      path.join(clientDir, 'src', 'components', 'ProductCard.tsx'),
      'utf-8'
    );

    expect(componentContent).toContain('width={600}');
    expect(componentContent).toContain('height={800}');
  });
});
