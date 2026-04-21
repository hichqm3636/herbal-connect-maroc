import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { formatMAD } from "@/lib/format";

/**
 * Snapshot tests covering the MAD-displaying subtrees that appear on the
 * Dashboard route (`src/routes/_app/dashboard.tsx`).
 *
 * The dashboard component itself is tightly coupled to Supabase, the auth
 * context, the TanStack Router runtime, and recharts — booting all of that
 * inside vitest would be brittle. Instead, we render the same presentational
 * pieces the dashboard uses (`StatCard`) plus an inline fixture that mirrors
 * the JSX patterns used for:
 *   - the "مبيعات الشهر" stat card  (StatCard value)
 *   - the "إيرادات آخر 30 يوماً" subtitle total
 *   - the "آخر الطلبات" amount column
 *
 * If anyone changes how MAD numbers are rendered on the Dashboard (e.g.
 * drops the suffix, switches locale, or rounds differently), these snapshots
 * will fail loudly.
 */

describe("Dashboard MAD formatting", () => {
  it("renders the monthly-sales StatCard with formatMAD output", () => {
    const cases = [0, 1234.5, 12_345.67, 1_234_567.89];
    const trees = cases.map((amount) =>
      render(
        <StatCard
          label="مبيعات الشهر"
          value={formatMAD(amount)}
          icon={Wallet}
          accent="primary"
          hint="إجمالي مبيعاتك خلال الشهر الجاري"
        />,
      ).asFragment(),
    );
    expect(trees).toMatchSnapshot();
  });

  it("renders the chart-header total subtitle with formatMAD output", () => {
    const cases = [0, 999.9, 25_000, 1_500_000.5];
    const trees = cases.map((total30d) =>
      render(
        <p className="text-xs text-muted-foreground mt-1">
          المجموع:{" "}
          <span className="font-semibold text-foreground">{formatMAD(total30d)}</span>
        </p>,
      ).asFragment(),
    );
    expect(trees).toMatchSnapshot();
  });

  it("renders the recent-orders amount cells with formatMAD output", () => {
    const orders = [
      { id: "1", order_number: "ORD-001", total_mad: 0 },
      { id: "2", order_number: "ORD-002", total_mad: 49.9 },
      { id: "3", order_number: "ORD-003", total_mad: 1234.56 },
      { id: "4", order_number: "ORD-004", total_mad: 89_999.99 },
    ];
    const tree = render(
      <div className="divide-y">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between py-3">
            <p className="text-sm font-medium">{o.order_number}</p>
            <span className="font-semibold text-sm">{formatMAD(o.total_mad)}</span>
          </div>
        ))}
      </div>,
    ).asFragment();
    expect(tree).toMatchSnapshot();
  });
});
