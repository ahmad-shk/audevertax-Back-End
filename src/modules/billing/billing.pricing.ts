import { getCommercialService } from '../commercial/commercial.catalog.js';

export type BillingLineItem = { key: string; label: string; quantity: number; unitAmount: number; total: number; currency: 'USD' | 'GBP' };

export function calculateBillingPricing(serviceSlug: string, packageSlug?: string, formationState?: string, addOnSlugs: string[] = [], variantSlug?: string) {
  const service = getCommercialService(serviceSlug);
  if (!service) return null;

  if (service.variants?.length) {
    const defaultVariantSlug = serviceSlug === 'ein-without-ssn' ? 'non-resident' : service.variants[0]?.variantSlug;
    const selectedVariantSlug = variantSlug ?? defaultVariantSlug;
    const selected = service.variants.find((item) => item.variantSlug === selectedVariantSlug);
    if (!selected) return null;
    const lineItem: BillingLineItem = {
      key: `service:${service.slug}:${selected.variantSlug}`,
      label: selected.name,
      quantity: 1,
      unitAmount: selected.price,
      total: selected.price,
      currency: selected.currency,
    };
    return { currency: selected.currency, lineItems: [lineItem], subtotal: selected.price, total: selected.price };
  }

  if (service.packages?.length) {
    const selected = service.packages.find((item) => item.slug === packageSlug);
    if (!selected) return null;

    const lineItems: BillingLineItem[] = [{
      key: `package:${selected.slug}`,
      label: selected.name,
      quantity: 1,
      unitAmount: selected.price,
      total: selected.price,
      currency: selected.currency,
    }];

    if (formationState) {
      const state = service.jurisdictions?.find((item) => item.slug === formationState);
      if (!state) return null;
      lineItems.push({
        key: `state-filing:${state.slug}`,
        label: `${state.name} filing fee`,
        quantity: 1,
        unitAmount: state.filingFee,
        total: state.filingFee,
        currency: state.currency,
      });
    }

    for (const slug of new Set(addOnSlugs)) {
      const addOn = service.addOns?.find((item) => item.slug === slug);
      if (!addOn) return null;
      lineItems.push({
        key: `add-on:${addOn.slug}`,
        label: addOn.name,
        quantity: 1,
        unitAmount: addOn.price,
        total: addOn.price,
        currency: addOn.currency,
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    return { currency: selected.currency, lineItems, subtotal, total: subtotal };
  }

  return null;
}
