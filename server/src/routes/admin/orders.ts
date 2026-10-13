import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { orderStatusUpdateSchema } from '../../schemas/orders.js';
import { listOrders, getOrderById, updateOrderStatus } from '../../services/order.service.js';

export const adminOrdersRouter = Router();

adminOrdersRouter.use(requireAdmin);

// GET /api/admin/orders - List orders with pagination & filters
adminOrdersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const status = req.query.status as string | undefined;
    const paymentStatus = req.query.paymentStatus as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await listOrders({ page, limit, status, paymentStatus, search });

    res.json({
      status: 'success',
      data: result.orders,
      orders: result.orders,
      pagination: {
        page,
        limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/orders/:id - Get order details by ID
adminOrdersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) {
      res.status(404).json({
        status: 'error',
        error: 'Order not found',
        message: 'Order not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: order,
      order,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orders/:id/status - Update order status with validation and rollback
adminOrdersRouter.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = orderStatusUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid status update: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid status update',
        errors: parseResult.error.errors,
      });
      return;
    }

    const updatedOrder = await updateOrderStatus(req.params.id, parseResult.data, req.admin!);

    res.json({
      status: 'success',
      message: `Order status updated to ${parseResult.data.status}`,
      data: updatedOrder,
      order: updatedOrder,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Invalid order status transition') || msg.includes('Order not found')) {
      res.status(400).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    next(err);
  }
});
