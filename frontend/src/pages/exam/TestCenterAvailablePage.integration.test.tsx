import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------

const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: any[]) => apiMock(...args),
  getSession: () => ({ accessToken: "test-token" }),
  getBackendUrl: () => "http://localhost",
}));

// Local DB returns nothing — proves the name was resolved via /test-centers/:id
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

import TestCenterAvailablePage from "./TestCenterAvailablePage";

const OCC_ID = 7;
const CATEGORY_ID = 99;
const TARGET_EXAM_SESSION_ID = 1456230;
const TARGET_TEST_CENTER_ID = 54;
const TARGET_NAME = "Rajshahi Technical Training Centre";

function installApiRoutes() {
  apiMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/occupations")) {
      return {
        data: [
          { id: OCC_ID, name: "Welder", category_id: CATEGORY_ID },
        ],
      };
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
    // The endpoint the page is expected to hit:
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
    return { data: [] };
  });
}

describe("TestCenterAvailablePage integration: resolves real name via /test-centers/:id", () => {
  beforeEach(() => {
    apiMock.mockReset();
    installApiRoutes();
  });

  it("calls /test-centers/:id and shows the resolved name in the Test Center dropdown", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/exam/test-center-available"]}>
        <TestCenterAvailablePage />
      </MemoryRouter>
    );

    // 1. Wait for occupations to populate, then pick one (triggers dates → sessions).
    const occupationSelect = await waitFor(() => {
      const sel = container.querySelectorAll("select")[0] as HTMLSelectElement;
      const hasOcc = Array.from(sel.options).some((o) => o.value === String(OCC_ID));
      if (!hasOcc) throw new Error("occupations not loaded yet");
      return sel;
    }, { timeout: 5000 });

    fireEvent.change(occupationSelect, { target: { value: String(OCC_ID) } });

    // 2. Verify the SVP test_centers endpoint was called for our test_center_id.
    await waitFor(
      () => {
        const calls = apiMock.mock.calls.map(([p]: any[]) => String(p));
        if (!calls.some((p) => p.startsWith(`/test-centers/${TARGET_TEST_CENTER_ID}`))) {
          throw new Error("/test-centers/:id not called yet. calls=" + JSON.stringify(calls));
        }
      },
      { timeout: 8000, interval: 50 }
    );

    // 3. The Test Center <select> contains the resolved real name.
    await waitFor(() => {
      const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
      const matched = selects.find((sel) =>
        Array.from(sel.options).some((o) => o.text.includes(TARGET_NAME))
      );
      expect(matched, "expected a <select> option with the resolved test center name").toBeTruthy();
    }, { timeout: 5000 });
  }, 20000);
});
