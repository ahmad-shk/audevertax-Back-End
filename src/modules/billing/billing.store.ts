import { randomUUID } from 'node:crypto';
import { JsonStore } from '../../core/json-store.js';
import type { BillingOrder } from './billing.types.js';

const store = new JsonStore<BillingOrder>('billing-orders.json');

export async function findOrder(applicationId: string, userId: string) {
  const orders = await store.all();
  return orders.find(
    (order) => order.applicationId === applicationId && order.userId === userId,
  ) ?? null;
}

export async function createOrder(input: Omit<BillingOrder, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const order: BillingOrder = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
  return store.insert(order);
}

export async function updateOrder(id: string, changes: Partial<BillingOrder>) {
  return store.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}
