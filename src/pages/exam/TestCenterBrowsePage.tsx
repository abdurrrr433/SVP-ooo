import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import {
  pickArray, normalizeAvailableDateEntries, buildCityOptions, buildDateOptions,
  normalizeDateValue,
} from "@/lib/booking-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TestCenter {
  id: number;
  name: string;
  city: string;
  address?: string;
  site_id?: number;
  test_center_id?: number;
  phone?: string;
  email?: string;
  available_seats?: number;
  total_seats?: number;
}

interface DateEntry {
  city: string;
  date: string;
}

export default function TestCenterBrowsePage() {
  const [availableDateEntries, setAvailableDateEntries] = useState<DateEntry[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [testCenters, setTestCenters] = useState<TestCenter[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<number | null>(null);
  const [selectedCenterDetail, setSelectedCenterDetail] = useState<TestCenter | null>(null);

  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingCenters, setLoadingCenters] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Fetch available dates on mount
  useEffect(() => {
    (async () => {
      setLoadingDates(true);
      setError("");
      try {
        const params = new URLSearchParams({
          per_page: "1000",
          available_seats: "greater_than::0",
          status: "scheduled",
          locale: "en",
        });
        const data = await api(`/available-dates?${params.toString()}`);
        const entries = normalizeAvailableDateEntries(pickArray(data));
        setAvailableDateEntries(entries);
        const cities = buildCityOptions(entries);
        if (cities.length > 0) {
          setSelectedCity(cities[0]);
          setStatus(`Found ${cities.length} cities with available sessions`);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load available dates");
        setAvailableDateEntries([]);
      } finally {
        setLoadingDates(false);
      }
    })();
  }, []);

  // Available dates for selected city
  const availableDates = useMemo(
    () => buildDateOptions(availableDateEntries, selectedCity),
    [availableDateEntries, selectedCity]
  );

  // Auto-select first date when city changes
  useEffect(() => {
    if (availableDates.length > 0) {
      setSelectedDate(availableDates[0]);
    } else {
      setSelectedDate("");
    }
    setTestCenters([]);
    setSelectedCenterId(null);
    setSelectedCenterDetail(null);
  }, [availableDates]);

  // Fetch test centers list when city/date changes
  useEffect(() => {
    if (!selectedCity || !selectedDate) {
      setTestCenters([]);
      return;
    }

    (async () => {
      setLoadingCenters(true);
      setError("");
      try {
        // Endpoint 24: GET /test-centers with filters
        const params = new URLSearchParams({
          city: selectedCity,
          exam_date: selectedDate,
          locale: "en",
          per_page: "100",
        });
        const data = await api(`/test-centers?${params.toString()}`);
        const centers = pickArray(data) as TestCenter[];
        setTestCenters(centers);
        setStatus(`Found ${centers.length} test centers in ${selectedCity} on ${selectedDate}`);
        if (centers.length > 0) {
          setSelectedCenterId(centers[0].id);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load test centers");
        setTestCenters([]);
      } finally {
        setLoadingCenters(false);
      }
    })();
  }, [selectedCity, selectedDate]);

  // Fetch detailed center info when selection changes
  useEffect(() => {
    if (!selectedCenterId) {
      setSelectedCenterDetail(null);
      return;
    }

    (async () => {
      setLoadingDetail(true);
      try {
        // Endpoint 25: GET /test-centers/:id
        const data: any = await api(`/test-centers/${encodeURIComponent(selectedCenterId)}?locale=en`);
        const detail = data?.test_center || data?.data?.test_center || data?.data || data;
        setSelectedCenterDetail(detail as TestCenter);
      } catch (err: any) {
        console.warn("Failed to fetch center detail:", err?.message);
        // Fallback to list entry
        const center = testCenters.find((c) => c.id === selectedCenterId);
        setSelectedCenterDetail(center || null);
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedCenterId, testCenters]);

  const cityOptions = buildCityOptions(availableDateEntries);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Test Center Browser</h1>
          <p className="text-lg text-slate-600">
            Browse available test centers by city and date
          </p>
        </div>

        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {status && (
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <AlertDescription className="text-blue-800">{status}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Filters */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* City Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    City {loadingDates && <span className="text-xs text-slate-500">(loading...)</span>}
                  </label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    disabled={loadingDates || cityOptions.length === 0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                  >
                    <option value="">-- Select City --</option>
                    {cityOptions.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Date {loadingCenters && <span className="text-xs text-slate-500">(loading...)</span>}
                  </label>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    disabled={loadingCenters || availableDates.length === 0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                  >
                    <option value="">-- Select Date --</option>
                    {availableDates.map((date) => (
                      <option key={date} value={date}>
                        {new Date(date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Count Info */}
                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
                  <p>
                    <strong>{testCenters.length}</strong> centers available
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Middle Panel: Centers List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Centers</CardTitle>
              </CardHeader>
              <CardContent>
                {testCenters.length === 0 ? (
                  <p className="text-slate-500 text-sm">No centers found. Select a city and date.</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {testCenters.map((center) => (
                      <button
                        key={center.id}
                        onClick={() => setSelectedCenterId(center.id)}
                        className={`w-full text-left px-3 py-2 rounded-md transition ${
                          selectedCenterId === center.id
                            ? "bg-blue-500 text-white font-medium"
                            : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                        }`}
                      >
                        <div className="font-semibold text-sm">{center.name || "Unnamed"}</div>
                        <div className="text-xs opacity-75">ID: {center.id}</div>
                        {center.site_id && (
                          <div className="text-xs opacity-75">Site: {center.site_id}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel: Center Detail */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Center Details</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDetail ? (
                  <div className="text-slate-500 text-sm">Loading details...</div>
                ) : selectedCenterDetail ? (
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase">Name</span>
                      <p className="text-sm font-medium text-slate-900">
                        {selectedCenterDetail.name || "N/A"}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        Center IDs
                      </span>
                      <div className="text-sm text-slate-700 space-y-1">
                        <p>
                          <strong>ID:</strong> {selectedCenterDetail.id}
                        </p>
                        {selectedCenterDetail.site_id && (
                          <p>
                            <strong>Site ID:</strong> {selectedCenterDetail.site_id}
                          </p>
                        )}
                        {selectedCenterDetail.test_center_id && (
                          <p>
                            <strong>Test Center ID:</strong> {selectedCenterDetail.test_center_id}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase">City</span>
                      <p className="text-sm text-slate-700">{selectedCenterDetail.city || "N/A"}</p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase">Address</span>
                      <p className="text-sm text-slate-700">
                        {selectedCenterDetail.address || "N/A"}
                      </p>
                    </div>

                    {selectedCenterDetail.phone && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase">Phone</span>
                        <p className="text-sm text-slate-700">{selectedCenterDetail.phone}</p>
                      </div>
                    )}

                    {selectedCenterDetail.email && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase">Email</span>
                        <p className="text-sm text-slate-700">{selectedCenterDetail.email}</p>
                      </div>
                    )}

                    {selectedCenterDetail.available_seats !== undefined && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase">
                          Available Seats
                        </span>
                        <p className="text-sm text-slate-700">
                          {selectedCenterDetail.available_seats} / {selectedCenterDetail.total_seats || "?"}
                        </p>
                      </div>
                    )}

                    <div className="pt-4 border-t">
                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => {
                          // Navigate to booking page with center pre-selected
                          window.location.href = `/exam/booking?siteId=${selectedCenterDetail.site_id || selectedCenterDetail.id}&siteCity=${encodeURIComponent(selectedCenterDetail.city || "")}`;
                        }}
                      >
                        Book Exam Here
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Select a center to view details.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* API Endpoints Info */}
        <Card className="mt-8 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-sm">API Endpoints Used</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2 text-slate-600">
            <p>
              <strong>Endpoint 24:</strong> GET <code className="bg-slate-200 px-1 rounded">/test-centers</code> - List all centers with filters
            </p>
            <p>
              <strong>Endpoint 25:</strong> GET <code className="bg-slate-200 px-1 rounded">/test-centers/:id</code> - Fetch single center detail
            </p>
            <p className="pt-2 text-slate-500">
              These endpoints are proxied from <code className="bg-slate-200 px-1 rounded">/api/v1/individual_labor_space/test_centers</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
