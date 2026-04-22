import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the supabase client BEFORE importing the module under test.
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import {
  fetchCompanyActivityCounts,
  bumpCountsVersion,
  _clearActivityCountsCache,
} from "./activityLog";

const COMPANY = "00000000-0000-0000-0000-000000000001";

describe("fetchCompanyActivityCounts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    _clearActivityCountsCache();
  });

  it("maps RPC rows into a counts object with `all` total", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { entity_type: "order", count: 5 },
        { entity_type: "product", count: 3 },
        { entity_type: "invoice", count: "2" }, // bigint may arrive as string
      ],
      error: null,
    });
    const result = await fetchCompanyActivityCounts(COMPANY);
    expect(result.order).toBe(5);
    expect(result.product).toBe(3);
    expect(result.invoice).toBe(2);
    expect(result.all).toBe(10);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("activity_counts", {
      p_company_id: COMPANY,
    });
  });

  it("returns cached data on second call within TTL (no extra RPC)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ entity_type: "order", count: 1 }],
      error: null,
    });
    const first = await fetchCompanyActivityCounts(COMPANY);
    const second = await fetchCompanyActivityCounts(COMPANY);
    expect(second).toEqual(first);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cache entry has expired (>30s)", async () => {
    vi.useFakeTimers();
    try {
      rpcMock
        .mockResolvedValueOnce({
          data: [{ entity_type: "order", count: 1 }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ entity_type: "order", count: 7 }],
          error: null,
        });
      const first = await fetchCompanyActivityCounts(COMPANY);
      expect(first.order).toBe(1);

      // Advance past the 30s TTL.
      vi.setSystemTime(new Date(Date.now() + 31_000));

      const second = await fetchCompanyActivityCounts(COMPANY);
      expect(second.order).toBe(7);
      expect(rpcMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-fetches after bumpCountsVersion() invalidates cache", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ entity_type: "order", count: 2 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ entity_type: "order", count: 9 }],
        error: null,
      });
    const first = await fetchCompanyActivityCounts(COMPANY);
    expect(first.order).toBe(2);
    bumpCountsVersion();
    const second = await fetchCompanyActivityCounts(COMPANY);
    expect(second.order).toBe(9);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
