import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  pickArray,
  normalizeOccupation,
  normalizeDateValue,
  normalizeAvailableDateEntries,
  buildCityOptions,
  buildDateOptions,
  buildCenterOptions,
  getSessionId,
  getSessionSiteCity,
  getCenterKey,
  getSessionSiteId,
  getSessionTestCenterId,
} from "@/lib/booking-utils";

/**
 * TEST CENTER AVAILABLE NEW
 *
 * Flow:
 *   Occupation  →  City  →  Available Date  →  Test Center  →  Exam Session ID
 *
 * All data is fetched live from the real SVP API via the svp-proxy edge function:
 *   - /occupations
 *   - /available-dates           (filtered by category_id)
 *   - /exam-sessions             (filtered by category_id + city + exam_date)
 *   - /test-centers/:id          (real name fallback)
 *   - /exam-sessions/:id         (detail fallback)
 */
export default function TestCenterAvailablePage() {
  const [occupations, setOccupations] = useState<any[]>([]);
  const [occupationId, setOccupationId] = useState("");
  const [dateEntries, setDateEntries] = useState<{ city: string; date: string }[]>([]);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [centerNameMap, setCenterNameMap] = useState<Map<string, string>>(new Map());
  const [centerKey, setCenterKey] = useState("");
  const [sessionId, setSessionId] = useState("");

  const [loadingOcc, setLoadingOcc] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState("");

  const selectedOccupation = useMemo(
    () => occupations.find((o) => String(o.id) === String(occupationId)) || null,
    [occupations, occupationId]
  );
  const categoryId = selectedOccupation?.categoryId || "";

  const cityOptions = useMemo(() => buildCityOptions(dateEntries), [dateEntries]);
  const dateOptions = useMemo(() => buildDateOptions(dateEntries, city), [dateEntries, city]);

  const cityFiltered = useMemo(
    () =>
      city
        ? sessions.filter(
            (s) =>
              String(getSessionSiteCity(s)).trim().toLowerCase() ===
              city.trim().toLowerCase()
          )
        : sessions,
    [sessions, city]
  );
  const centerOptions = useMemo(() => {
    const opts = buildCenterOptions(cityFiltered);
    return opts.map((o) => ({ ...o, name: centerNameMap.get(o.siteId) || o.name }));
  }, [cityFiltered, centerNameMap]);

  const sessionOptions = useMemo(
    () =>
      centerKey
        ? cityFiltered.filter((s) => getCenterKey(s) === String(centerKey))
        : cityFiltered,
    [cityFiltered, centerKey]
  );

  // 1. Load occupations
  useEffect(() => {
    (async () => {
      setLoadingOcc(true);
      setError("");
      try {
        const all: any[] = [];
        for (let page = 1; page <= 50; page++) {
          const data = await api(`/occupations?locale=en&per_page=200&page=${page}`);
          const arr = pickArray(data);
          if (!arr.length) break;
          all.push(...arr);
          if (arr.length < 200) break;
        }
        const seen = new Set<string>();
        const unique = all.filter((it) => {
          const k = String(it?.id ?? "");
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setOccupations(unique.map(normalizeOccupation));
      } catch (err: any) {
        setError(err?.message || "Failed to load occupations");
      } finally {
        setLoadingOcc(false);
      }
    })();
  }, []);

  // 2. Load available dates when occupation changes
  useEffect(() => {
    let active = true;
    (async () => {
      setCity("");
      setDate("");
      setDateEntries([]);
      setSessions([]);
      setCenterKey("");
      setSessionId("");
      if (!occupationId || !categoryId) return;
      setLoadingDates(true);
      setError("");
      try {
        const params = new URLSearchParams({
          per_page: "1000",
          category_id: String(categoryId),
          start_at_date_from: normalizeDateValue(new Date().toISOString()),
          available_seats: "greater_than::0",
          status: "scheduled",
          locale: "en",
        });
        const data = await api(`/available-dates?${params.toString()}`);
        if (!active) return;
        const entries = normalizeAvailableDateEntries(pickArray(data));
        setDateEntries(entries);
        const cities = buildCityOptions(entries);
        setCity(cities[0] || "");
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Failed to load available dates");
      } finally {
        if (active) setLoadingDates(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [occupationId, categoryId]);

  // Auto-select first date when city changes
  useEffect(() => {
    setDate((prev) => (prev && dateOptions.includes(prev) ? prev : dateOptions[0] || ""));
  }, [dateOptions]);

  // 3. Load exam sessions when city + date selected
  useEffect(() => {
    let active = true;
    (async () => {
      setSessions([]);
      setCenterKey("");
      setSessionId("");
      if (!city || !date || !categoryId) return;
      setLoadingSessions(true);
      setError("");
      try {
        const params = new URLSearchParams({
          category_id: String(categoryId),
          city: String(city),
          exam_date: date,
          locale: "en",
        });
        const data = await api(`/exam-sessions?${params.toString()}`);
        if (!active) return;
        setSessions(pickArray(data));
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Failed to load exam sessions");
      } finally {
        if (active) setLoadingSessions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [city, date, categoryId]);

  // 4. Resolve real test center names via SVP /test-centers/:id then local DB
  useEffect(() => {
    if (!sessions.length) return;
    let active = true;
    (async () => {
      const map = new Map(centerNameMap);
      let changed = false;

      const needName = sessions.filter((s: any) => {
        const k = String(getCenterKey(s));
        if (!k || map.has(k)) return false;
        return !s?.test_center?.name && !s?.test_center_name;
      });

      const tcIds = Array.from(
        new Set(
          needName
            .map((s: any) => getSessionTestCenterId(s))
            .filter(Boolean)
        )
      );

      await Promise.all(
        tcIds.map(async (tcid) => {
          try {
            const detail: any = await api(`/test-centers/${encodeURIComponent(tcid)}?locale=en`);
            const tc = detail?.test_center || detail?.data?.test_center || detail?.data || detail;
            const name = tc?.name || tc?.test_center_name;
            if (!name) return;
            sessions.forEach((s: any) => {
              const sid = getSessionTestCenterId(s);
              if (sid !== tcid) return;
              const key = String(getCenterKey({ ...s, test_center: { ...s.test_center, ...tc } }));
              if (key && !map.has(key)) {
                map.set(key, name);
                changed = true;
              }
            });
          } catch {
            /* ignore */
          }
        })
      );

      // Local DB fallback
      const dbMissing = Array.from(
        new Set(
          sessions
            .map((s: any) => ({
              key: String(getCenterKey(s)),
              sid: Number(getSessionSiteId(s)),
            }))
            .filter((x) => x.key && !map.has(x.key) && Number.isFinite(x.sid) && x.sid > 0)
            .map((x) => x.sid)
        )
      );
      if (dbMissing.length) {
        const { data } = await supabase
          .from("test_centers")
          .select("site_id, name")
          .in("site_id", dbMissing);
        data?.forEach((row: any) => {
          sessions.forEach((s: any) => {
            if (Number(getSessionSiteId(s)) === Number(row.site_id)) {
              const key = String(getCenterKey(s));
              if (key && !map.has(key)) {
                map.set(key, row.name);
                changed = true;
              }
            }
          });
        });
      }

      if (active && changed) setCenterNameMap(map);
    })();
    return () => {
      active = false;
    };
  }, [sessions]);

  // Auto-select first center
  useEffect(() => {
    if (!centerOptions.length) {
      setCenterKey("");
      return;
    }
    const has = centerOptions.some((o) => String(o.siteId) === String(centerKey));
    if (!centerKey || !has) setCenterKey(String(centerOptions[0].siteId));
  }, [centerOptions, centerKey]);

  // Auto-select first session
  useEffect(() => {
    if (!sessionOptions.length) {
      setSessionId("");
      return;
    }
    const has = sessionOptions.some((s) => String(getSessionId(s)) === String(sessionId));
    if (!sessionId || !has) setSessionId(String(getSessionId(sessionOptions[0])));
  }, [sessionOptions, sessionId]);

  const selectedCenter = centerOptions.find((o) => String(o.siteId) === String(centerKey));
  const selectedSession = sessionOptions.find(
    (s) => String(getSessionId(s)) === String(sessionId)
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">TEST CENTER AVAILABLE NEW</h1>
          <p className="text-sm text-muted-foreground">
            Pick an occupation, then drill down to a real exam session — live from SVP.
          </p>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          {/* 1. Occupation */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              1. Occupation {loadingOcc && <span className="text-muted-foreground">(loading…)</span>}
            </label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={occupationId}
              onChange={(e) => setOccupationId(e.target.value)}
              disabled={loadingOcc}
            >
              <option value="">Select occupation</option>
              {occupations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. City */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              2. City {loadingDates && <span className="text-muted-foreground">(loading…)</span>}
            </label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!occupationId || loadingDates || !cityOptions.length}
            >
              <option value="">Select city</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">3. Available Date</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={!city || !dateOptions.length}
            >
              <option value="">Select date</option>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Test Center */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              4. Test Center{" "}
              {loadingSessions && <span className="text-muted-foreground">(loading…)</span>}
            </label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={centerKey}
              onChange={(e) => setCenterKey(e.target.value)}
              disabled={!date || loadingSessions || !centerOptions.length}
            >
              <option value="">Select test center</option>
              {centerOptions.map((o) => (
                <option key={o.siteId} value={o.siteId}>
                  {o.name} {o.city ? `— ${o.city}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Exam Session ID */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">5. Exam Session</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={!centerKey || !sessionOptions.length}
            >
              <option value="">Select session</option>
              {sessionOptions.map((s) => {
                const id = getSessionId(s);
                const name =
                  centerNameMap.get(String(getCenterKey(s))) ||
                  s?.test_center?.name ||
                  s?.test_center_name ||
                  "Center";
                const time = s?.test_time || s?.start_at_time || "";
                return (
                  <option key={id} value={id}>
                    #{id} — {name} {time && `• ${time}`}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Summary */}
        {selectedSession && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">Selected</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Occupation</dt>
              <dd className="text-foreground">{selectedOccupation?.name}</dd>
              <dt className="text-muted-foreground">City</dt>
              <dd className="text-foreground">{city}</dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="text-foreground">{date}</dd>
              <dt className="text-muted-foreground">Test Center</dt>
              <dd className="text-foreground">{selectedCenter?.name}</dd>
              <dt className="text-muted-foreground">Test Center ID</dt>
              <dd className="text-foreground">{getSessionTestCenterId(selectedSession) || getSessionSiteId(selectedSession) || "—"}</dd>
              <dt className="text-muted-foreground">Exam Session ID</dt>
              <dd className="font-semibold text-foreground">{sessionId}</dd>
            </dl>
            <Link
              to={`/exam/booking?occupationId=${occupationId}&categoryId=${categoryId}&siteCity=${encodeURIComponent(
                city
              )}&siteId=${centerKey}&examDate=${date}`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Continue to booking
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
