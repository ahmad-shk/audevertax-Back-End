export type BillingStatus = 'pending' | 'paid';

export type BillingLineItem = {
  key: string;
  label: string;
  amount: number;
  currency: string;
};

export type BillingOrder = {
  id: string;
  applicationId: string;
  userId: string;
  lineItems: BillingLineItem[];
  subtotal: number;
  total: number;
  currency: string;
  status: BillingStatus;
  createdAt: string;
  updatedAt: string;
};
