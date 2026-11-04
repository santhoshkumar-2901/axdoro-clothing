import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Responsive Hero Images & Focal Positioning Verification', () => {
  const clientDir = path.resolve(__dirname);
  const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
  const heroContent = fs.readFileSync(heroFilePath, 'utf-8');
  const collectionViewPath = path.join(clientDir, 'components', 'admin', 'CollectionManagementView.tsx');
  const viewContent = fs.readFileSync(collectionViewPath, 'utf-8');

  describe('1. Frontend Hero.tsx Responsive Contract & Proportions', () => {
    it('preserves the responsive proportions with extended mobile portrait hero', () => {
      expect(heroContent).toContain("isMarqueeVisible");
      expect(heroContent).toContain("'h-[600px] sm:h-[580px] md:h-[660px] lg:h-[720px] max-h-[850px]'");
      expect(heroContent).toContain('h-[30%] min-h-0');
      expect(heroContent).toContain("isMarqueeVisible ? 'h-[70%] flex-1' : 'h-full'");
    });

    it('uses non-distorting object-fit: cover for the hero image', () => {
      expect(heroContent).toContain('className={`w-full h-full object-cover transition-opacity duration-500');
    });

    it('computes 2D objectPosition combining horizontal (imagePositionX) and vertical (imagePosition)', () => {
      expect(heroContent).toContain('objectPosition: `${currentSlide?.imagePositionX ?? 50}% ${currentSlide?.imagePosition ?? 50}%`');
    });

    it('maps imagePositionX with 50% default fallback in effectiveSlides', () => {
      expect(heroContent).toContain('imagePositionX: s.imagePositionX ?? 50');
      expect(heroContent).toContain('imagePositionX: 50');
    });
  });

  describe('2. Admin CollectionManagementView Responsive Preview & Focal Controls', () => {
    it('implements Desktop, Tablet, and Mobile preview controls in Admin Hero Settings', () => {
      expect(viewContent).toContain("onClick={() => setPreviewDevice('desktop')}");
      expect(viewContent).toContain("onClick={() => setPreviewDevice('tablet')}");
      expect(viewContent).toContain("onClick={() => setPreviewDevice('mobile')}");
    });

    it('matches frontend responsive proportions in the preview simulator frame', () => {
      // Desktop proportion: 1280px / 504px (~2.54:1)
      expect(viewContent).toContain("previewDevice === 'desktop'");
      expect(viewContent).toContain("aspect-[1280/504]");

      // Tablet proportion: 768px / 462px (~1.66:1)
      expect(viewContent).toContain("previewDevice === 'tablet'");
      expect(viewContent).toContain("aspect-[768/462]");

      // Mobile proportion: 375px / 456px (~0.82:1)
      expect(viewContent).toContain("aspect-[375/456]");
    });

    it('provides Horizontal Alignment (X-Axis) presets and fine-tuning slider', () => {
      expect(viewContent).toContain('Horizontal Alignment (X-Axis)');
      expect(viewContent).toContain("handleSetSlidePosition(activeSlide.id, 'x', 0)");
      expect(viewContent).toContain("handleSetSlidePosition(activeSlide.id, 'x', 50)");
      expect(viewContent).toContain("handleSetSlidePosition(activeSlide.id, 'x', 100)");
      expect(viewContent).toContain("aria-label=\"Slide horizontal alignment position\"");
    });

    it('provides Vertical Alignment (Y-Axis) presets and fine-tuning slider', () => {
      expect(viewContent).toContain('Vertical Alignment (Y-Axis)');
      expect(viewContent).toContain("handleSetSlidePosition(activeSlide.id, 'y', 0)");
      expect(viewContent).toContain("handleSetSlidePosition(activeSlide.id, 'y', 50)");
      expect(viewContent).toContain("handleSetSlidePosition(activeSlide.id, 'y', 100)");
      expect(viewContent).toContain("aria-label=\"Slide vertical alignment position\"");
    });

    it('displays live 2D focal coordinates indicator', () => {
      expect(viewContent).toContain('Focal Point: X: {activeSlide.imagePositionX ?? 50}%, Y: {activeSlide.imagePosition ?? 50}%');
    });

    it('updates imagePositionX in modal live preview', () => {
      expect(viewContent).toContain('objectPosition: `${heroSlides.find((s) => s.id === editingModalSlideId)?.imagePositionX ?? 50}% ${heroSlides.find((s) => s.id === editingModalSlideId)?.imagePosition ?? 50}%`');
    });
  });
});
