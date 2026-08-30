export type BillingLineItem = {
  key: string;
  label: string;
  quantity: number;
  unitAmount: number;
  total: number;
  currency: 'USD' | 'GBP';
};

const packages = {
  'usa-llc': {
    standard: { name: 'Standard', price: 119, currency: 'USD' as const },
    advanced: { name: 'Advanced', price: 179, currency: 'USD' as const },
    custom: { name: 'Custom', price: 0, currency: 'USD' as const },
  },
  'uk-ltd': {
    standard: { name: 'Standard', price: 99, currency: 'GBP' as const },
    complete: { name: 'Complete', price: 149, currency: 'GBP' as const },
    custom: { name: 'Custom', price: 0, currency: 'GBP' as const },
  },
};

export function calculateBillingPricing(serviceSlug: string, packageSlug?: string) {
  const servicePackages = packages[serviceSlug as keyof typeof packages];
  if (!servicePackages) return null;

  // Billing is the authoritative pricing boundary. Never silently substitute
  // another package when the persisted application contains an invalid slug.
  const selectedSlug = packageSlug ?? Object.keys(servicePackages)[0];
  if (!(selectedSlug in servicePackages)) return null;

  const selected = servicePackages[selectedSlug as keyof typeof servicePackages];
  if (!selected) return null;

  const lineItem: BillingLineItem = {
    key: `package:${selectedSlug}`,
    label: selected.name,
    quantity: 1,
    unitAmount: selected.price,
    total: selected.price,
    currency: selected.currency,
  };

  return {
    currency: selected.currency,
    lineItems: [lineItem],
    subtotal: selected.price,
    total: selected.price,
  };
}
