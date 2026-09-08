import { getCommercialService } from '../commercial/commercial.catalog.js';

export type BillingCurrency = 'USD' | 'GBP';
export type BillingPackage = { slug: string; name: string; price: number; currency: BillingCurrency };
export type BillingAddOn = { slug: string; name: string; price: number; currency: BillingCurrency };
export type BillingJurisdiction = { slug: string; name: string; filingFee: number; currency: 'USD' };
export type BillingStandaloneService = { serviceSlug: string; variantSlug: string; name: string; price: number; currency: 'USD' };

const usaLlc = getCommercialService('usa-llc');
const itin = getCommercialService('itin-processing');
const internationalEin = getCommercialService('ein-without-ssn');

export const usaFormationPackages: BillingPackage[] = usaLlc?.packages ?? [];
export const usaFormationAddOns: BillingAddOn[] = usaLlc?.addOns ?? [];
export const usaFormationJurisdictions: BillingJurisdiction[] = usaLlc?.jurisdictions ?? [];

export const usaStandaloneServices: BillingStandaloneService[] = [
  ...(itin?.variants ?? []).map((variant) => ({ serviceSlug: 'itin-processing', ...variant })),
  ...(internationalEin?.variants ?? []).map((variant) => ({ serviceSlug: 'ein-without-ssn', ...variant })),
];
