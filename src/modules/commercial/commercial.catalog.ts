export type CommercialCurrency = 'USD' | 'GBP';

export type CommercialPackage = {
  slug: string;
  name: string;
  price: number;
  currency: CommercialCurrency;
};

export type CommercialAddOn = {
  slug: string;
  name: string;
  price: number;
  currency: CommercialCurrency;
};

export type CommercialJurisdiction = {
  slug: string;
  name: string;
  filingFee: number;
  currency: 'USD';
};

export type CommercialService = {
  slug: string;
  name: string;
  currency: CommercialCurrency;
  packages?: CommercialPackage[];
  addOns?: CommercialAddOn[];
  jurisdictions?: CommercialJurisdiction[];
  variants?: CommercialStandaloneVariant[];
};

export type CommercialStandaloneVariant = {
  variantSlug: string;
  name: string;
  price: number;
  currency: 'USD';
};

export const commercialCatalog: CommercialService[] = [
  {
    slug: 'usa-llc',
    name: 'USA LLC Formation',
    currency: 'USD',
    packages: [
      { slug: 'basic', name: 'Basic', price: 125, currency: 'USD' },
      { slug: 'standard', name: 'Standard', price: 174, currency: 'USD' },
      { slug: 'premium', name: 'Premium', price: 280, currency: 'USD' },
    ],
    addOns: [
      { slug: 'wise-account-setup', name: 'Wise Account Setup', price: 75, currency: 'USD' },
    ],
    jurisdictions: [
      { slug: 'wyoming', name: 'Wyoming', filingFee: 100, currency: 'USD' },
      { slug: 'new-mexico', name: 'New Mexico', filingFee: 50, currency: 'USD' },
      { slug: 'delaware', name: 'Delaware', filingFee: 110, currency: 'USD' },
      { slug: 'texas', name: 'Texas', filingFee: 300, currency: 'USD' },
      { slug: 'florida', name: 'Florida', filingFee: 125, currency: 'USD' },
    ],
  },
  {
    slug: 'itin-processing',
    name: 'ITIN',
    currency: 'USD',
    variants: [{ variantSlug: 'itin', name: 'ITIN', price: 150, currency: 'USD' }],
  },
  {
    slug: 'ein-without-ssn',
    name: 'International EIN',
    currency: 'USD',
    variants: [
      { variantSlug: 'resident', name: 'International EIN — Resident', price: 10, currency: 'USD' },
      { variantSlug: 'non-resident', name: 'International EIN — Non-Resident', price: 25, currency: 'USD' },
    ],
  },
  {
    slug: 'uk-ltd',
    name: 'UK LTD Formation',
    currency: 'GBP',
    packages: [
      { slug: 'standard', name: 'Standard', price: 99, currency: 'GBP' },
      { slug: 'complete', name: 'Complete', price: 149, currency: 'GBP' },
      { slug: 'custom', name: 'Custom', price: 0, currency: 'GBP' },
    ],
  },
];

export function getCommercialService(slug: string): CommercialService | undefined {
  return commercialCatalog.find((service) => service.slug === slug);
}
