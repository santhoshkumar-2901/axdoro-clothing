import { fileURLToPath } from 'url';
import path from 'path';
import {
  resetAdminPassword,
  ALLOWED_RESET_ADMIN_EMAILS,
  AllowedResetAdminEmail,
} from '../services/admin-auth.service.js';
import { env, isLocalDatabase, isRemoteDatabase } from '../config/env.js';
import { validateRuntimeDbTarget } from '../config/db.js';
import { promptHidden, promptText } from './provision-admin.js';

/**
 * Validates the database target for administrator password reset.
 * Strictly local-only. Requires axdoro_dev in development, rejects remote databases.
 */
export function validateResetTarget(targetUrl: string, nodeEnv: string = env.NODE_ENV): void {
  if (!targetUrl) {
    throw new Error('STRICT LOCAL ISOLATION ERROR: No database connection URL provided for password reset.');
  }

  if (!isLocalDatabase(targetUrl) || isRemoteDatabase(targetUrl)) {
    throw new Error(
      'STRICT LOCAL ISOLATION ABORT: Admin password reset script is strictly forbidden from running against remote databases.'
    );
  }

  try {
    const parsed = new URL(targetUrl);
    const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
    if (nodeEnv !== 'test' && dbName !== 'axdoro_dev') {
      throw new Error(
        `LOCAL TARGET SAFETY GUARD: Admin password reset must target strictly 'axdoro_dev', got '${dbName}'. Operation aborted.`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('LOCAL TARGET SAFETY GUARD')) {
      throw err;
    }
    throw new Error(`Failed to validate database URL: ${String(err)}`);
  }

  validateRuntimeDbTarget(targetUrl, nodeEnv);
}

/**
 * Main administrative password reset runner.
 */
export async function run(): Promise<void> {
  const targetUrl = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  validateResetTarget(targetUrl);

  // Parse command line arguments
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.substring(2).split('=');
      if (key) {
        argMap[key] = rest.join('=');
      }
    }
  }

  let selectedEmail: string | undefined = argMap.email;

  // Path A: Interactive selection in a TTY terminal
  if (!selectedEmail && process.stdin.isTTY) {
    console.log('\n=== AXDORO Administrator Password Reset Utility ===');
    console.log('Strictly authorized local administrator accounts:');
    ALLOWED_RESET_ADMIN_EMAILS.forEach((email, idx) => {
      console.log(`  ${idx + 1}) ${email}`);
    });
    console.log('');

    const choice = await promptText('Select account number (1 or 2) or enter exact email: ');
    if (choice === '1') {
      selectedEmail = ALLOWED_RESET_ADMIN_EMAILS[0];
    } else if (choice === '2') {
      selectedEmail = ALLOWED_RESET_ADMIN_EMAILS[1];
    } else if (ALLOWED_RESET_ADMIN_EMAILS.includes(choice.trim().toLowerCase() as AllowedResetAdminEmail)) {
      selectedEmail = choice.trim().toLowerCase();
    } else {
      throw new Error(
        `Invalid account selection. Must be 1, 2, or one of: ${ALLOWED_RESET_ADMIN_EMAILS.join(', ')}.`
      );
    }
  }

  if (!selectedEmail) {
    throw new Error(
      `No administrator email provided. Specify --email="<email>" where email is one of: ${ALLOWED_RESET_ADMIN_EMAILS.join(', ')}.`
    );
  }

  const normalizedEmail = selectedEmail.trim().toLowerCase();
  if (!ALLOWED_RESET_ADMIN_EMAILS.includes(normalizedEmail as AllowedResetAdminEmail)) {
    throw new Error(
      `Target email "${normalizedEmail}" is not an authorized administrator account. Allowed accounts: ${ALLOWED_RESET_ADMIN_EMAILS.join(', ')}.`
    );
  }

  let newPassword = argMap.password;
  if (!newPassword) {
    newPassword = await promptHidden(`Enter new password for ${normalizedEmail} (min 12 chars): `);
    const confirmPassword = await promptHidden(`Confirm new password: `);
    if (newPassword !== confirmPassword) {
      throw new Error('Password confirmation does not match. Password reset aborted.');
    }
  }

  console.log(`[Admin Password Reset] Applying secure password reset for: ${normalizedEmail}...`);
  const result = await resetAdminPassword({
    email: normalizedEmail,
    newPassword,
  });

  console.log(`[Admin Password Reset] Password successfully updated for: ${result.adminEmail}`);
  console.log(`[Admin Password Reset] Revoked ${result.sessionsRevoked} existing session(s).`);
  console.log(`[Admin Password Reset] Immutable audit event recorded: ADMIN_PASSWORD_RESET.`);
  console.log(`[Admin Password Reset] Completed successfully.`);
}

// Execute only when directly run from CLI
const isDirectExecution =
  process.argv[1] &&
  (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) ||
    process.argv[1].endsWith('reset-admin-password.ts') ||
    process.argv[1].endsWith('reset-admin-password.js'));

if (isDirectExecution) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Admin Password Reset Error]', err.message);
      process.exit(1);
    });
}
