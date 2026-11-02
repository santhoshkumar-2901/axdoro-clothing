import { query, pool } from '../config/db.js';
import { createAuditLog } from './audit-log.service.js';
import { deleteCloudinaryAsset } from './cloudinary.service.js';

export interface HeroSlide {
  id: number;
  imageUrl: string | null;
  publicId: string | null;
  heading: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  isEnabled: boolean;
  imagePosition?: number;
}

export interface HomepageHeroSetting {
  slides: HeroSlide[];
  imageUrl: string | null;
  publicId: string | null;
  isCategoryMarqueeEnabled: boolean;
  marqueeCategoryImages: Record<string, string>;
  updatedAt?: string;
}

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    id: 1,
    imageUrl: null,
    publicId: null,
    heading: 'AXDORO – Clothing Made for Every Occasion',
    subtitle: 'Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.',
    ctaLabel: 'Explore Collection',
    ctaLink: '#category-showcase',
    isEnabled: true,
    imagePosition: 50,
  },
  {
    id: 2,
    imageUrl: null,
    publicId: null,
    heading: 'Premium Everyday Essentials',
    subtitle: 'Tailored Shirts & Combed Cotton T-Shirts Engineered for Comfort.',
    ctaLabel: 'Shop T-Shirts',
    ctaLink: '/category/t-shirts',
    isEnabled: false,
    imagePosition: 50,
  },
  {
    id: 3,
    imageUrl: null,
    publicId: null,
    heading: 'Bulk Custom Manufacturing',
    subtitle: 'Custom Corporate Apparel & Direct Bulk Coordination.',
    ctaLabel: 'Enquire for Bulk',
    ctaLink: 'bulk',
    isEnabled: false,
    imagePosition: 50,
  },
];

export function normalizeHomepageHeroSetting(
  storedValue: any,
  updatedAt?: Date | string
): HomepageHeroSetting {
  const defaultSlides = DEFAULT_HERO_SLIDES.map((s) => ({ ...s }));

  const isCategoryMarqueeEnabled =
    storedValue && typeof storedValue === 'object' && typeof storedValue.isCategoryMarqueeEnabled === 'boolean'
      ? storedValue.isCategoryMarqueeEnabled
      : true;

  const rawMarqueeCategoryImages =
    storedValue && typeof storedValue === 'object' && storedValue.marqueeCategoryImages && typeof storedValue.marqueeCategoryImages === 'object' && !Array.isArray(storedValue.marqueeCategoryImages)
      ? storedValue.marqueeCategoryImages
      : {};

  const cleanMarqueeImages: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawMarqueeCategoryImages)) {
    if (typeof val === 'string' && val.trim() !== '') {
      cleanMarqueeImages[key.trim()] = val.trim();
    }
  }

  if (!storedValue || typeof storedValue !== 'object') {
    return {
      slides: defaultSlides,
      imageUrl: null,
      publicId: null,
      isCategoryMarqueeEnabled: true,
      marqueeCategoryImages: {},
      updatedAt: updatedAt ? (typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString()) : undefined,
    };
  }

  // 1. If stored as modern slides array
  if (Array.isArray(storedValue.slides)) {
    const rawSlides: any[] = storedValue.slides;
    const slides: HeroSlide[] = [1, 2, 3].map((id) => {
      const found = rawSlides.find((s) => s && s.id === id);
      const defaultSlide = defaultSlides.find((s) => s.id === id)!;
      if (!found) return defaultSlide;

      const rawImg =
        found.imageUrl && typeof found.imageUrl === 'string' && found.imageUrl.trim() !== ''
          ? found.imageUrl.trim()
          : null;
      const rawPub =
        rawImg && found.publicId && typeof found.publicId === 'string' && found.publicId.trim() !== ''
          ? found.publicId.trim()
          : null;

      return {
        id,
        imageUrl: rawImg,
        publicId: rawPub,
        heading:
          typeof found.heading === 'string' && found.heading.trim() !== ''
            ? found.heading.trim()
            : defaultSlide.heading,
        subtitle:
          typeof found.subtitle === 'string' && found.subtitle.trim() !== ''
            ? found.subtitle.trim()
            : defaultSlide.subtitle,
        ctaLabel:
          typeof found.ctaLabel === 'string' && found.ctaLabel.trim() !== ''
            ? found.ctaLabel.trim()
            : defaultSlide.ctaLabel,
        ctaLink:
          typeof found.ctaLink === 'string' && found.ctaLink.trim() !== ''
            ? found.ctaLink.trim()
            : defaultSlide.ctaLink,
        isEnabled: typeof found.isEnabled === 'boolean' ? found.isEnabled : defaultSlide.isEnabled,
        imagePosition:
          typeof found.imagePosition === 'number' && !isNaN(found.imagePosition)
            ? Math.max(0, Math.min(100, Math.round(found.imagePosition)))
            : (defaultSlide.imagePosition ?? 50),
      };
    });

    return {
      slides,
      imageUrl: slides[0]?.imageUrl || null,
      publicId: slides[0]?.publicId || null,
      isCategoryMarqueeEnabled,
      marqueeCategoryImages: cleanMarqueeImages,
      updatedAt: updatedAt ? (typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString()) : undefined,
    };
  }

  // 2. Legacy structure: { imageUrl: string | null, publicId: string | null }
  const legacyImageUrl =
    storedValue.imageUrl && typeof storedValue.imageUrl === 'string' && storedValue.imageUrl.trim() !== ''
      ? storedValue.imageUrl.trim()
      : null;
  const legacyPublicId =
    legacyImageUrl && storedValue.publicId && typeof storedValue.publicId === 'string' && storedValue.publicId.trim() !== ''
      ? storedValue.publicId.trim()
      : null;

  defaultSlides[0].imageUrl = legacyImageUrl;
  defaultSlides[0].publicId = legacyPublicId;

  return {
    slides: defaultSlides,
    imageUrl: legacyImageUrl,
    publicId: legacyPublicId,
    isCategoryMarqueeEnabled,
    marqueeCategoryImages: cleanMarqueeImages,
    updatedAt: updatedAt ? (typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString()) : undefined,
  };
}

