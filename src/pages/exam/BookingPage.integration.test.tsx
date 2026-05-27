import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------

const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: any[]) => apiMock(...args),
  getSession: () => ({ accessToken: "test-token" }),
  getBackendUrl: () => "http://localhost",
}));

// DB fallback returns nothing — proves the name was resolved via the SVP
// /test-centers/:id endpoint, not the local DB.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

import BookingPage from "./BookingPage";

const TARGET_EXAM_SESSION_ID = 1456230;
const TARGET_TEST_CENTER_ID = 54;
const TARGET_NAME = "Rajshahi Technical Training Centre";

function installApiRoutes() {
  apiMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/occupations")) {
      return new Promise(() => {});
    }
    if (path.startsWith("/user-balance")) {
      return { reservation_credits: 0, free_certificates_total: 0 };
    }
    if (path.startsWith("/available-dates")) {
      return { data: [{ date: "2026-05-20", city: "Rajshahi" }] };
    }
    if (path.startsWith("/exam-sessions?")) {
      return {
        exam_sessions: [
          {
            id: TARGET_EXAM_SESSION_ID,
            available_seats: 14,
            // nested test_center provides only the id — no name
            test_center: {
              id: TARGET_TEST_CENTER_ID,
              test_center_id: TARGET_TEST_CENTER_ID,
            },
            site_city: "Rajshahi",
          },
        ],
      };
    }
    // The endpoint the booking page is expected to hit:
    //   GET /api/v1/individual_labor_space/test_centers/:id
    // (proxied as /test-centers/:id)
    if (path.startsWith(`/test-centers/${TARGET_TEST_CENTER_ID}`)) {
      return {
        test_center: {
          id: TARGET_TEST_CENTER_ID,
          test_center_id: TARGET_TEST_CENTER_ID,
          name: TARGET_NAME,
          city: "Rajshahi",
        },
      };
    }
    // If the page falls back to /exam-sessions/:id, return the same name so
    // the test still passes — but the assertion below verifies the
    // /test-centers/:id call was actually issued.
    if (path.startsWith(`/exam-sessions/${TARGET_EXAM_SESSION_ID}`)) {
      return {
        exam_session: {
          id: TARGET_EXAM_SESSION_ID,
          test_center: { id: TARGET_TEST_CENTER_ID, name: TARGET_NAME },
        },
      };
    }
    return { data: [] };
  });
}

describe("BookingPage integration: resolves name via /test-centers/:id", () => {
  beforeEach(() => {
    apiMock.mockReset();
    installApiRoutes();
  });

  it("calls /test-centers/:id and renders the resolved name for the exam session", async () => {
    render(
      <MemoryRouter initialEntries={[`/exam/booking?occupationId=7&categoryId=99`]}>
        <BookingPage />
      </MemoryRouter>
    );

    // Verify the SVP test_centers endpoint was called for our test_center_id.
    await waitFor(
      () => {
        const calls = apiMock.mock.calls.map(([p]: any[]) => String(p));
        if (!calls.some((p) => p.startsWith(`/test-centers/${TARGET_TEST_CENTER_ID}`))) {
          throw new Error("/test-centers/:id not called yet. calls=" + JSON.stringify(calls));
        }
      },
      { timeout: 8000, interval: 50 }
    );

    // Test Center <select> contains the resolved real name.
    await waitFor(() => {
      const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
      const matched = selects.find((sel) =>
        Array.from(sel.options).some((o) => o.text.includes(TARGET_NAME))
      );
      expect(matched, "expected a <select> with the resolved test center name").toBeTruthy();
      const opt = Array.from(matched!.options).find((o) => o.text.includes(TARGET_NAME))!;
      expect(opt.text).toContain(`#${TARGET_TEST_CENTER_ID}`);
    });

    // Exam Session <select> picks up the resolved name for this session id.
    await waitFor(() => {
      const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
      const sessionSelect = selects.find((sel) =>
        Array.from(sel.options).some((o) =>
          o.text.includes(`Session #${TARGET_EXAM_SESSION_ID}`)
        )
      );
      expect(sessionSelect).toBeTruthy();
      const opt = Array.from(sessionSelect!.options).find((o) =>
        o.text.includes(`Session #${TARGET_EXAM_SESSION_ID}`)
      )!;
      expect(opt.text).toContain(TARGET_NAME);
      expect(opt.text).toContain(`Site #${TARGET_TEST_CENTER_ID}`);
    });
  }, 15000);
});
