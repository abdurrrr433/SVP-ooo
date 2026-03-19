import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getBackendUrl } from "@/lib/api";
import {
  pickArray, normalizeOccupation, normalizeAvailableDateEntries,
  buildCityOptions, buildDateOptions, buildCenterOptions, buildCalendarDays,
  getSessionId, getSessionSiteCity, getSessionCenterName, getCenterKey, getSessionSiteId,
  formatDateLabel, normalizeDateValue, toLocalIsoDate, detectBookingMode, extractId,
  type NormalizedOccupation,
} from "@/lib/booking-utils";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const DEFAULT_CATEGORY_ID = "159";

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const [occupations, setOccupations] = useState<NormalizedOccupation[]>([]);
  const [availableDateEntries, setAvailableDateEntries] = useState<{ city: string; date: string }[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedOccupationId, setSelectedOccupationId] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState("");
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID);
  const [methodology, setMethodology] = useState("in_person");
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [holdId, setHoldId] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [loadingOccupations, setLoadingOccupations] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);
  const [booking, setBooking] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedOccupation = useMemo(
    () => occupations.find((o) => String(o.id) === String(selectedOccupationId)) || null,
    [occupations, selectedOccupationId]
  );

  const cityOptions = useMemo(() => buildCityOptions(availableDateEntries), [availableDateEntries]);
  const availableDates = useMemo(() => buildDateOptions(availableDateEntries, selectedCity), [availableDateEntries, selectedCity]);
  const cityFilteredSessions = useMemo(
    () => selectedCity ? sessions.filter((s) => getSessionSiteCity(s).toLowerCase() === selectedCity.toLowerCase()) : sessions,
    [sessions, selectedCity]
  );
  const centerOptions = useMemo(() => buildCenterOptions(cityFilteredSessions), [cityFilteredSessions]);
  const filteredSessions = useMemo(
    () => selectedCenterId ? cityFilteredSessions.filter((s) => getCenterKey(s) === selectedCenterId) : cityFilteredSessions,
    [cityFilteredSessions, selectedCenterId]
  );
  const calendarBaseMonth = calendarMonth || (availableDate ? availableDate.slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  const calendarCursorDate = useMemo(() => new Date(`${calendarBaseMonth}-01T00:00:00`), [calendarBaseMonth]);
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarBaseMonth, availableDates),
    [calendarBaseMonth, availableDates]
  );
  const bookingMode = useMemo(() => detectBookingMode(balanceInfo), [balanceInfo]);

  // Load occupations on mount
  useEffect(() => {
    (async () => {
      setLoadingOccupations(true);
      try {
        const data = await api("/api/svp/occupations?locale=en&per_page=200&page=1");
        setOccupations(pickArray(data).map(normalizeOccupation));
      } catch (err: any) {
        setError(err?.message || "Failed to load occupations");
      } finally {
        setLoadingOccupations(false);
      }
    })();
  }, []);

  // Handle URL params for reschedule
  useEffect(() => {
    if (searchParams.get("occupationId")) setSelectedOccupationId(searchParams.get("occupationId")!);
    if (searchParams.get("languageCode")) setLanguageCode(searchParams.get("languageCode")!);
    if (searchParams.get("siteCity")) setSelectedCity(searchParams.get("siteCity")!);
    if (searchParams.get("siteId")) { setSelectedCenterId(searchParams.get("siteId")!); setSiteId(searchParams.get("siteId")!); }
    if (searchParams.get("examDate")) {
      const d = normalizeDateValue(searchParams.get("examDate")!);
      setAvailableDate(d);
      setCalendarMonth(d.slice(0, 7));
    }
    if (searchParams.get("reschedule") === "1") setStatus("Reschedule mode active. Follow the steps to rebook.");
  }, [searchParams]);

  // Occupation change effects
  useEffect(() => {
    if (!selectedOccupation) return;
    setCategoryId(selectedOccupation.categoryId || DEFAULT_CATEGORY_ID);
    setLanguageCode((prev) => prev || selectedOccupation.languageCodes[0]?.code || "");
    setMethodology(selectedOccupation.methodology || "in_person");
  }, [selectedOccupation]);

  // Load available dates
  useEffect(() => {
    if (!selectedOccupationId) { setAvailableDateEntries([]); return; }
    let active = true;
    (async () => {
      setLoadingDates(true);
      setError("");
      try {
        const params = new URLSearchParams({
          per_page: "1000",
          category_id: categoryId || DEFAULT_CATEGORY_ID,
          start_at_date_from: normalizeDateValue(new Date().toISOString()),
          available_seats: "greater_than::0",
          status: "scheduled",
          locale: "en",
        });
        const data = await api(`/api/svp/available-dates?${params}`);
        if (!active) return;
        const entries = normalizeAvailableDateEntries(pickArray(data));
        setAvailableDateEntries(entries);
        const cities = buildCityOptions(entries);
        setSelectedCity((prev) => (prev && cities.includes(prev) ? prev : cities[0] || ""));
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Failed to load dates");
      } finally {
        if (active) setLoadingDates(false);
      }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, categoryId]);

  // Auto-select first available date
  useEffect(() => {
    setAvailableDate((prev) => (prev && availableDates.includes(prev) ? prev : availableDates[0] || ""));
    setCalendarMonth(availableDates[0] ? availableDates[0].slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  }, [availableDates]);

  // Load balance
  useEffect(() => {
    if (!selectedOccupationId) { setBalanceInfo(null); return; }
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ methodology_type: methodology, occupation_id: selectedOccupationId, locale: "en" });
        const data = await api(`/api/svp/user-balance?${params}`);
        if (active) setBalanceInfo(data);
      } catch { if (active) setBalanceInfo(null); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, methodology]);

  // Load sessions when date changes
  useEffect(() => {
    if (!availableDate || !selectedOccupationId) { setSessions([]); return; }
    let active = true;
    (async () => {
      setLoadingSessions(true);
      try {
        const params = new URLSearchParams({
          category_id: categoryId || DEFAULT_CATEGORY_ID,
          exam_date: availableDate,
          locale: "en",
        });
        if (selectedCity) params.set("city", selectedCity);
        const data = await api(`/api/svp/exam-sessions?${params}`);
        if (!active) return;
        const list = pickArray(data);
        setSessions(list);
        if (list[0]) setSessionId(getSessionId(list[0]));
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load sessions");
      } finally {
        if (active) setLoadingSessions(false);
      }
    })();
    return () => { active = false; };
  }, [availableDate, selectedOccupationId, categoryId, selectedCity]);

  async function handleCreateHold() {
    if (!sessionId) return setError("Select a session first");
    setCreatingHold(true);
    setError("");
    try {
      const res = await api("/api/svp/temporary-seats", {
        method: "POST",
        body: { exam_session_id: [Number(sessionId)], methodology },
      });
      const hid = extractId(res, ["hold_id", "id"]);
      setHoldId(hid);
      setStatus(`Hold created${hid ? `: #${hid}` : ""}`);
    } catch (err: any) {
      setError(err?.message || "Failed to create hold");
    } finally {
      setCreatingHold(false);
    }
  }

  async function handleBook() {
    if (!sessionId || !selectedOccupationId) return setError("Select occupation & session");
    setBooking(true);
    setError("");
    try {
      const res = await api("/api/svp/exam-reservations", {
        method: "POST",
        body: {
          exam_session_id: Number(sessionId),
          occupation_id: Number(selectedOccupationId),
          language_code: languageCode,
          site_id: siteId ? Number(siteId) : null,
          site_city: siteCity || selectedCity || null,
          hold_id: holdId || null,
          methodology,
        },
      });
      const rid = extractId(res, ["reservation_id", "id"]) || res?.reservation?.id;
      setReservationId(String(rid || ""));
      setStatus(rid ? `Reservation confirmed: #${rid}` : "Reservation created ✅");
    } catch (err: any) {
      setError(err?.message || "Failed to book");
    } finally {
      setBooking(false);
    }
  }

  function shiftCalendarMonth(delta: number) {
    const base = new Date(`${calendarBaseMonth}-01T00:00:00`);
    base.setMonth(base.getMonth() + delta);
    setCalendarMonth(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`);
  }

  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl p-6 animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Create New Booking</h1>
            <p className="mt-1 text-sm text-muted-foreground">Follow the steps to book your exam session.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/exam/reservations"><Button variant="outline" size="sm">My bookings</Button></Link>
            <Link to="/dashboard"><Button variant="outline" size="sm">Dashboard</Button></Link>
          </div>
        </div>

        {status && <div className="mb-4 rounded-lg bg-primary/10 p-3 text-sm text-primary">{status}</div>}
        {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        {/* Booking mode indicator */}
        {balanceInfo && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3 text-sm">
            <strong className="text-foreground">Mode:</strong>{" "}
            <span className="text-muted-foreground">{bookingMode.label}</span>
            {bookingMode.reservationCredits > 0 && <span className="ml-3 text-muted-foreground">Credits: {bookingMode.reservationCredits}</span>}
            {bookingMode.freeCertificates > 0 && <span className="ml-3 text-muted-foreground">Free certs: {bookingMode.freeCertificates}</span>}
          </div>
        )}

        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          {/* Occupation */}
          <div>
            <Label>Occupation *</Label>
            <select className={selectClass + " mt-1"} value={selectedOccupationId} onChange={(e) => setSelectedOccupationId(e.target.value)}>
              <option value="">{loadingOccupations ? "Loading..." : "Select occupation"}</option>
              {occupations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* City */}
          <div>
            <Label>City *</Label>
            <select className={selectClass + " mt-1"} value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} disabled={!selectedOccupationId}>
              <option value="">Select city</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Date picker */}
          <div className="relative">
            <Label>Available Date *</Label>
            <button
              type="button"
              className={selectClass + " mt-1 cursor-pointer justify-between"}
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              disabled={loadingDates || !availableDates.length || !selectedCity}
            >
              <span>{availableDate ? formatDateLabel(availableDate) : "Select date..."}</span>
              <span className="text-muted-foreground">📅</span>
            </button>
            {isDatePickerOpen && availableDates.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" onClick={() => shiftCalendarMonth(-1)} className="rounded p-1 hover:bg-muted">◀</button>
                  <strong className="text-sm text-foreground">
                    {calendarCursorDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </strong>
                  <button type="button" onClick={() => shiftCalendarMonth(1)} className="rounded p-1 hover:bg-muted">▶</button>
                </div>
                <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) =>
                    day.empty ? (
                      <div key={day.key} />
                    ) : (
                      <button
                        key={day.key}
                        type="button"
                        disabled={!day.available}
                        onClick={() => { setAvailableDate(day.iso!); setIsDatePickerOpen(false); }}
                        className={`rounded-md p-1.5 text-xs transition-colors ${
                          day.iso === availableDate
                            ? "bg-primary text-primary-foreground"
                            : day.available
                            ? "hover:bg-primary/10 text-foreground cursor-pointer"
                            : "text-muted-foreground/40 cursor-not-allowed"
                        }`}
                      >
                        {day.day}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test Center */}
          <div>
            <Label>Test Center *</Label>
            <select className={selectClass + " mt-1"} value={selectedCenterId} onChange={(e) => { setSelectedCenterId(e.target.value); setSiteId(e.target.value); }} disabled={!centerOptions.length}>
              <option value="">{loadingSessions ? "Loading..." : "Select test center"}</option>
              {centerOptions.map((c) => <option key={c.siteId} value={c.siteId}>{c.name}</option>)}
            </select>
          </div>

          {/* Session */}
          <div>
            <Label>Exam Session *</Label>
            <select className={selectClass + " mt-1"} value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!filteredSessions.length}>
              <option value="">{loadingSessions ? "Loading..." : "Select session"}</option>
              {filteredSessions.map((s) => (
                <option key={getSessionId(s)} value={getSessionId(s)}>
                  {getSessionCenterName(s)} | #{getSessionId(s)}
                </option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <Label>Language *</Label>
            <select className={selectClass + " mt-1"} value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
              <option value="">Select language</option>
              {(selectedOccupation?.languageCodes || []).map((l) => (
                <option key={l.code} value={l.code}>{l.englishName} ({l.code})</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={handleCreateHold} disabled={creatingHold || !sessionId}>
              {creatingHold ? "Creating hold..." : "Hold Seat"}
            </Button>
            <Button onClick={handleBook} disabled={booking || !sessionId || !selectedOccupationId}>
              {booking ? "Booking..." : "Confirm Booking"}
            </Button>
          </div>

          {holdId && <p className="text-sm text-muted-foreground">Hold ID: {holdId}</p>}
          {reservationId && <p className="text-sm font-semibold text-primary">Reservation ID: {reservationId}</p>}
        </div>
      </div>
    </DashboardLayout>
  );
}
