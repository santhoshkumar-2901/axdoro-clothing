import crypto from 'crypto';
import { env } from '../config/env.js';

export interface CloudinaryUploadParams {
  productId?: string;
  categoryId?: string;
  hero?: boolean;
  timestamp?: number;
  folder?: string;
  publicId?: string;
}

export interface CloudinarySignedUploadConfig {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

/**
 * Checks whether all required Cloudinary credentials are configured.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  );
}

/**
 * Computes a Cloudinary request signature using the Cloudinary algorithm:
 * 1. Sort all parameters alphabetically by key.
 * 2. Join as `key=value&key2=value2`.
 * 3. Append API secret directly (no delimiter).
 * 4. Compute SHA-1 hex digest.
 */
export function signCloudinaryParameters(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  const stringToSign = `${serialized}${apiSecret}`;
  return crypto.createHash('sha1').update(stringToSign).digest('hex');
}

/**
 * Generates secure, short-lived signed upload parameters for admin client uploads.
 * Throws an error if Cloudinary credentials are not configured.
 */
export function generateUploadSignature(
  options: CloudinaryUploadParams
): CloudinarySignedUploadConfig {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary credentials are not configured on this server.');
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = env.CLOUDINARY_API_KEY!;
  const apiSecret = env.CLOUDINARY_API_SECRET!;

  const timestamp = options.timestamp || Math.floor(Date.now() / 1000);
  const targetId = options.hero
    ? 'hero'
    : options.categoryId
    ? `cat_${options.categoryId}`
    : (options.productId || 'asset');
  const defaultFolder = options.hero
    ? 'axdoro/hero'
    : options.categoryId
    ? 'axdoro/categories'
    : `axdoro/products/${options.productId || 'general'}`;
  const folder = options.folder || defaultFolder;
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const publicId = options.publicId || `${targetId}_${timestamp}_${randomSuffix}`;

  const paramsToSign: Record<string, string | number> = {
    folder,
    public_id: publicId,
    timestamp,
  };

  const signature = signCloudinaryParameters(paramsToSign, apiSecret);

  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
}

/**
 * Securely deletes an image asset from Cloudinary.
 * Fails safely: does not throw if Cloudinary is unconfigured; returns false or true.
 * Never logs credentials.
 */
export async function deleteCloudinaryAsset(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) {
    console.warn(`[Cloudinary] Cannot delete asset '${publicId}': Cloudinary credentials not configured.`);
    return false;
  }

  if (!publicId || typeof publicId !== 'string') {
    return false;
  }

  try {
    const cloudName = env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = env.CLOUDINARY_API_KEY!;
    const apiSecret = env.CLOUDINARY_API_SECRET!;
    const timestamp = Math.floor(Date.now() / 1000);

    const paramsToSign = {
      public_id: publicId,
      timestamp,
    };

    const signature = signCloudinaryParameters(paramsToSign, apiSecret);

    const formData = new URLSearchParams();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!res.ok) {
      console.error(`[Cloudinary] Failed to delete asset '${publicId}': HTTP ${res.status}`);
      return false;
    }

    const data = (await res.json()) as { result?: string };
    return data.result === 'ok' || data.result === 'not found';
  } catch (err: unknown) {
    console.error(`[Cloudinary] Error deleting asset '${publicId}':`, err instanceof Error ? err.message : String(err));
    return false;
  }
}
