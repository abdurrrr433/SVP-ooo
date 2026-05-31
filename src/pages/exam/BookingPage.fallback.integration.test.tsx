import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: any[]) => apiMock(...args),
  getSession: () => ({ accessToken: "test-token" }),
  getBackendUrl: () => "http://localhost",
}));

// Local DB returns nothing — forces use of the synthetic fallback label.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
  },
}));

import BookingPage from "./BookingPage";

const SESSION_ID = 9999001;
const SITE_ID = 1555224;

describe("BookingPage: fallback when /exam-sessions/:id has no test_center name", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/occupations")) return new Promise(() => {});
      if (path.startsWith("/user-balance")) return { reservation_credits: 0, free_certificates_total: 0 };
      if (path.startsWith("/available-dates")) return { data: [{ date: "2026-05-20", city: "Dhaka" }] };
      if (path.startsWith("/exam-sessions?")) {
        return {
          exam_sessions: [
            {
              id: SESSION_ID,
              available_seats: 5,
              site_id: SITE_ID,
              site_city: "Dhaka",
              // no test_center.name, no test_center_id
              test_center: { site_id: SITE_ID },
            },
          ],
        };
      }
      // /exam-sessions/:id detail returns NO test_center name
      if (path.startsWith(`/exam-sessions/${SESSION_ID}`)) {
        return { exam_session: { id: SESSION_ID, test_center: { site_id: SITE_ID } } };
      }
      // /test-centers/:id also returns nothing usable
      if (path.startsWith("/test-centers/")) return { test_center: {} };
      return { data: [] };
    });
  });

  it("renders the synthetic 'Dhaka (Site #<id>)' fallback in the test center dropdown", async () => {
    render(
      <MemoryRouter initialEntries={[`/exam/booking?occupationId=7&categoryId=99`]}>
        <BookingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
      const tc = selects.find((sel) =>
        Array.from(sel.options).some((o) => o.text.includes(`Site #${SITE_ID}`))
      );
      expect(tc, "expected test center select with synthetic Site # label").toBeTruthy();
      const opt = Array.from(tc!.options).find((o) => o.text.includes(`Site #${SITE_ID}`))!;
      // Synthetic label format: "Dhaka (Site #<id>)" wrapped as "<name> (Site #<id>)"
      expect(opt.text).toMatch(/Dhaka.*Site #1555224/);
    }, { timeout: 8000, interval: 50 });
  }, 15000);
});

describe("BookingPage: fallback when /exam-sessions returns null site_id", () => {
  const NULL_SITE_SESSION_ID = 9999002;
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/occupations")) return new Promise(() => {});
      if (path.startsWith("/user-balance")) return { reservation_credits: 0, free_certificates_total: 0 };
      if (path.startsWith("/available-dates")) return { data: [{ date: "2026-05-20", city: "Dhaka" }] };
      if (path.startsWith("/exam-sessions?")) {
        return {
          exam_sessions: [
            {
              id: NULL_SITE_SESSION_ID,
              available_seats: 5,
              site_id: null,
              site_city: "Dhaka",
              test_center: { city: "Dhaka", site_id: null, test_center_id: 123 },
            },
          ],
        };
      }
      if (path.startsWith(`/exam-sessions/${NULL_SITE_SESSION_ID}`)) {
        return {
          exam_session: {
            id: NULL_SITE_SESSION_ID,
            test_center: { city: "Dhaka", site_id: null, test_center_id: 123, test_center_name: "Dhaka Skills Center" },
          },
        };
      }
      if (path.startsWith("/test-centers/")) return { test_center: {} };
      return { data: [] };
    });
  });

  it("resolves the center name from /exam-sessions/:id detail when site_id is null", async () => {
    render(
      <MemoryRouter initialEntries={[`/exam/booking?occupationId=7&categoryId=99`]}>
        <BookingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
      const tc = selects.find((sel) =>
        Array.from(sel.options).some((o) => o.text.includes("Dhaka Skills Center"))
      );
      expect(tc, "expected test center select option with resolved center name").toBeTruthy();
    }, { timeout: 8000, interval: 50 });
  }, 15000);
});
