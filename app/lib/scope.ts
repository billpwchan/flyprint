// A year in an address: four digits, or none.
export const parseYear = (value: string | string[] | undefined | null) => typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : null;
