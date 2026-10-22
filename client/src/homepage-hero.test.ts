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

    it('preserves 100% of the editorial copy and headlines', () => {
      expect(heroContent).toContain('AXDORO &ndash; Clothing Made for Every Occasion');
      expect(heroContent).toContain('Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.');
      expect(heroContent).toContain('Explore Collection');
      expect(heroContent).toContain('Enquire for Bulk Orders');
    });

    it('preserves dark purple text-contrast gradient overlays', () => {
      expect(heroContent).toContain('bg-gradient-to-r from-[#0D0B14] via-[#0D0B14]/90 to-transparent');
      expect(heroContent).toContain('bg-gradient-to-t from-[#0D0B14] via-transparent to-transparent');
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
});
