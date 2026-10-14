// Only attempt local .env loading when running outside Vercel without DATABASE_URL
if (!process.env.VERCEL && !process.env.DATABASE_URL) {
  try {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: './server/.env' });
  } catch {
    // Ignore in production or environments where dotenv/server/.env is not present
  }
}

const { app } = await import('../server/dist/app.js');

export default app;
