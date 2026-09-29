// Money in integer paise (risk register §2.4). The DB stores numeric and the
// API speaks rupees with 2 decimals; every sum or comparison goes through
// paise so 0.1 + 0.2 is exactly 0.3 and "fully paid" is an exact compare.

// Rupees -> paise, rounding half away from zero at 2 decimals. toPrecision(15)
// strips binary noise first: 1.005 * 100 is 100.49999999999999, really 100.5.
export function toPaise(rupees: number): number {
  const paise = Math.abs(rupees) * 100;
  return Math.sign(rupees) * Math.round(Number(paise.toPrecision(15)));
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function sumPaise(rupees: readonly number[]): number {
  return rupees.reduce((sum, value) => sum + toPaise(value), 0);
}

// Rupee rounding to 2 decimals (e.g. quantity x rate).
export function roundRupees(rupees: number): number {
  return fromPaise(toPaise(rupees));
}
