import { describe, expect, it } from "vitest";
import { formatMAD } from "./format";

describe("formatMAD", () => {
  it("formats a representative range of numeric inputs", () => {
    const cases: Array<number | string | null | undefined> = [
      0,
      1,
      0.1,
      0.5,
      0.99,
      1.005, // banker's rounding edge
      9.999, // rounds up to 10.00
      12.34,
      100,
      999.9,
      1_000,
      1_234.56,
      12_345.67,
      999_999.99,
      1_000_000,
      1_234_567.89,
      -1,
      -1_234.5,
      "0",
      "1234.5",
      "1234.567",
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    const output = Object.fromEntries(
      cases.map((c) => [String(c), formatMAD(c as number | string | null | undefined)]),
    );

    expect(output).toMatchSnapshot();
  });

  it("always appends the MAD suffix", () => {
    expect(formatMAD(0)).toMatch(/ MAD$/);
    expect(formatMAD(1234.56)).toMatch(/ MAD$/);
  });

  it("uses comma thousands separators and dot decimals", () => {
    expect(formatMAD(1234567.89)).toBe("1,234,567.89 MAD");
  });

  it("always renders exactly two fraction digits", () => {
    expect(formatMAD(1)).toBe("1.00 MAD");
    expect(formatMAD(1.5)).toBe("1.50 MAD");
    expect(formatMAD(1.234)).toBe("1.23 MAD");
  });

  it("falls back to 0.00 for non-finite or missing values", () => {
    expect(formatMAD(null)).toBe("0.00 MAD");
    expect(formatMAD(undefined)).toBe("0.00 MAD");
    expect(formatMAD(Number.NaN)).toBe("0.00 MAD");
    expect(formatMAD(Number.POSITIVE_INFINITY)).toBe("0.00 MAD");
  });
});
