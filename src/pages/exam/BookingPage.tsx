import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  pickArray, normalizeOccupation, normalizeDateValue,
  normalizeAvailableDateEntries, getSessionId, getSessionSiteId, getSessionSiteCity,
  getSessionCenterName, getCenterKey, getPrometricCodes, extractId,
  buildCenterOptions, buildCityOptions, buildDateOptions, buildCalendarDays,
  formatDateLabel, detectBookingMode,
} from "@/lib/booking-utils";

const DEFAULT_CATEGORY_ID = "159";
const DEFAULT_BACKEND_URL = "https://aci-api-production.up.railway.app";

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const [occupations, setOccupations] = useState<any[]>([]);
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
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedOccupation = useMemo(
    () => occupations.find((item) => String(item.id) === String(selectedOccupationId)) || null,
    [occupations, selectedOccupationId]
  );
  const cityOptions = useMemo(() => buildCityOptions(availableDateEntries), [availableDateEntries]);
  const availableDates = useMemo(() => buildDateOptions(availableDateEntries, selectedCity), [availableDateEntries, selectedCity]);
  const cityFilteredSessions = useMemo(
    () => selectedCity ? sessions.filter((item) => String(getSessionSiteCity(item)).trim().toLowerCase() === String(selectedCity).trim().toLowerCase()) : sessions,
    [sessions, selectedCity]
  );
  const centerOptions = useMemo(() => buildCenterOptions(cityFilteredSessions), [cityFilteredSessions]);
  const filteredSessions = useMemo(
    () => selectedCenterId ? cityFilteredSessions.filter((item) => getCenterKey(item) === String(selectedCenterId)) : cityFilteredSessions,
    [cityFilteredSessions, selectedCenterId]
  );
  const selectedSession = useMemo(
    () => filteredSessions.find((item) => String(getSessionId(item)) === String(sessionId)) || null,
    [filteredSessions, sessionId]
  );
  const calendarBaseMonth = calendarMonth || (availableDate ? availableDate.slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  const calendarCursorDate = useMemo(() => new Date(`${calendarBaseMonth}-01T00:00:00`), [calendarBaseMonth]);
  const calendarYear = calendarCursorDate.getFullYear();
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarBaseMonth, availableDates),
    [calendarBaseMonth, availableDates]
  );
  const calendarYearOptions = useMemo(() => {
    const years = availableDates.map((item) => Number(String(item).slice(0, 4))).filter((item) => Number.isInteger(item));
    const fallback = new Date().getFullYear();
    const minYear = years.length ? Math.min(...years) : fallback;
    const maxYear = years.length ? Math.max(...years) : fallback + 1;
    const options: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) options.push(year);
    return options.length ? options : [fallback, fallback + 1];
  }, [availableDates]);
  const bookingMode = useMemo(() => detectBookingMode(balanceInfo), [balanceInfo]);

  useEffect(() => {
    (async () => {
      setLoadingOccupations(true); setError("");
      try {
        const data = await api("/api/svp/occupations?locale=en&per_page=200&page=1");
        setOccupations(pickArray(data).map(normalizeOccupation));
      } catch (err: any) { setError(err?.message || "Failed to load occupations"); }
      finally { setLoadingOccupations(false); }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("occupationId")) setSelectedOccupationId(String(searchParams.get("occupationId")));
    if (searchParams.get("categoryId")) setCategoryId(String(searchParams.get("categoryId")));
    if (searchParams.get("languageCode")) setLanguageCode(String(searchParams.get("languageCode")));
    if (searchParams.get("siteCity")) setSelectedCity(String(searchParams.get("siteCity")));
    if (searchParams.get("siteId")) { setSelectedCenterId(String(searchParams.get("siteId"))); setSiteId(String(searchParams.get("siteId"))); }
    if (searchParams.get("siteCity")) setSiteCity(String(searchParams.get("siteCity")));
    if (searchParams.get("examDate")) {
      const examDate = normalizeDateValue(String(searchParams.get("examDate")));
      setAvailableDate(examDate); setCalendarMonth(examDate.slice(0, 7));
    }
    if (searchParams.get("reschedule") === "1") setStatus("Reschedule mode active. Follow the steps to rebook.");
  }, [searchParams]);

  useEffect(() => {
    if (!selectedOccupation) return;
    setCategoryId(String(selectedOccupation.categoryId || DEFAULT_CATEGORY_ID));
    setLanguageCode((prev) => prev || String(selectedOccupation.languageCodes[0]?.code || ""));
    setMethodology(String(selectedOccupation.methodology || "in_person"));
    setSelectedCity(""); setAvailableDate(""); setAvailableDateEntries([]); setSessions([]);
    setSelectedCenterId(""); setSessionId(""); setHoldId(""); setReservationId("");
  }, [selectedOccupation]);

  useEffect(() => {
    setAvailableDate(""); setSessions([]); setSelectedCenterId(""); setSessionId("");
    setSiteId(""); setSiteCity(selectedCity || ""); setHoldId(""); setReservationId("");
    if (selectedCity) setStatus(`City selected: ${selectedCity}. Loading sessions for the selected date.`);
  }, [selectedCity]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedOccupationId) { setAvailableDateEntries([]); setAvailableDate(""); return; }
      setLoadingDates(true); setError("");
      try {
        const params = new URLSearchParams({
          per_page: "1000", category_id: String(categoryId || DEFAULT_CATEGORY_ID),
          start_at_date_from: normalizeDateValue(new Date().toISOString()),
          available_seats: "greater_than::0", status: "scheduled", locale: "en",
        });
        const data = await api(`/api/svp/available-dates?${params.toString()}`);
        if (!active) return;
        const entries = normalizeAvailableDateEntries(pickArray(data));
        const cities = buildCityOptions(entries);
        setAvailableDateEntries(entries);
        setSelectedCity((prev) => (prev && cities.includes(prev) ? prev : cities[0] || ""));
      } catch (err: any) { if (!active) return; setAvailableDateEntries([]); setError(err?.message || "Failed to load available dates"); }
      finally { if (active) setLoadingDates(false); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, categoryId]);

  useEffect(() => {
    setAvailableDate((prev) => (prev && availableDates.includes(prev) ? prev : availableDates[0] || ""));
    setCalendarMonth(availableDates[0] ? availableDates[0].slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  }, [availableDates]);

  useEffect(() => { if (!selectedCity || !availableDates.length) setIsDatePickerOpen(false); }, [selectedCity, availableDates.length]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedOccupationId) { setBalanceInfo(null); return; }
      setLoadingBalance(true);
      try {
        const params = new URLSearchParams({ methodology_type: methodology || "in_person", occupation_id: String(selectedOccupationId), locale: "en" });
        const data = await api(`/api/svp/user-balance?${params.toString()}`);
        if (!active) return; setBalanceInfo(data);
      } catch { if (!active) return; setBalanceInfo(null); }
      finally { if (active) setLoadingBalance(false); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, methodology]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedCity || !availableDate || !categoryId) { setSessions([]); return; }
      setLoadingSessions(true); setError("");
      try {
        const params = new URLSearchParams({ category_id: String(categoryId), city: String(selectedCity), exam_date: availableDate, locale: "en" });
        const data = await api(`/api/svp/exam-sessions?${params.toString()}`);
        if (!active) return; setSessions(pickArray(data));
      } catch (err: any) { if (!active) return; setSessions([]); setError(err?.message || "Failed to load test sessions"); }
      finally { if (active) setLoadingSessions(false); }
    })();
    return () => { active = false; };
  }, [selectedCity, availableDate, categoryId]);

  useEffect(() => {
    if (!centerOptions.length) { setSelectedCenterId(""); return; }
    const hasSelected = centerOptions.some((item) => String(item.siteId) === String(selectedCenterId));
    if (!selectedCenterId || !hasSelected) setSelectedCenterId(String(centerOptions[0].siteId));
  }, [centerOptions, selectedCenterId]);

  useEffect(() => {
    if (!filteredSessions.length) { setSessionId(""); return; }
    const hasSelected = filteredSessions.some((item) => String(getSessionId(item)) === String(sessionId));
    if (!sessionId || !hasSelected) setSessionId(String(getSessionId(filteredSessions[0])));
  }, [filteredSessions, sessionId]);

  useEffect(() => {
    const selectedCenter = centerOptions.find((item) => String(item.siteId) === String(selectedCenterId));
    if (selectedCenter) { setSiteId(String(selectedCenter.siteId || "")); setSiteCity(String(selectedCenter.city || "")); }
  }, [selectedCenterId, centerOptions]);

  useEffect(() => {
    if (!selectedSession) return;
    setSiteId(String(getSessionSiteId(selectedSession) || ""));
    setSiteCity(String(getSessionSiteCity(selectedSession) || ""));
    const codes = getPrometricCodes(selectedSession);
    if (codes[0]?.code || codes[0]?.language_code) setLanguageCode(String(codes[0].code || codes[0].language_code));
  }, [selectedSession]);

  async function createHold() {
    if (!sessionId) { setError("Select test center / session first"); return; }
    const sessionIds = Array.from(new Set(
      (filteredSessions.length ? filteredSessions : [selectedSession])
        .map((item) => Number(getSessionId(item))).filter((item) => Number.isFinite(item) && item > 0)
    ));
    if (!sessionIds.length) { setError("No valid exam sessions found for hold creation"); return; }
    setCreatingHold(true); setError(""); setStatus("");
    try {
      const data = await api("/api/svp/temporary-seats", { method: "POST", body: { exam_session_id: sessionIds, methodology: methodology || "in_person" } });
      const nextHoldId = extractId(data, ["id", "hold_id", "temporary_seat_id"]);
      setHoldId(String(nextHoldId || ""));
      setStatus(nextHoldId ? `Hold created: #${nextHoldId}` : "Hold created");
    } catch (err: any) { setError(err?.message || "Failed to create hold"); }
    finally { setCreatingHold(false); }
  }

  async function bookReservation() {
    if (!sessionId) { setError("Select test center / session first"); return; }
    try { await api(`/api/svp/exam-session/${encodeURIComponent(sessionId)}?locale=en`); }
    catch (err: any) { setError(err?.message || "Selected exam session is no longer available"); return; }
    const sessionCodes = getPrometricCodes(selectedSession);
    const effectiveLanguageCode = languageCode || selectedOccupation?.languageCodes?.[0]?.code || sessionCodes?.[0]?.code || sessionCodes?.[0]?.language_code || "";
    if (!effectiveLanguageCode) { setError("language_code is required. Select a language before booking."); return; }
    setBooking(true); setError(""); setStatus("");
    try {
      const data = await api("/api/svp/exam-reservations", {
        method: "POST", body: {
          exam_session_id: Number(sessionId), occupation_id: Number(selectedOccupationId),
          methodology: methodology || "in_person", language_code: effectiveLanguageCode,
          site_id: siteId ? Number(siteId) : null, site_city: siteCity || selectedCity || null,
          hold_id: holdId ? Number(holdId) : null,
        },
      });
      const nextReservationId = extractId(data, ["id", "reservation_id", "exam_reservation_id"]);
      setReservationId(String(nextReservationId || ""));
      if (nextReservationId && bookingMode.type === "reservation_credit") {
        await api("/api/svp/reservation-credits/use", {
          method: "POST", body: { methodology_type: methodology || "in_person", reservation_id: Number(nextReservationId), occupation_id: Number(selectedOccupationId) },
        });
      }
      setStatus(nextReservationId ? `Reservation confirmed: #${nextReservationId}` : "Reservation created");
      if (nextReservationId) await openTicketPdf(nextReservationId);
    } catch (err: any) { setError(err?.message || "Failed to book reservation"); }
    finally { setBooking(false); }
  }

  async function openTicketPdf(nextReservationId: string) {
    const accessToken = localStorage.getItem("accessToken") || "";
    const base = DEFAULT_BACKEND_URL;
    const response = await fetch(`${base}/api/svp/tickets/${encodeURIComponent(nextReservationId)}/show-pdf?locale=en`, {
      method: "GET", headers: { Accept: "*/*", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, credentials: "include",
    });
    if (!response.ok) { throw new Error(await response.text() || "Failed to open ticket PDF"); }
    const contentType = response.headers.get("content-type") || "";
    const disposition = response.headers.get("content-disposition") || "";
    const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    const fallbackFileName = `ticket-${nextReservationId}.pdf`;
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : fallbackFileName;
    function triggerDownload(href: string, name: string) {
      const anchor = document.createElement("a"); anchor.href = href; anchor.download = name;
      document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
    }
    if (contentType.includes("application/json")) {
      const data = await response.json();
      const url = data?.url || data?.pdf_url || data?.data?.url || data?.data?.pdf_url;
      if (url) { triggerDownload(String(url), fallbackFileName); return; }
      throw new Error("Ticket PDF URL not found in response");
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }

  function shiftCalendarMonth(delta: number) {
    const base = new Date(`${calendarBaseMonth}-01T00:00:00`);
    base.setMonth(base.getMonth() + delta);
    setCalendarMonth(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`);
  }

  function pickDateFromCalendar(nextDate: string) {
    setAvailableDate(nextDate); setCalendarMonth(nextDate.slice(0, 7)); setIsDatePickerOpen(false);
  }

  return (
    <div className="booking-shell">
      <div className="booking-modal">
        <div className="modal-head">
          <h1>Create New Booking</h1>
          <Link to="/dashboard" className="close-link" aria-label="Close">x</Link>
        </div>
        <div className="modal-meta-links">
          <Link to="/exam/reservations">My bookings</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>

        {status ? <div className="notice notice--ok">{status}</div> : null}
        {error ? <div className="notice notice--error">{error}</div> : null}

        <div className="form-grid">
          <div className="field-block">
            <span>Category ID</span>
            <div className="readonly-value">{categoryId || DEFAULT_CATEGORY_ID}</div>
          </div>
          <div className="field-block">
            <span>Methodology</span>
            <div className="readonly-value">{methodology}</div>
          </div>
          <div className="field-block">
            <span>Occupation *</span>
            <select value={selectedOccupationId} onChange={(e) => setSelectedOccupationId(e.target.value)}>
              <option value="">{loadingOccupations ? "Loading occupations..." : "Select occupation"}</option>
              {occupations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="field-block">
            <span>City *</span>
            <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} disabled={!selectedOccupationId}>
              <option value="">Select city</option>
              {cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field-block field-block--datepicker">
            <span>Available Date *</span>
            <button type="button" className="date-trigger" onClick={() => setIsDatePickerOpen((prev) => !prev)}
              disabled={loadingDates || !availableDates.length || !selectedCity}>
              <span>{availableDate ? formatDateLabel(availableDate) : "Select available date..."}</span>
              <span className="date-trigger__icon">[]</span>
            </button>
            {isDatePickerOpen && selectedCity && availableDates.length ? (
              <div className="date-popup">
                <div className="date-popup__head">
                  <strong>Select Date</strong>
                  <button type="button" className="icon-btn" onClick={() => setIsDatePickerOpen(false)}>x</button>
                </div>
                <div className="date-popup__toolbar">
                  <button type="button" className="icon-btn" onClick={() => shiftCalendarMonth(-1)}>{"<"}</button>
                  <select className="toolbar-select" value={calendarCursorDate.getMonth()}
                    onChange={(e) => { const next = new Date(calendarCursorDate); next.setMonth(Number(e.target.value)); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }}>
                    {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2000, index, 1).toLocaleDateString("en-US", { month: "long" })}</option>)}
                  </select>
                  <select className="toolbar-select" value={calendarYear}
                    onChange={(e) => { const next = new Date(calendarCursorDate); next.setFullYear(Number(e.target.value)); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }}>
                    {calendarYearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => shiftCalendarMonth(1)}>{">"}</button>
                </div>
                <div className="calendar-weekdays">
                  <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>
                <div className="calendar-grid">
                  {calendarDays.map((item) =>
                    item.empty ? <div key={item.key} className="calendar-cell calendar-cell--empty" /> : (
                      <button key={item.key} type="button"
                        className={`calendar-cell${item.available ? " calendar-cell--available" : ""}${item.iso === availableDate ? " calendar-cell--active" : ""}`}
                        onClick={() => item.available && pickDateFromCalendar(item.iso!)} disabled={!item.available}>
                        <span>{item.day}</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {!loadingDates && selectedCity && !availableDates.length ? (
            <small className="error-text">No available dates found yet. Try another city or occupation.</small>
          ) : null}
          <div className="field-block">
            <span>Test Center *</span>
            <select value={selectedCenterId} onChange={(e) => setSelectedCenterId(e.target.value)} disabled={!centerOptions.length}>
              <option value="">{loadingSessions ? "Loading centers..." : "Select test center"}</option>
              {centerOptions.map((item) => <option key={item.siteId} value={item.siteId}>{item.name}</option>)}
            </select>
          </div>
          <div className="field-block">
            <span>Exam Session *</span>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!filteredSessions.length}>
              <option value="">{loadingSessions ? "Loading sessions..." : "Select session"}</option>
              {filteredSessions.map((item) => (
                <option key={getSessionId(item)} value={getSessionId(item)}>
                  {getSessionCenterName(item)} | Session #{getSessionId(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-block">
            <span>Language *</span>
            <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
              <option value="">Select language</option>
              {selectedOccupation?.languageCodes.map((item: any) => (
                <option key={item.code} value={item.code}>{item.englishName} {item.code ? `(${item.code})` : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="meta-grid">
          <div><span>Booking Type:</span> <strong>{loadingBalance ? "Checking..." : bookingMode.label}</strong></div>
          <div><span>Reservation Credits:</span> <strong>{loadingBalance ? "-" : bookingMode.reservationCredits}</strong></div>
          <div><span>Free Certificates:</span> <strong>{loadingBalance ? "-" : bookingMode.freeCertificates}</strong></div>
          <div><span>City:</span> <strong>{siteCity || selectedCity || "-"}</strong></div>
          <div><span>Site ID:</span> <strong>{siteId || "-"}</strong></div>
          <div><span>Hold ID:</span> <strong>{holdId || "-"}</strong></div>
          <div><span>Booking No:</span> <strong>{reservationId || "-"}</strong></div>
        </div>

        <div className="actions-row">
          <button className="ghost-btn" type="button" onClick={createHold} disabled={creatingHold || !sessionId}>
            {creatingHold ? "Creating hold..." : "Create Hold"}
          </button>
          <button className="primary-btn" type="button" onClick={bookReservation} disabled={booking || !sessionId}>
            {booking ? "Confirming..." : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
