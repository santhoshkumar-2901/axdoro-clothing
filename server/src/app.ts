import express, { Express, Request, Response } from 'express';
import { setupSecurityMiddleware } from './middleware/security.js';
import { generalApiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { categoriesRouter } from './routes/categories.js';
import { productsRouter } from './routes/products.js';
import { adminAuthRouter } from './routes/admin/auth.js';
import { adminProductsRouter } from './routes/admin/products.js';
import { adminCategoriesRouter } from './routes/admin/categories.js';
import { adminInventoryRouter } from './routes/admin/inventory.js';
import { adminMetricsRouter } from './routes/admin/metrics.js';
import { adminAuditLogsRouter } from './routes/admin/audit-logs.js';
import { ordersRouter } from './routes/orders.js';
import { enquiriesRouter } from './routes/enquiries.js';
import { adminOrdersRouter } from './routes/admin/orders.js';
import { adminEnquiriesRouter } from './routes/admin/enquiries.js';
import { adminCollectionsRouter } from './routes/admin/collections.js';
import { collectionsRouter } from './routes/collections.js';
import { adminNotificationsRouter } from './routes/admin/notifications.js';
import { homepageRouter } from './routes/homepage.js';
import { adminHomepageRouter } from './routes/admin/homepage.js';
import { paymentSettingsRouter } from './routes/payment-settings.js';
import { adminPaymentSettingsRouter } from './routes/admin/payment-settings.js';
import { adminMaintenanceRouter } from './routes/admin/maintenance.js';
import { csrfProtection } from './middleware/csrf.js';

export function createApp(): Express {
  const app = express();

  // 0. Trust first reverse proxy hop (Vercel edge proxy)
  app.set('trust proxy', 1);

  // 1. Security Headers, CORS, and Payload Limits
  setupSecurityMiddleware(app);

  // 2. Global Rate Limiter
  app.use(generalApiLimiter);

  // 3. Public Routes
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/collections', collectionsRouter);
  app.use('/api/catalogue/categories', categoriesRouter);
  app.use('/api/catalogue/products', productsRouter);
  app.use('/api/catalogue/collections', collectionsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/enquiries', enquiriesRouter);
  app.use('/api/homepage', homepageRouter);
  app.use('/api/payment-settings', paymentSettingsRouter);

  // 4. Admin Protected Routes with CSRF Protection
  app.use('/api/admin', csrfProtection);
  app.use('/api/admin/auth', adminAuthRouter);
  app.use('/api/admin/products', adminProductsRouter);
  app.use('/api/admin/categories', adminCategoriesRouter);
  app.use('/api/admin/collections', adminCollectionsRouter);
  app.use('/api/admin/homepage', adminHomepageRouter);
  app.use('/api/admin/payment-settings', adminPaymentSettingsRouter);
  app.use('/api/admin/inventory', adminInventoryRouter);
  app.use('/api/admin/metrics', adminMetricsRouter);
  app.use('/api/admin/audit-logs', adminAuditLogsRouter);
  app.use('/api/admin/orders', adminOrdersRouter);
  app.use('/api/admin/enquiries', adminEnquiriesRouter);
  app.use('/api/admin/notifications', adminNotificationsRouter);
  app.use('/api/admin/maintenance', adminMaintenanceRouter);

  // 4. Fallback for unhandled 404 routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // 5. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
