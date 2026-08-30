import { getApplication, markApplicationPaid } from '../applications/application.service.js';
import { createOrder, findOrder, updateOrder } from './billing.store.js';
import { calculateBillingPricing } from './billing.pricing.js';

// Serialize payment transitions per application inside this backend process.
// The persisted order/application statuses remain the source of truth across restarts.
const paymentLocks = new Map<string, Promise<void>>();

async function withPaymentLock<T>(applicationId: string, operation: () => Promise<T>): Promise<T> {
  const previous = paymentLocks.get(applicationId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  paymentLocks.set(applicationId, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (paymentLocks.get(applicationId) === current) paymentLocks.delete(applicationId);
  }
}

export async function getBilling(userId: string, applicationId: string) {
  const application = await getApplication(userId, applicationId);
  if (!application) return null;
  return (await findOrder(applicationId, userId)) ?? null;
}

export async function createBillingOrder(userId: string, applicationId: string) {
  const application = await getApplication(userId, applicationId);
  if (!application) return null;

  if (application.status !== 'ready_for_payment') return null;

  const existing = await findOrder(applicationId, userId);
  if (existing) return existing;

  const pricing = calculateBillingPricing(application.serviceSlug, application.packageSlug);
  if (!pricing) return null;

  return createOrder({
    applicationId,
    userId,
    lineItems: pricing.lineItems,
    subtotal: pricing.subtotal,
    total: pricing.total,
    currency: pricing.currency,
    status: 'pending',
  });
}

export async function markPaymentPaid(userId: string, applicationId: string) {
  return withPaymentLock(applicationId, async () => {
    const application = await getApplication(userId, applicationId);
    if (!application) return null;

    const order = await findOrder(applicationId, userId);
    if (!order) return null;

    // A paid order or application is terminal for the customer payment flow.
    if (order.status === 'paid' || application.status === 'paid') return null;
    if (application.status !== 'ready_for_payment' || order.status !== 'pending') return null;

    // Persist the order transition first, then persist the application transition.
    // If the application transition fails, roll the order back to pending.
    const paidOrder = await updateOrder(order.id, { status: 'paid' });
    if (!paidOrder) return null;

    try {
      const paidApplication = await markApplicationPaid(userId, applicationId);
      if (!paidApplication) {
        await updateOrder(order.id, { status: 'pending' });
        return null;
      }
      return paidOrder;
    } catch {
      await updateOrder(order.id, { status: 'pending' });
      return null;
    }
  });
}
