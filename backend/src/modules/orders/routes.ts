import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireAnyPermission, requirePermission } from '../../middleware/auth.js'
import { checkoutLimiter } from '../../middleware/rateLimit.js'
import {
  addOrderNote,
  assignOrder,
  cancelOrder,
  completeOrderDelivery,
  confirmOrder,
  confirmOrderPickup,
  createOrderGroup,
  failOrderDelivery,
  getOrderById,
  listOrders,
  orderSummary,
  recordPayment,
  rejectOrder,
  startOrderCourse,
  updateOrderStatus,
} from './service.js'
import {
  assignSchema,
  cancelOrderSchema,
  checkoutSchema,
  confirmOrderSchema,
  deliveryOutcomeSchema,
  noteSchema,
  orderListQuerySchema,
  paymentSchema,
  pickupSchema,
  statusUpdateSchema,
} from './schemas.js'

export const ordersRouter = Router()

ordersRouter.post(
  '/',
  checkoutLimiter,
  validate({ body: checkoutSchema }),
  asyncHandler(async (req, res) => {
    const result = await createOrderGroup(req.body, req.ip, req.get('user-agent') ?? undefined)
    res.status(201).json({
      data: {
        groupRef: result.publicRef,
        customer: {
          name: result.customerName,
          phone: result.customerPhone,
          whatsapp: result.customerWhatsapp,
          email: result.customerEmail,
        },
        orders: result.orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          trackingCode: order.trackingCode,
          categoryType: order.categoryType,
          status: order.status,
          fulfillmentMode: order.fulfillmentMode,
          requiresTechnician: order.requiresTechnician,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          total: order.total,
          items: order.items,
        })),
      },
    })
  }),
)

ordersRouter.use(requireAuth)

ordersRouter.get(
  '/',
  requireAnyPermission('orders:read', 'orders:read:own'),
  validate({ query: orderListQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof orderListQuerySchema>
    const result = await listOrders(query, req.user!)
    res.json({
      data: result.data.map((order) => ({
        ...order,
        remainingDue: Math.max(0, order.total - order.paidAmount),
      })),
      pagination: result.pagination,
    })
  }),
)

ordersRouter.get(
  '/:id',
  requireAnyPermission('orders:read', 'orders:read:own'),
  asyncHandler(async (req, res) => {
    const order = await getOrderById(req.params.id, req.user!)
    res.json({ data: orderSummary(order, req.user!) })
  }),
)

ordersRouter.post(
  '/:id/confirm',
  requirePermission('orders:confirm'),
  validate({ body: confirmOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await confirmOrder(
      req.params.id,
      req.body.comment,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/cancel',
  requirePermission('orders:confirm'),
  validate({ body: cancelOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await cancelOrder(
      req.params.id,
      req.body.reason,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/reject',
  requirePermission('orders:confirm'),
  validate({ body: cancelOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await rejectOrder(
      req.params.id,
      req.body.reason,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.patch(
  '/:id/status',
  requirePermission('orders:status'),
  validate({ body: statusUpdateSchema }),
  asyncHandler(async (req, res) => {
    const order = await updateOrderStatus(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/start',
  requirePermission('orders:update:own'),
  validate({ body: confirmOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await startOrderCourse(
      req.params.id,
      req.body.comment,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/deliver',
  requirePermission('orders:update:own'),
  validate({ body: deliveryOutcomeSchema }),
  asyncHandler(async (req, res) => {
    const order = await completeOrderDelivery(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/fail',
  requirePermission('orders:update:own'),
  validate({ body: deliveryOutcomeSchema }),
  asyncHandler(async (req, res) => {
    const order = await failOrderDelivery(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/pickup',
  requirePermission('orders:pickup'),
  validate({ body: pickupSchema }),
  asyncHandler(async (req, res) => {
    const order = await confirmOrderPickup(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.json({ data: order })
  }),
)

ordersRouter.post(
  '/:id/assign',
  requirePermission('orders:assign'),
  validate({ body: assignSchema }),
  asyncHandler(async (req, res) => {
    const assignment = await assignOrder(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.status(201).json({ data: assignment })
  }),
)

ordersRouter.post(
  '/:id/notes',
  requirePermission('orders:note'),
  validate({ body: noteSchema }),
  asyncHandler(async (req, res) => {
    const note = await addOrderNote(
      req.params.id,
      req.body.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.status(201).json({ data: note })
  }),
)

ordersRouter.post(
  '/:id/payments',
  requireAnyPermission('payments:record', 'orders:update:own'),
  validate({ body: paymentSchema }),
  asyncHandler(async (req, res) => {
    const result = await recordPayment(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get('user-agent') ?? undefined,
    )
    res.status(201).json({ data: result })
  }),
)
