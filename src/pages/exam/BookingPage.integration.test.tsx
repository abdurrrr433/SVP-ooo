import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------

// Mock the api layer used by BookingPage. Routes are dispatched by URL.
const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: any[]) => apiMock(...args),
  getSession: () => ({ accessToken: "test-token" }),
  getBackendUrl: () => "http://localhost",
}));

// Mock supabase client (test_centers DB fallback). Return empty so the test
// can prove the name was resolved via the /exam-sessions/:id detail fetch
// (i.e. purely from API, not the DB fallback).
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
    // eslint-disable-next-line no-console
    console.log("[api]", path);

    // Keep occupations fetch pending forever — we drive selection via URL
    // params (occupationId + categoryId). This avoids the race where the
    // occupation-selected effect wipes selectedCity right after the
    // /available-dates response sets it.
    if (path.startsWith("/occupations")) {
      return new Promise(() => {});
    }

    // Balance lookup
    if (path.startsWith("/user-balance")) {
      return { reservation_credits: 0, free_certificates_total: 0 };
    }

    // Available dates: one entry matching our city + date
    if (path.startsWith("/available-dates")) {
      return {
        data: [
          { date: "2026-05-20", city: "Rajshahi" },
        ],
      };
    }

    // Exam sessions list: nested test_center with ONLY id/test_center_id
    // (no name) — simulates the SVP list endpoint that omits the real name.
    if (path.startsWith("/exam-sessions?")) {
      return {
        exam_sessions: [
          {
            id: TARGET_EXAM_SESSION_ID,
            available_seats: 14,
            test_center: {
              id: TARGET_TEST_CENTER_ID,
              test_center_id: TARGET_TEST_CENTER_ID,
            },
            site_city: "Rajshahi",
          },
        ],
      };
    }

    // Session detail: this is where the real test_center.name comes from.
    if (path.startsWith(`/exam-sessions/${TARGET_EXAM_SESSION_ID}`)) {
      return {
        exam_session: {
          id: TARGET_EXAM_SESSION_ID,
          available_seats: 14,
          test_center: {
            id: TARGET_TEST_CENTER_ID,
            test_center_id: TARGET_TEST_CENTER_ID,
            name: TARGET_NAME,
            city: "Rajshahi",
          },
        },
      };
    }

    return { data: [] };
  });
}

describe("BookingPage integration: resolves test center name from exam_session_id when only test_center_id is provided", () => {
  beforeEach(() => {
    apiMock.mockReset();
    installApiRoutes();
  });

  it("renders the real test center name for the session via /exam-sessions/:id detail fetch", async () => {
    render(
      <MemoryRouter
        initialEntries={[`/exam/booking?occupationId=7&categoryId=99`]}
      >
        <BookingPage />
      </MemoryRouter>
    );

    // The booking flow should naturally drive:
    //   /available-dates -> sets city + date
    //   /exam-sessions   -> returns sessions with only test_center_id
    //   /exam-sessions/:id -> resolves the real test_center.name
    await waitFor(
      () => {
        const calls = apiMock.mock.calls.map(([p]: any[]) => String(p));
        if (
          !calls.some((p) => p.startsWith(`/exam-sessions/${TARGET_EXAM_SESSION_ID}`))
        ) {
          throw new Error("detail not fetched yet. calls=" + JSON.stringify(calls));
        }
      },
      { timeout: 8000, interval: 50 }
    );

    // The Test Center select must now show the resolved name (not the
    // synthesized "Rajshahi (#54)" fallback). Enumerate selects and find
    // the one whose options include the real name.
    await waitFor(() => {
      const selects = Array.from(
        document.querySelectorAll("select")
      ) as HTMLSelectElement[];
      const matched = selects.find((sel) =>
        Array.from(sel.options).some((o) => o.text.includes(TARGET_NAME))
      );
      expect(matched, "expected a <select> containing the real test center name").toBeTruthy();
      // And the site id (#54) is correctly bound in that option.
      const opt = Array.from(matched!.options).find((o) =>
        o.text.includes(TARGET_NAME)
      )!;
      expect(opt.text).toContain(`#${TARGET_TEST_CENTER_ID}`);
    });

    // The Exam Session select should also pick up the resolved name for our id.
    await waitFor(() => {
      const selects = Array.from(
        document.querySelectorAll("select")
      ) as HTMLSelectElement[];
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
