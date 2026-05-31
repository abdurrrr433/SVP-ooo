import { describe, it, expect } from "vitest";
import {
  getCenterBySiteId,
  getCenterByTestCenterId,
  getRealTestCenterNameById,
  getCentersByCity,
  searchCenters,
} from "./real-test-centers";

describe("real-test-centers lookup", () => {
  it("finds a known center by site_id", () => {
    const center = getCenterBySiteId(54);
    expect(center).toBeDefined();
    expect(center?.name).toBe("Rajshahi Technical Training Centre");
  });

  it("finds a known center by test_center_id", () => {
    const center = getCenterByTestCenterId(115);
    expect(center).toBeDefined();
    expect(center?.city).toBe("Dhaka");
  });

  it("returns the correct name via getRealTestCenterNameById", () => {
    expect(getRealTestCenterNameById(17)).toBe("Bangladesh Korea TTC Dhaka");
    expect(getRealTestCenterNameById("71")).toBe("Sylhet Technical Training Center");
  });

  it("returns centers by city and supports search", () => {
    const dhaka = getCentersByCity("Dhaka");
    expect(dhaka.length).toBeGreaterThan(0);
    expect(searchCenters("Gazipur")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "BRTC Central Training Institute Gazipur" }),
      ])
    );
  });

  it("returns undefined for unknown ids", () => {
    expect(getRealTestCenterNameById(9999)).toBeUndefined();
  });
});
