import { query, pool } from '../config/db.js';
import { createAuditLog } from './audit-log.service.js';
import { deleteCloudinaryAsset } from './cloudinary.service.js';

export interface HomepageHeroSetting {
  imageUrl: string | null;
  publicId: string | null;
  updatedAt?: string;
}

export async function getHomepageHeroSetting(): Promise<HomepageHeroSetting> {
  try {
    const res = await query<{ value: HomepageHeroSetting; updated_at: Date }>(
      `SELECT value, updated_at FROM site_settings WHERE key = 'homepage_hero';`
    );

    if (res.rows.length === 0) {
      return { imageUrl: null, publicId: null };
    }

    const { value, updated_at } = res.rows[0];
    return {
      imageUrl: value?.imageUrl || null,
      publicId: value?.publicId || null,
      updatedAt: updated_at ? updated_at.toISOString() : undefined,
    };
  } catch (err: unknown) {
    // If table doesn't exist yet or connection issue, fail safely with default
    console.warn(
      '[SiteSettings] Failed to fetch homepage_hero setting:',
      err instanceof Error ? err.message : String(err)
    );
    return { imageUrl: null, publicId: null };
  }
}

export async function updateHomepageHeroSetting(params: {
  imageUrl?: string | null;
  publicId?: string | null;
  adminId: string;
  adminEmail: string;
  ipAddress?: string | null;
}): Promise<HomepageHeroSetting> {
  const { imageUrl = null, publicId = null, adminId, adminEmail, ipAddress = null } = params;

  // Normalization: if imageUrl is null or empty, publicId must also be null
  const finalImageUrl = imageUrl && imageUrl.trim() !== '' ? imageUrl.trim() : null;
  const finalPublicId = finalImageUrl ? (publicId && publicId.trim() !== '' ? publicId.trim() : null) : null;

  const client = await pool.connect();
  let previousPublicId: string | null = null;

  try {
    await client.query('BEGIN');

    // 1. Fetch previous setting for safe asset cleanup
    const prevRes = await client.query<{ value: HomepageHeroSetting }>(
      `SELECT value FROM site_settings WHERE key = 'homepage_hero' FOR UPDATE;`
    );
    if (prevRes.rows.length > 0 && prevRes.rows[0].value) {
      previousPublicId = prevRes.rows[0].value.publicId || null;
    }

    const newValue: HomepageHeroSetting = {
      imageUrl: finalImageUrl,
      publicId: finalPublicId,
    };

    // 2. Upsert site_settings
    const upsertRes = await client.query<{ value: HomepageHeroSetting; updated_at: Date }>(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('homepage_hero', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
       RETURNING value, updated_at;`,
      [JSON.stringify(newValue)]
    );

    // 3. Write immutable audit log
    await createAuditLog({
      adminId,
      adminEmail,
      action: 'HOMEPAGE_HERO_UPDATE',
      entityType: 'site_settings',
      entityId: 'homepage_hero',
      details: {
        previous: prevRes.rows[0]?.value || null,
        new: newValue,
      },
      ipAddress,
      client,
    });

    await client.query('COMMIT');

    const row = upsertRes.rows[0];
    const result: HomepageHeroSetting = {
      imageUrl: row.value.imageUrl || null,
      publicId: row.value.publicId || null,
      updatedAt: row.updated_at.toISOString(),
    };

    // 4. Safe post-commit Cloudinary asset cleanup
    if (previousPublicId && previousPublicId !== finalPublicId) {
      deleteCloudinaryAsset(previousPublicId).catch((cleanupErr) => {
        console.warn(
          `[SiteSettings] Post-commit cleanup failed for previous hero asset '${previousPublicId}':`,
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
