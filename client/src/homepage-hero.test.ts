import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchHomepageHero } from './api/catalogue.ts';
import {
  adminGetHomepageHero,
  adminUpdateHomepageHero,
  adminGetHeroUploadSignature,
} from './api/admin.ts';

describe('Admin-Managed Homepage Hero Banner Client Verification', () => {
  const clientDir = path.resolve(__dirname);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Hero.tsx Dynamic Rendering, Fallbacks & Visual Integrity', () => {
    const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
    const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

    it('declares heroImageUrl optional prop in HeroProps interface', () => {
      expect(heroContent).toContain('heroImageUrl?: string | null;');
    });

    it('initializes image state with heroImageUrl and defaults to /hero-bg.jpg', () => {
      expect(heroContent).toContain('heroImageUrl || \'/hero-bg.jpg\'');
    });

    it('includes onError fallback recovering to /hero-bg.jpg if image fails', () => {
      expect(heroContent).toContain("onError={() => setImageSrc('/hero-bg.jpg')}");
    });

    it('confirms image-only hero omits text overlays and headlines', () => {
      expect(heroContent).not.toContain('AXDORO &ndash; Clothing Made for Every Occasion');
      expect(heroContent).not.toContain('Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.');
      expect(heroContent).not.toContain('Explore Collection');
      expect(heroContent).not.toContain('Enquire for Bulk Orders');
    });

    it('confirms image-only hero omits dark gradient overlays', () => {
      expect(heroContent).not.toContain('bg-gradient-to-r');
      expect(heroContent).not.toContain('bg-gradient-to-t');
    });
  });

  describe('2. App.tsx Integration & Dynamic Hero Binding', () => {
    const appFilePath = path.join(clientDir, 'App.tsx');
    const appContent = fs.readFileSync(appFilePath, 'utf-8');

    it('fetches homepage hero setting on mount and catalogue mutation', () => {
      expect(appContent).toContain('fetchHomepageHero');
      expect(appContent).toContain('setHeroImageUrl(res.imageUrl || null)');
    });

    it('passes heroImageUrl prop to Hero component in App.tsx', () => {
      expect(appContent).toContain('<Hero');
      expect(appContent).toContain('heroImageUrl={heroImageUrl}');
    });
  });

  describe('3. Admin CollectionManagementView.tsx Hero Management Section', () => {
    const collectionViewPath = path.join(clientDir, 'components', 'admin', 'CollectionManagementView.tsx');
    const viewContent = fs.readFileSync(collectionViewPath, 'utf-8');

    it('renames main header to Homepage Content', () => {
      expect(viewContent).toContain('Homepage Content');
    });

    it('places Hero Banner management section above the collections switcher', () => {
      const heroSectionIdx = viewContent.indexOf('Storefront Hero Lifestyle Banner');
      const collectionSwitcherIdx = viewContent.indexOf('Collection Switcher Tabs');
      expect(heroSectionIdx).toBeGreaterThan(0);
      expect(collectionSwitcherIdx).toBeGreaterThan(0);
      expect(heroSectionIdx).toBeLessThan(collectionSwitcherIdx);
    });

    it('provides Hero Image Modal dialog with file upload, direct URL, preview, and cancel', () => {
      expect(viewContent).toContain('Manage Homepage Hero Image');
      expect(viewContent).toContain('Live Banner Preview');
      expect(viewContent).toContain('File Upload (Cloudinary)');
      expect(viewContent).toContain('Direct URL');
      expect(viewContent).toContain('Reset to Default');
      expect(viewContent).toContain('Cancel');
      expect(viewContent).toContain('Save Hero Image');
    });

    it('enforces reference-counted scroll locking when hero modal is open', () => {
      expect(viewContent).toContain('useScrollLock(isHeroModalOpen);');
    });
  });

  describe('4. Client API Methods & Resilience', () => {
    it('fetchHomepageHero returns imageUrl when API responds successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { imageUrl: 'https://res.cloudinary.com/axdoro/hero-sample.webp' },
        }),
      });
      global.fetch = mockFetch;

      const result = await fetchHomepageHero();
      expect(result.imageUrl).toBe('https://res.cloudinary.com/axdoro/hero-sample.webp');
    });

    it('fetchHomepageHero falls back safely with null on network or HTTP error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const result = await fetchHomepageHero();
      expect(result.imageUrl).toBeNull();
    });

    it('adminGetHomepageHero calls /api/admin/homepage/hero with credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { imageUrl: 'https://res.cloudinary.com/hero.jpg', publicId: 'hero_1' },
        }),
      });
      global.fetch = mockFetch;

      const data = await adminGetHomepageHero();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/homepage/hero',
        expect.objectContaining({ credentials: 'include' })
      );
      expect(data.imageUrl).toBe('https://res.cloudinary.com/hero.jpg');
    });

    it('adminGetHeroUploadSignature requests signed Cloudinary credentials', async () => {
      const mockSig = {
        signature: 'mock_sig',
        timestamp: 1234567890,
        apiKey: 'key_123',
        cloudName: 'axdoro',
        folder: 'axdoro/hero',
        publicId: 'hero_123_456',
        uploadUrl: 'https://api.cloudinary.com/v1_1/axdoro/image/upload',
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', data: mockSig }),
      });
      global.fetch = mockFetch;

      const sig = await adminGetHeroUploadSignature();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/homepage/hero/upload-signature',
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(sig).toEqual(mockSig);
    });

    it('adminUpdateHomepageHero sends PUT with CSRF and payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { imageUrl: 'https://res.cloudinary.com/updated.jpg', publicId: 'hero_2' },
        }),
      });
      global.fetch = mockFetch;

      const data = await adminUpdateHomepageHero({
        imageUrl: 'https://res.cloudinary.com/updated.jpg',
        publicId: 'hero_2',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/homepage/hero',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({
            imageUrl: 'https://res.cloudinary.com/updated.jpg',
            publicId: 'hero_2',
          }),
        })
      );
      expect(data.imageUrl).toBe('https://res.cloudinary.com/updated.jpg');
    });
  });

  describe('5. Hero Banner Loading States, Obsolete Image Flash Prevention & Rapid Transitions', () => {
    it('initializes App heroImageUrl as undefined to represent unresolved state', () => {
      const appFilePath = path.join(clientDir, 'App.tsx');
      const appContent = fs.readFileSync(appFilePath, 'utf-8');
      expect(appContent).toContain('const [heroImageUrl, setHeroImageUrl] = useState<string | null | undefined>(undefined);');
      expect(appContent).toContain('setHeroImageUrl(null);');
    });

    it('1. does not render default /hero-bg.jpg while settings are unresolved (heroImageUrl === undefined)', async () => {
      const { renderToString } = await import('react-dom/server');
      const React = await import('react');
      const { Hero } = await import('./components/Hero.tsx');

      const html = renderToString(
        React.createElement(Hero, {
          heroImageUrl: undefined,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Must not render /hero-bg.jpg while unresolved
      expect(html).not.toContain('src="/hero-bg.jpg"');
      expect(html).not.toContain('<img');
      // Background is intact
      expect(html).toContain('bg-axdoro-bg');
      expect(html).not.toContain('bg-gradient-to-r');
    });

    it('2. does not reveal custom image before it loads (starts hidden/unloaded)', async () => {
      const { renderToString } = await import('react-dom/server');
      const React = await import('react');
      const { Hero } = await import('./components/Hero.tsx');

      const customUrl = 'https://res.cloudinary.com/axdoro/hero-campaign.webp';
      const html = renderToString(
        React.createElement(Hero, {
          heroImageUrl: customUrl,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // On initial render before load/ready, image is not revealed and obsolete image is never rendered
      expect(html).not.toContain('opacity-100');
      expect(html).not.toContain('src="/hero-bg.jpg"');
    });

    it('3. reveals custom image with opacity-100 once preloaded', () => {
      const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
      const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

      expect(heroContent).toContain('new Image()');
      expect(heroContent).toContain("if ('decode' in img)");
      expect(heroContent).toContain("isLoaded ? 'opacity-100' : 'opacity-0'");
      expect(heroContent).toContain('transition-opacity duration-500');
    });

    it('4. uses /hero-bg.jpg when resolved setting is null (default fallback)', () => {
      const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
      const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

      expect(heroContent).toContain("heroImageUrl !== undefined ? (heroImageUrl || '/hero-bg.jpg') : null");
    });

    it('5. resolves failed settings requests to default image via setHeroImageUrl(null)', () => {
      const appFilePath = path.join(clientDir, 'App.tsx');
      const appContent = fs.readFileSync(appFilePath, 'utf-8');

      // The catch block sets heroImageUrl to null on error
      expect(appContent).toContain('setHeroImageUrl(null);');
    });

    it('6. recovers safely to /hero-bg.jpg on custom image load failure without leaving hero broken', () => {
      const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
      const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

      expect(heroContent).toContain("setImageSrc('/hero-bg.jpg');");
      expect(heroContent).toContain("onError={() => setImageSrc('/hero-bg.jpg')}");
    });

    it('7. guards against rapid URL changes and cancels stale image completions', () => {
      const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
      const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

      expect(heroContent).toContain('latestTargetRef.current !== targetSrc');
      expect(heroContent).toContain('isCancelled = true');
    });

    it('8. confirms image-only hero layout omits headlines and CTAs', () => {
      const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
      const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

      expect(heroContent).not.toContain('AXDORO &ndash; Clothing Made for Every Occasion');
      expect(heroContent).not.toContain('Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.');
      expect(heroContent).not.toContain('Explore Collection');
      expect(heroContent).not.toContain('Enquire for Bulk Orders');
      expect(heroContent).not.toContain('140 GSM Combed Cotton');
      expect(heroContent).not.toContain('Oxford &amp; Linen Tailored Weaves');
    });
  });
});
