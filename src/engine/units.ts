export const CURRENCIES = ["EUR", "USD", "GBP", "UAH", "PLN", "CHF", "CAD", "AUD", "JPY"] as const;

export const UNIT_GROUPS = [
  { label: "Length", units: ["mm", "cm", "m", "km", "in", "ft", "yd", "mile"] },
  { label: "Mass", units: ["mg", "g", "kg", "lb", "oz"] },
  { label: "Time", units: ["s", "min", "hour", "day", "week", "month", "year"] },
  { label: "Area", units: ["m2", "km2", "ha"] },
  { label: "Volume", units: ["ml", "L", "m3"] },
] as const;

export const UNITS = UNIT_GROUPS.flatMap(({ units }) => [...units]);
