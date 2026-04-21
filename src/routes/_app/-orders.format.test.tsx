import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { formatMAD } from "@/lib/format";

/**
 * Snapshot tests for every MAD-displaying cell on the Orders surfaces:
 *   - Distributor /orders page: order total + line "qty × unit" + line subtotal.
 *   - Admin order detail (/admin/orders/$orderId): "السعر الأساسي" (base RRP),
 *     "سعر الوحدة" (discounted unit), "إجمالي السطر", and the totals block
 *     "المجموع قبل الخصم" / "إجمالي الخصم" / "إجمالي طلب الموزع".
 *
 * As with dashboard.format.test.tsx, we render the same JSX patterns in
 * isolation rather than mounting the full route — the goal is to lock the
 * MAD output, not the data-fetching layer.
 */

describe("Orders page MAD fields (distributor)", () => {
  it("renders the order header total + line breakdown", () => {
    const orders = [
      {
        id: "o1",
        order_number: "ORD-100",
        total_mad: 1234.56,
        items: [
          { id: "i1", name: "منتج أ", qty: 2, unit_price_mad: 49.9 },
          { id: "i2", name: "منتج ب", qty: 5, unit_price_mad: 199.99 },
        ],
      },
      {
        id: "o2",
        order_number: "ORD-101",
        total_mad: 0,
        items: [{ id: "i3", name: "منتج ج", qty: 1, unit_price_mad: 0 }],
      },
      {
        id: "o3",
        order_number: "ORD-102",
        total_mad: 89_999.99,
        items: [{ id: "i4", name: "منتج د", qty: 100, unit_price_mad: 899.9999 }],
      },
    ];

    const tree = render(
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id}>
            <p className="font-bold">{formatMAD(o.total_mad)}</p>
            <div className="divide-y">
              {o.items.map((it) => (
                <div key={it.id} className="flex justify-between p-3">
                  <p className="text-xs text-muted-foreground">
                    {it.qty} × {formatMAD(it.unit_price_mad)}
                  </p>
                  <p className="text-sm font-semibold">
                    {formatMAD(Number(it.unit_price_mad) * it.qty)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>,
    ).asFragment();

    expect(tree).toMatchSnapshot();
  });
});

describe("Order detail MAD totals (admin)", () => {
  it("renders subtotal, discount, and distributor total for various tiers", () => {
    const cases = [
      // [subtotalBeforeDiscount, distributorTotal, tierPct]
      [1000, 1000, 0],
      [1000, 800, 20],
      [12_345.67, 9_876.54, 20],
      [50_000, 35_000, 30],
      [0, 0, 0],
    ] as const;

    const trees = cases.map(([subtotal, total, tierPct]) => {
      const totalDiscount = subtotal - total;
      return render(
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>المجموع قبل الخصم</span>
            <span>{formatMAD(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>إجمالي الخصم {tierPct > 0 ? `(${tierPct}%)` : ""}</span>
            <span className="text-success">−{formatMAD(totalDiscount)}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="font-semibold">إجمالي طلب الموزع</span>
            <span className="text-xl font-bold text-primary">{formatMAD(total)}</span>
          </div>
        </div>,
      ).asFragment();
    });

    expect(trees).toMatchSnapshot();
  });

  it("renders line rows: base (RRP) struck-through, discounted unit, and line total", () => {
    const lines = [
      { id: "l1", base: 100, unit: 80, qty: 3 },
      { id: "l2", base: 1234.56, unit: 987.65, qty: 1 },
      { id: "l3", base: 0, unit: 0, qty: 1 },
      { id: "l4", base: 999_999.99, unit: 799_999.99, qty: 2 },
    ];

    const tree = render(
      <table>
        <tbody>
          {lines.map((it) => {
            const lineTotal = Number(it.unit) * it.qty;
            return (
              <tr key={it.id}>
                <td className="text-center">{it.qty}</td>
                <td className="line-through text-muted-foreground">
                  {formatMAD(it.base)}
                </td>
                <td className="font-medium">{formatMAD(it.unit)}</td>
                <td className="font-semibold">{formatMAD(lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>,
    ).asFragment();

    expect(tree).toMatchSnapshot();
  });
});
