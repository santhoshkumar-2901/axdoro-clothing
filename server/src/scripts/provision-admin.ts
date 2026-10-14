import { fileURLToPath } from 'url';
import path from 'path';
import readline from 'readline';
import {
  provisionAdmin,
  getActiveAdminCount,
} from '../services/admin-auth.service.js';
import {
  env,
  isLocalDatabase,
  isRemoteDatabase,
  isPooledNeonUrl,
  assertSecureTlsParameters,
} from '../config/env.js';
import { validateRuntimeDbTarget } from '../config/db.js';

/**
 * Validates the database target for administrator provisioning.
 * Permits local development databases or explicitly authorized remote development databases.
 * Strictly rejects production mode, test mode, pooled endpoints, and unauthorized remote databases.
 */
export function validateProvisioningTarget(
  targetUrl: string,
  nodeEnv: string = env.NODE_ENV,
  allowRemoteDev: boolean = env.ALLOW_REMOTE_DEV_DB
): void {
  if (!targetUrl || typeof targetUrl !== 'string' || targetUrl.trim() === '') {
    throw new Error('STRICT LOCAL ISOLATION ERROR: No database connection URL provided for provisioning.');
  }

  // Validate TLS parameters and reject insecure or malformed connection strings
  assertSecureTlsParameters(targetUrl);

  // 1. Unconditionally reject production environment
  if (nodeEnv === 'production') {
    throw new Error(
      'PRODUCTION SAFETY GUARD: Administrator provisioning script cannot and will not be executed in production environment.'
    );
  }

  // 2. Unconditionally reject test environment
  if (nodeEnv === 'test') {
    throw new Error(
      'TEST ISOLATION GUARD: Administrator provisioning script cannot be executed in test mode.'
    );
  }

  const isRemote = isRemoteDatabase(targetUrl);

  // 3. Forbid provisioning remote database without explicit opt-in in development
  if (isRemote && !allowRemoteDev) {
    throw new Error(
      'STRICT LOCAL ISOLATION ABORT: Admin provisioning script targeting a remote database requires explicit ALLOW_REMOTE_DEV_DB=true in development.'
    );
  }

  // 4. Reject pooled endpoints (PgBouncer)
  if (isPooledNeonUrl(targetUrl)) {
    throw new Error(
      'UNSUPPORTED POOLED ENDPOINT: Admin provisioning operations cannot be executed against pooled connection endpoints (-pooler). ' +
        'Please configure MIGRATION_DATABASE_URL to use the Direct (non-pooled) Neon connection endpoint.'
    );
  }

  // 5. Require secure TLS parameters for remote targets
  if (isRemote) {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
      const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
      const ssl = parsed.searchParams.get('ssl')?.toLowerCase();
      const hasTls =
        sslMode === 'require' ||
        sslMode === 'verify-full' ||
        sslMode === 'verify-ca' ||
        ssl === 'true' ||
        ssl === '1';
      if (!hasTls) {
        throw new Error(
          'INSECURE TLS CONFIGURATION REJECTED: Remote database connection must explicitly enforce verified TLS (e.g. sslmode=require or sslmode=verify-full).'
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('INSECURE TLS')) {
        throw err;
      }
      // Malformed URLs are already caught by assertSecureTlsParameters
    }
  }

  // 6. Delegate to runtime target validation for consistent baseline safeguards
  validateRuntimeDbTarget(targetUrl, nodeEnv, allowRemoteDev);
}

/**
 * Prompts user for sensitive input (such as passwords) without echoing plaintext to the console.
 */