export async function getHomepageHeroSetting(): Promise<HomepageHeroSetting> {
  try {
    const res = await query<{ value: any; updated_at: Date }>(
      `SELECT value, updated_at FROM site_settings WHERE key = 'homepage_hero';`
    );

    if (res.rows.length === 0) {
      return normalizeHomepageHeroSetting(null);
    }

    const { value, updated_at } = res.rows[0];
    return normalizeHomepageHeroSetting(value, updated_at);
  } catch (err: unknown) {
    console.warn(
      '[SiteSettings] Failed to fetch homepage_hero setting:',
      err instanceof Error ? err.message : String(err)
    );
    return normalizeHomepageHeroSetting(null);
  }
}

export interface HeroSlideInput {
  id: number;
  imageUrl?: string | null;
  publicId?: string | null;
  heading: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  isEnabled: boolean;
  imagePosition?: number | null;
}

export async function updateHomepageHeroSetting(params: {
  slides?: HeroSlideInput[];
  imageUrl?: string | null;
  publicId?: string | null;
  isCategoryMarqueeEnabled?: boolean | null;
  marqueeCategoryImages?: Record<string, string | null | undefined> | null;
  adminId: string;
  adminEmail: string;
  ipAddress?: string | null;
}): Promise<HomepageHeroSetting> {
  const {
    slides: newSlidesInput,
    imageUrl: inputImageUrl,
    publicId: inputPublicId,
    isCategoryMarqueeEnabled: newMarqueeEnabled,
    marqueeCategoryImages: newMarqueeCategoryImages,
    adminId,
    adminEmail,
    ipAddress = null,
  } = params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch previous setting for row lock, audit logging, and preserving other fields
    const prevRes = await client.query<{ value: any }>(
      `SELECT value FROM site_settings WHERE key = 'homepage_hero' FOR UPDATE;`
    );
    const prevRawValue = prevRes.rows.length > 0 && prevRes.rows[0].value && typeof prevRes.rows[0].value === 'object'
      ? prevRes.rows[0].value
      : {};
    const previousSetting = prevRes.rows.length > 0 ? normalizeHomepageHeroSetting(prevRes.rows[0].value) : null;

    // 2. Determine target slides
    let finalSlides: HeroSlide[];

    if (newSlidesInput && Array.isArray(newSlidesInput)) {
      finalSlides = [1, 2, 3].map((id) => {
        const found = newSlidesInput.find((s) => s.id === id);
        const defaultSlide = DEFAULT_HERO_SLIDES.find((s) => s.id === id)!;
        if (!found) return defaultSlide;

        const finalImg = found.imageUrl && found.imageUrl.trim() !== '' ? found.imageUrl.trim() : null;
        const finalPub = finalImg ? (found.publicId && found.publicId.trim() !== '' ? found.publicId.trim() : null) : null;

        return {
          id,
          imageUrl: finalImg,
          publicId: finalPub,
          heading: found.heading?.trim() || defaultSlide.heading,
          subtitle: found.subtitle?.trim() || defaultSlide.subtitle,
          ctaLabel: found.ctaLabel?.trim() || defaultSlide.ctaLabel,
          ctaLink: found.ctaLink?.trim() || defaultSlide.ctaLink,
          isEnabled: Boolean(found.isEnabled),
          imagePosition:
            typeof found.imagePosition === 'number' && !isNaN(found.imagePosition)
              ? Math.max(0, Math.min(100, Math.round(found.imagePosition)))
              : (defaultSlide.imagePosition ?? 50),
        };
      });
    } else {
      // Retain previous slides without overwrite
      const baseSlides = previousSetting ? previousSetting.slides.map((s) => ({ ...s })) : DEFAULT_HERO_SLIDES.map((s) => ({ ...s }));
      if (inputImageUrl !== undefined) {
        const finalImg = inputImageUrl && inputImageUrl.trim() !== '' ? inputImageUrl.trim() : null;
        const finalPub = finalImg ? (inputPublicId && inputPublicId.trim() !== '' ? inputPublicId.trim() : null) : null;
        baseSlides[0].imageUrl = finalImg;
        baseSlides[0].publicId = finalPub;
      }
      finalSlides = baseSlides;
    }

    // 3. Determine marquee enabled status (preserve previous if undefined)
    const finalMarqueeEnabled =
      typeof newMarqueeEnabled === 'boolean'
        ? newMarqueeEnabled
        : (previousSetting?.isCategoryMarqueeEnabled ?? true);

    // 4. Determine marquee images mapping (preserve previous and apply updates)
    const finalMarqueeCategoryImages: Record<string, string> = {
      ...(previousSetting?.marqueeCategoryImages || {}),
    };

    if (newMarqueeCategoryImages && typeof newMarqueeCategoryImages === 'object') {
      for (const [key, val] of Object.entries(newMarqueeCategoryImages)) {
        const trimmedKey = key.trim();
        if (!trimmedKey) continue;
        if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
          delete finalMarqueeCategoryImages[trimmedKey];
        } else if (typeof val === 'string') {
          finalMarqueeCategoryImages[trimmedKey] = val.trim();
        }
      }
    }

    // 5. Construct merged value preserving any unrelated JSONB properties
    const newValue = {
      ...prevRawValue,
      imageUrl: finalSlides[0]?.imageUrl || null,
      publicId: finalSlides[0]?.publicId || null,
      slides: finalSlides,
      isCategoryMarqueeEnabled: finalMarqueeEnabled,
      marqueeCategoryImages: finalMarqueeCategoryImages,
    };

    // 6. Upsert site_settings
    const upsertRes = await client.query<{ value: any; updated_at: Date }>(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('homepage_hero', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
       RETURNING value, updated_at;`,
      [JSON.stringify(newValue)]
    );

    // 7. Write immutable audit log
    await createAuditLog({
      adminId,
      adminEmail,
      action: 'HOMEPAGE_HERO_UPDATE',
      entityType: 'site_settings',
      entityId: 'homepage_hero',
      details: {
        previous: previousSetting
          ? {
              imageUrl: previousSetting.imageUrl,
              publicId: previousSetting.publicId,
              slides: previousSetting.slides,
              isCategoryMarqueeEnabled: previousSetting.isCategoryMarqueeEnabled,
              marqueeCategoryImages: previousSetting.marqueeCategoryImages,
            }
          : prevRes.rows[0]?.value || null,
        new: {
          imageUrl: finalSlides[0]?.imageUrl || null,
          publicId: finalSlides[0]?.publicId || null,
          slides: finalSlides,
          isCategoryMarqueeEnabled: finalMarqueeEnabled,
          marqueeCategoryImages: finalMarqueeCategoryImages,
        },
      },
      ipAddress,
      client,
    });

    await client.query('COMMIT');

    const result = normalizeHomepageHeroSetting(upsertRes.rows[0].value, upsertRes.rows[0].updated_at);

    // 5. Post-commit asset cleanup:
    // Automatic Cloudinary asset deletion on homepage hero updates is disabled
    // to preserve assets safely until reliable global cross-feature reference tracking is established.

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface PaymentQrSetting {
  imageUrl: string | null;
  publicId: string | null;
  upiId: string | null;
  updatedAt?: string;
}

export async function getPaymentQrSetting(): Promise<PaymentQrSetting> {
  try {
    const res = await query<{ value: PaymentQrSetting; updated_at: Date }>(
      `SELECT value, updated_at FROM site_settings WHERE key = 'payment_qr';`
    );

    if (res.rows.length === 0) {
      return { imageUrl: null, publicId: null, upiId: null };
    }

    const { value, updated_at } = res.rows[0];
    return {
      imageUrl: value?.imageUrl || null,
      publicId: value?.publicId || null,
      upiId: value?.upiId || null,
      updatedAt: updated_at ? updated_at.toISOString() : undefined,
    };
  } catch (err: unknown) {
    console.warn(
      '[SiteSettings] Failed to fetch payment_qr setting:',
      err instanceof Error ? err.message : String(err)
    );
    return { imageUrl: null, publicId: null, upiId: null };
  }
}

export async function updatePaymentQrSetting(params: {
  imageUrl?: string | null;
  publicId?: string | null;
  upiId?: string | null;
  adminId: string;
  adminEmail: string;
  ipAddress?: string | null;
}): Promise<PaymentQrSetting> {
  const { imageUrl = null, publicId = null, upiId = null, adminId, adminEmail, ipAddress = null } = params;

  const finalImageUrl = imageUrl && imageUrl.trim() !== '' ? imageUrl.trim() : null;
  const finalPublicId = finalImageUrl ? (publicId && publicId.trim() !== '' ? publicId.trim() : null) : null;
  const finalUpiId = upiId && upiId.trim() !== '' ? upiId.trim() : null;

  const client = await pool.connect();
  let previousPublicId: string | null = null;

  try {
    await client.query('BEGIN');

    // 1. Fetch previous setting for safe asset cleanup
    const prevRes = await client.query<{ value: PaymentQrSetting }>(
      `SELECT value FROM site_settings WHERE key = 'payment_qr' FOR UPDATE;`
    );
    if (prevRes.rows.length > 0 && prevRes.rows[0].value) {
      previousPublicId = prevRes.rows[0].value.publicId || null;
    }

    const newValue: PaymentQrSetting = {
      imageUrl: finalImageUrl,
      publicId: finalPublicId,
      upiId: finalUpiId,
    };

    // 2. Upsert site_settings
    const upsertRes = await client.query<{ value: PaymentQrSetting; updated_at: Date }>(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('payment_qr', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
       RETURNING value, updated_at;`,
      [JSON.stringify(newValue)]
    );

    // 3. Write immutable audit log
    await createAuditLog({
      adminId,
      adminEmail,
      action: 'PAYMENT_QR_UPDATE',
      entityType: 'site_settings',
      entityId: 'payment_qr',
      details: {
        previous: prevRes.rows[0]?.value || null,
        new: newValue,
      },
      ipAddress,
      client,
    });

    await client.query('COMMIT');

    const row = upsertRes.rows[0];
    const result: PaymentQrSetting = {
      imageUrl: row.value.imageUrl || null,
      publicId: row.value.publicId || null,
      upiId: row.value.upiId || null,
      updatedAt: row.updated_at.toISOString(),
    };

    // 4. Safe post-commit Cloudinary asset cleanup if an old Cloudinary asset was replaced
    if (previousPublicId && previousPublicId !== finalPublicId) {
      deleteCloudinaryAsset(previousPublicId).catch((cleanupErr) => {
        console.warn(
          `[SiteSettings] Post-commit cleanup failed for previous payment_qr asset '${previousPublicId}':`,
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        );
      });
    }

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
