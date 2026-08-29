export const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "UAH",
  "PLN",
  "CHF",
  "CAD",
  "AUD",
  "JPY",
] as const;

export const UNIT_GROUPS = [
  { label: "Length", units: ["mm", "cm", "m", "km", "in", "ft", "yd", "mile"] },
  { label: "Mass", units: ["mg", "g", "kg", "lb", "oz"] },
  {
    label: "Time",
    units: ["s", "min", "hour", "day", "week", "month", "year"],
  },
  { label: "Area", units: ["m2", "km2", "ha"] },
  { label: "Volume", units: ["ml", "L", "m3"] },
] as const;

export const UNITS = UNIT_GROUPS.flatMap(({ units }) => [...units]);

/**
 * The currencies a picker offers. A stored currency the list does not carry
 * comes first, so opening the picker cannot silently rewrite it.
 */
export function currencyChoices(current?: string): string[] {
  const stored = current?.trim().toUpperCase();
  return stored && !(CURRENCIES as readonly string[]).includes(stored)
    ? [stored, ...CURRENCIES]
    : [...CURRENCIES];
}

/** True for a unit the picker does not carry, which a stored block may hold. */
export function isKnownUnit(unit: string): boolean {
  return (UNITS as readonly string[]).includes(unit);
}