export async function promptHidden(promptText: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(promptText, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }

  return new Promise((resolve) => {
    process.stdout.write(promptText);
    let input = '';

    const onData = (buf: Buffer) => {
      const str = buf.toString('utf-8');
      for (const char of str) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(input.trim());
          return;
        } else if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(1);
        } else if (char === '\b' || char === '\x7f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += char;
        }
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

/**
 * Prompts user for standard textual input (such as email or name).
 */
export async function promptText(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

/**
 * Main administrative provisioning runner.
 * Strictly local-only, capped at exactly two administrator accounts.
 */
export async function run(): Promise<void> {
  const targetUrl = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  validateProvisioningTarget(targetUrl, env.NODE_ENV, env.ALLOW_REMOTE_DEV_DB);

  const activeCount = await getActiveAdminCount();
  if (activeCount >= 2) {
    console.log(
      `[Admin Provision] Maximum limit reached: 2 active administrator accounts already exist in the database.`
    );
    console.log('[Admin Provision] No additional administrator accounts can be provisioned.');
    return;
  }

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

  // Path A: Provisioning a single account via CLI flags
  if (argMap.email && argMap.name) {
    let password = argMap.password;
    if (!password) {
      password = await promptHidden(`Enter password for ${argMap.email} (min 12 chars): `);
    }
    console.log(`[Admin Provision] Provisioning admin account for: ${argMap.email}...`);
    const admin = await provisionAdmin({
      email: argMap.email,
      password,
      fullName: argMap.name,
    });
    console.log(`[Admin Provision] Successfully provisioned administrator: ${admin.email} (ID: ${admin.id})`);
    const newCount = await getActiveAdminCount();
    console.log(`[Admin Provision] Active administrators: ${newCount} of 2.`);
    return;
  }

  // Path B: Batch provisioning from environment variables
  const hasEnvBatch =
    Boolean(process.env.ADMIN1_EMAIL) &&
    Boolean(process.env.ADMIN1_NAME) &&
    Boolean(process.env.ADMIN1_PASSWORD) &&
    Boolean(process.env.ADMIN2_EMAIL) &&
    Boolean(process.env.ADMIN2_NAME) &&
    Boolean(process.env.ADMIN2_PASSWORD);

  if (hasEnvBatch) {
    console.log('[Admin Provision] Provisioning administrator accounts from environment configuration...');

    const admin1 = await provisionAdmin({
      email: process.env.ADMIN1_EMAIL!,
      fullName: process.env.ADMIN1_NAME!,
      password: process.env.ADMIN1_PASSWORD!,
    });
    console.log(`[Admin Provision] Account 1 provisioned: ${admin1.email} (${admin1.fullName})`);

    const admin2 = await provisionAdmin({
      email: process.env.ADMIN2_EMAIL!,
      fullName: process.env.ADMIN2_NAME!,
      password: process.env.ADMIN2_PASSWORD!,
    });
    console.log(`[Admin Provision] Account 2 provisioned: ${admin2.email} (${admin2.fullName})`);

    console.log('[Admin Provision] Both authorized administrator accounts are provisioned and active (2 of 2).');
    return;
  }

  // Path C: Interactive TTY prompt if executed in a terminal without flags or env vars
  if (process.stdin.isTTY) {
    console.log('=== AXDORO Administrator Provisioning Setup ===');
    console.log(`Current active administrators: ${activeCount} of 2.\n`);

    const needed = 2 - activeCount;
    for (let i = 1; i <= needed; i++) {
      console.log(`--- Provisioning Administrator ${activeCount + i} of 2 ---`);
      const email = await promptText(`Enter administrator email: `);
      const name = await promptText(`Enter administrator full name: `);
      const password = await promptHidden(`Enter password (min 12 characters): `);

      const admin = await provisionAdmin({
        email,
        fullName: name,
        password,
      });
      console.log(`Successfully provisioned: ${admin.email} (ID: ${admin.id})\n`);
    }

    const finalCount = await getActiveAdminCount();
    console.log(`[Admin Provision] Finished. Active administrators: ${finalCount} of 2.`);
    return;
  }

  // Path D: Fail fast in non-interactive environment with missing credentials
  throw new Error(
    'Missing administrator credentials. To provision administrator accounts, provide either:\n' +
      '  1. Environment variables: ADMIN1_EMAIL, ADMIN1_NAME, ADMIN1_PASSWORD, ADMIN2_EMAIL, ADMIN2_NAME, ADMIN2_PASSWORD\n' +
      '  2. CLI flags: --email="<email>" --name="<name>" [--password="<password>"]\n' +
      '  3. Or run interactively in a TTY terminal to be prompted securely.'
  );
}

// Execute only when directly run from CLI, never when imported as a module in tests
const isDirectExecution =
  process.argv[1] &&
  (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) ||
    process.argv[1].endsWith('provision-admin.ts') ||
    process.argv[1].endsWith('provision-admin.js'));

if (isDirectExecution) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Admin Provision Error]', err.message);
      process.exit(1);
    });
}
