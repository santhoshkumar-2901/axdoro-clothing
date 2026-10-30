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
}

export interface HomepageHeroSetting {
  slides: HeroSlide[];
  imageUrl: string | null;
  publicId: string | null;
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
  },
];

export function normalizeHomepageHeroSetting(
  storedValue: any,
  updatedAt?: Date | string
): HomepageHeroSetting {
  const defaultSlides = DEFAULT_HERO_SLIDES.map((s) => ({ ...s }));

  if (!storedValue || typeof storedValue !== 'object') {
    return {
      slides: defaultSlides,
      imageUrl: null,
      publicId: null,
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
      };
    });

    return {
      slides,
      imageUrl: slides[0]?.imageUrl || null,
      publicId: slides[0]?.publicId || null,
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
}

export async function updateHomepageHeroSetting(params: {
  slides?: HeroSlideInput[];
  imageUrl?: string | null;
  publicId?: string | null;
  adminId: string;
  adminEmail: string;
  ipAddress?: string | null;
}): Promise<HomepageHeroSetting> {
  const { slides: newSlidesInput, imageUrl = null, publicId = null, adminId, adminEmail, ipAddress = null } = params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch previous setting for row lock and audit logging
    const prevRes = await client.query<{ value: any }>(
      `SELECT value FROM site_settings WHERE key = 'homepage_hero' FOR UPDATE;`
    );
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
        };
      });
    } else {
      // Legacy update mode (updating slide 1)
      const baseSlides = previousSetting ? previousSetting.slides.map((s) => ({ ...s })) : DEFAULT_HERO_SLIDES.map((s) => ({ ...s }));
      const finalImg = imageUrl && imageUrl.trim() !== '' ? imageUrl.trim() : null;
      const finalPub = finalImg ? (publicId && publicId.trim() !== '' ? publicId.trim() : null) : null;

      baseSlides[0].imageUrl = finalImg;
      baseSlides[0].publicId = finalPub;
      finalSlides = baseSlides;
    }

    const newValue = {
      imageUrl: finalSlides[0]?.imageUrl || null,
      publicId: finalSlides[0]?.publicId || null,
      slides: finalSlides,
    };

    // 3. Upsert site_settings
    const upsertRes = await client.query<{ value: any; updated_at: Date }>(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('homepage_hero', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
       RETURNING value, updated_at;`,
      [JSON.stringify(newValue)]
    );

    // 4. Write immutable audit log
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
            }
          : prevRes.rows[0]?.value || null,
        new: {
          imageUrl: finalSlides[0]?.imageUrl || null,
          publicId: finalSlides[0]?.publicId || null,
          slides: finalSlides,
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
