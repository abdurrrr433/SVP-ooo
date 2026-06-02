import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── SVP API helper ──────────────────────────────────────────────────
const SVP_BASE = Deno.env.get("SVP_BASE_URL") || "https://svp-international-api.pacc.sa";
const SVP_LOCALE = "en";
const SVP_ORIGIN = "https://svp-international.pacc.sa";
const SVP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

async function svpFetch(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
) {
  const url = `${SVP_BASE}${path}${path.includes("?") ? "&" : "?"}locale=${SVP_LOCALE}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: SVP_ORIGIN,
    Referer: `${SVP_ORIGIN}/`,
    "User-Agent": SVP_UA,
  };
  if (opts.body) headers["Content-Type"] = "application/json;charset=UTF-8";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw { statusCode: res.status, message: `SVP request failed: ${res.status}`, details: data };
  }
  return data;
}

async function svpFetchRaw(
  path: string,
  token: string
) {
  const url = `${SVP_BASE}${path}${path.includes("?") ? "&" : "?"}locale=${SVP_LOCALE}`;
  return fetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${token}`,
      Origin: SVP_ORIGIN,
      Referer: `${SVP_ORIGIN}/`,
      "User-Agent": SVP_UA,
    },
  });
}

// ── Crypto ──────────────────────────────────────────────────────────
async function getEncKey(): Promise<Uint8Array> {
  const raw = Deno.env.get("SESSION_ENC_KEY_BASE64") || "";
  if (raw) {
    try {
      const decoded = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      if (decoded.length === 32) return decoded;
    } catch { /* fall through */ }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return new Uint8Array(hash);
  }
  const fallback = Deno.env.get("JWT_REFRESH_SECRET") || "dev";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fallback));
  return new Uint8Array(hash);
}

async function decryptString(b64: string): Promise<string> {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const data = buf.slice(12);
  const key = await crypto.subtle.importKey("raw", await getEncKey(), "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ── JWT verify ──────────────────────────────────────────────────────
async function verifyJwt(token: string): Promise<Record<string, unknown>> {
  const secret = Deno.env.get("JWT_ACCESS_SECRET")!;
  const parts = token.split(".");
  if (parts.length !== 3) throw { statusCode: 401, message: "Invalid token" };

  const keyData = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const input = `${parts[0]}.${parts[1]}`;

  const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
  const padded = sigB64 + "=".repeat((4 - (sigB64.length % 4)) % 4);
  const sig = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify("HMAC", cryptoKey, sig, new TextEncoder().encode(input));
  if (!valid) throw { statusCode: 401, message: "Invalid signature" };

  const claimsB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const claimsPadded = claimsB64 + "=".repeat((4 - (claimsB64.length % 4)) % 4);
  const claims = JSON.parse(atob(claimsPadded));

  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    throw { statusCode: 401, message: "Token expired" };
  }

  return claims;
}

// ── Auth middleware ─────────────────────────────────────────────────
async function requireAuth(req: Request): Promise<{ user: Record<string, unknown>; svpToken: string }> {
  const hdr = req.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) throw { statusCode: 401, message: "Missing access token" };

  const user = await verifyJwt(token);
  const sessionId = user.sid as string;
  if (!sessionId) throw { statusCode: 401, message: "Missing session" };

  const supabase = getSupabase();
  const { data: session } = await supabase.from("svp_sessions").select("*").eq("id", sessionId).single();
  if (!session || session.revoked_at) throw { statusCode: 401, message: "Session revoked" };
  if (!session.svp_access_enc) throw { statusCode: 401, message: "Missing SVP token" };

  const svpToken = await decryptString(session.svp_access_enc);
  return { user, svpToken };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// ── Route definitions ───────────────────────────────────────────────
interface RouteEntry {
  method: string;
  pattern: RegExp;
  svpPath: string | ((match: RegExpMatchArray, query: string) => string);
  bodyForward?: boolean;
}

const routes: RouteEntry[] = [
  { method: "GET", pattern: /^\/permissions$/, svpPath: "/api/v1/individual_labor_space/permissions" },
  { method: "GET", pattern: /^\/occupations$/, svpPath: "/api/v1/individual_labor_space/occupations" },
  { method: "GET", pattern: /^\/exam-constraints$/, svpPath: "/api/v1/individual_labor_space/exam_constraints" },
  // exam-sessions list is handled as a custom route below (to enrich with available_seats)
  { method: "GET", pattern: /^\/exam-session\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_sessions/${m[1]}` },
  { method: "GET", pattern: /^\/exam-sessions\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_sessions/${m[1]}` },
  { method: "GET", pattern: /^\/test-centers\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/test_centers/${m[1]}` },
  { method: "GET", pattern: /^\/exam-reservations$/, svpPath: "/api/v1/individual_labor_space/exam_reservations" },
  { method: "GET", pattern: /^\/exam-reservations\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_reservations/${m[1]}` },
  { method: "POST", pattern: /^\/temporary-seats$/, svpPath: "/api/v1/individual_labor_space/temporary_seats", bodyForward: true },
  { method: "POST", pattern: /^\/exam-reservations$/, svpPath: "/api/v1/individual_labor_space/exam_reservations", bodyForward: true },
  { method: "POST", pattern: /^\/reservation-credits\/use$/, svpPath: "/api/v1/individual_labor_space/reservation_credits/use", bodyForward: true },
  { method: "GET", pattern: /^\/certificate-price$/, svpPath: "/api/v1/individual_labor_space/certificate_price" },
  { method: "GET", pattern: /^\/payments-validate-pending$/, svpPath: "/api/v1/individual_labor_space/payments/validate_pending" },
  { method: "POST", pattern: /^\/payments$/, svpPath: "/api/v1/individual_labor_space/payments", bodyForward: true },
  { method: "GET", pattern: /^\/payments\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/payments/${m[1]}` },
  { method: "PUT", pattern: /^\/payments\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/payments/${m[1]}`, bodyForward: true },
  { method: "GET", pattern: /^\/feature-flags$/, svpPath: "/api/v1/individual_labor_space/feature_flags" },
  { method: "GET", pattern: /^\/notifications$/, svpPath: "/api/v1/individual_labor_space/notifications" },
  { method: "GET", pattern: /^\/user-balance\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/user_balance/${m[1]}` },
  { method: "DELETE", pattern: /^\/exam-reservations\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_reservations/${m[1]}` },
  { method: "POST", pattern: /^\/exam-reservations\/([^/]+)\/reschedule$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_reservations/${m[1]}/reschedule`, bodyForward: true },
];

function buildPath(basePath: string, queryString: string): string {
  const params = new URLSearchParams(queryString);
  params.delete("locale");
  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function getSessionTestCenterId(session: any): string {
  const direct = session?.test_center_id || session?.test_center?.test_center_id || session?.test_center?.id || "";
  return direct ? String(direct) : "";
}

const centerCache = new Map<string, {
  test_center_id: number | null;
  site_id: number | null;
  name: string;
  city: string | null;
  address: string | null;
}>();

const sectionCenterRules: Record<string, Record<string, { name: string; test_center_id: number; site_id: number }>> = {
  Dhaka: {
    cbt: { name: "Prometric Dhaka — Banani", test_center_id: 9012, site_id: 50231 },
    practical: { name: "Prometric Dhaka — Uttara", test_center_id: 9013, site_id: 50244 },
  },
};

const STATIC_TEST_CENTERS: Record<number, { site_id: number; name: string; city: string }> = {
  17: { site_id: 17, name: "Bangladesh Korea TTC Dhaka", city: "Dhaka" },
  45: { site_id: 45, name: "Bangladesh German TTC", city: "Dhaka" },
  54: { site_id: 54, name: "Rajshahi Technical Training Centre", city: "Rajshahi" },
  71: { site_id: 71, name: "Sylhet Technical Training Center", city: "Sylhet" },
  62: { site_id: 62, name: "Cumilla Technical Training Centre", city: "Cumilla" },
  107: { site_id: 107, name: "Bogura Technical Training Centre", city: "Rajshahi" },
  115: { site_id: 115, name: "BRTC Central Training Institute Gazipur", city: "Dhaka" },
  156: { site_id: 156, name: "Khulna Technical Training Centre", city: "Khulna" },
  168: { site_id: 168, name: "Chapainawabganj Technical Training Centre", city: "Rajshahi" },
  171: { site_id: 171, name: "Jashore Technical Training Centre", city: "Khulna" },
  181: { site_id: 181, name: "Narail Technical Training Centre", city: "Khulna" },
  201: { site_id: 201, name: "Pabna Technical Training Centre", city: "Rajshahi" },
  203: { site_id: 203, name: "Noakhali Technical Training Centre", city: "Cumilla" },
  218: { site_id: 218, name: "Narsingdi Technical Training Center", city: "Dhaka" },
  220: { site_id: 220, name: "Kishoreganj Technical Training Centre", city: "Dhaka" },
  221: { site_id: 221, name: "Shariatpur Technical Training Centre", city: "Dhaka" },
  223: { site_id: 223, name: "Manikganj Technical Training Center", city: "Dhaka" },
  265: { site_id: 265, name: "Joypurhat Technical Training Center", city: "Rajshahi" },
};

function lookupStaticCenterByTestCenterId(id: number | null) {
  return id && STATIC_TEST_CENTERS[id] ? STATIC_TEST_CENTERS[id] : null;
}

function lookupStaticCenterByName(name: string | null) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return Object.values(STATIC_TEST_CENTERS).find((center) => center.name.toLowerCase() === key) || null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSessionCenterNameValue(session: any): string | null {
  return normalizeString(
    session?.test_center?.test_center_name || session?.test_center?.name || session?.test_center_name
  );
}

function getSessionCenterCityValue(session: any): string | null {
  return normalizeString(
    session?.test_center?.test_center_city || session?.test_center?.city || session?.city || session?.site_city
  );
}

function getSessionCenterSiteIdValue(session: any): number | null {
  return toPositiveNumber(session?.test_center?.site_id ?? session?.site_id);
}

function getSessionCenterTestCenterIdValue(session: any): number | null {
  const direct = toPositiveNumber(session?.test_center?.test_center_id);
  if (direct) return direct;
  const nestedId = toPositiveNumber(session?.test_center?.id);
  if (nestedId) return nestedId;
  return null;
}

function getSessionSectionValue(session: any): string | null {
  return normalizeString(session?.section || session?.require_section || session?.section_name);
}

async function lookupCenterByName(name: string, city: string | null) {
  const supabase = getSupabase();
  let query = supabase.from("test_centers").select("site_id,name,city,address").ilike("name", name);
  if (city) query = query.eq("city", city);
  const { data } = await query.limit(1);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function resolveSessionCenter(session: any, svpToken: string, detail: any = null) {
  const sessionId = String(session?.id || "");
  const candidateName = getSessionCenterNameValue(session);
  const candidateCity = getSessionCenterCityValue(session);
  const candidateSiteId = getSessionCenterSiteIdValue(session);
  const candidateTestCenterId = getSessionCenterTestCenterIdValue(session);
  const candidateAddress = normalizeString(session?.test_center?.address || session?.address || session?.test_center?.address);

  const staticRow = lookupStaticCenterByTestCenterId(candidateTestCenterId) || lookupStaticCenterByName(candidateName);
  if (!candidateName && staticRow) {
    const result = {
      test_center_id: candidateTestCenterId,
      site_id: candidateSiteId || staticRow.site_id,
      name: staticRow.name,
      city: candidateCity || staticRow.city,
      address: candidateAddress,
    };
    if (sessionId) centerCache.set(sessionId, result);
    return result;
  }

  if (candidateName) {
    const result = {
      test_center_id: candidateTestCenterId,
      site_id: candidateSiteId,
      name: candidateName,
      city: candidateCity,
      address: candidateAddress,
    };

    if (!result.site_id && result.name) {
      const row = await lookupCenterByName(result.name, result.city);
      if (row?.site_id) {
        result.site_id = row.site_id;
        result.city = row.city || result.city;
        result.address = row.address || result.address;
      } else {
        const staticRow = lookupStaticCenterByTestCenterId(result.test_center_id) || lookupStaticCenterByName(result.name);
        if (staticRow) {
          result.site_id = staticRow.site_id;
          result.city = result.city || staticRow.city;
          result.address = result.address || null;
        }
      }
    }

    if (sessionId) centerCache.set(sessionId, result);
    return result;
  }

  if (sessionId && centerCache.has(sessionId)) {
    return centerCache.get(sessionId);
  }

  const mergedDetail = detail || null;
  if (mergedDetail) {
    const detailName = getSessionCenterNameValue(mergedDetail);
    const detailCity = getSessionCenterCityValue(mergedDetail) || candidateCity;
    const detailSiteId = getSessionCenterSiteIdValue(mergedDetail) ?? candidateSiteId;
    const detailTestCenterId = getSessionCenterTestCenterIdValue(mergedDetail) ?? candidateTestCenterId;
    const detailAddress = normalizeString(mergedDetail?.test_center?.address || mergedDetail?.address || candidateAddress);

    if (detailName) {
      const result = {
        test_center_id: detailTestCenterId,
        site_id: detailSiteId,
        name: detailName,
        city: detailCity,
        address: detailAddress,
      };
      if (!result.site_id && result.name) {
        const row = await lookupCenterByName(result.name, result.city);
        if (row?.site_id) {
          result.site_id = row.site_id;
          result.city = row.city || result.city;
          result.address = row.address || result.address;
        } else {
          const staticRow = lookupStaticCenterByTestCenterId(result.test_center_id) || lookupStaticCenterByName(result.name);
          if (staticRow) {
            result.site_id = staticRow.site_id;
            result.city = result.city || staticRow.city;
            result.address = result.address || null;
          }
        }
      }
      if (sessionId) centerCache.set(sessionId, result);
      return result;
    }

    const staticRow = lookupStaticCenterByTestCenterId(detailTestCenterId);
    if (detailTestCenterId && staticRow) {
      const result = {
        test_center_id: detailTestCenterId,
        site_id: detailSiteId || staticRow.site_id,
        name: staticRow.name,
        city: detailCity || staticRow.city,
        address: detailAddress,
      };
      if (sessionId) centerCache.set(sessionId, result);
      return result;
    }
  }

  try {
    const response: any = await svpFetch(`/api/v1/individual_labor_space/exam_sessions/${encodeURIComponent(sessionId)}`, { method: "GET", token: svpToken });
    const detailNode = response?.exam_session || response;
    const detailName = getSessionCenterNameValue(detailNode);
    const detailCity = getSessionCenterCityValue(detailNode) || candidateCity;
    const detailSiteId = getSessionCenterSiteIdValue(detailNode) ?? candidateSiteId;
    const detailTestCenterId = getSessionCenterTestCenterIdValue(detailNode) ?? candidateTestCenterId;
    const detailAddress = normalizeString(detailNode?.test_center?.address || detailNode?.address || candidateAddress);

    if (detailName) {
      const result = {
        test_center_id: detailTestCenterId,
        site_id: detailSiteId,
        name: detailName,
        city: detailCity,
        address: detailAddress,
      };
      if (!result.site_id && result.name) {
        const row = await lookupCenterByName(result.name, result.city);
        if (row?.site_id) {
          result.site_id = row.site_id;
          result.city = row.city || result.city;
          result.address = row.address || result.address;
        } else {
          const staticRow = lookupStaticCenterByTestCenterId(result.test_center_id) || lookupStaticCenterByName(result.name);
          if (staticRow) {
            result.site_id = staticRow.site_id;
            result.city = result.city || staticRow.city;
            result.address = result.address || null;
          }
        }
      }
      if (sessionId) centerCache.set(sessionId, result);
      return result;
    }

    const staticRow = lookupStaticCenterByTestCenterId(detailTestCenterId);
    if (detailTestCenterId && staticRow) {
      const result = {
        test_center_id: detailTestCenterId,
        site_id: detailSiteId || staticRow.site_id,
        name: staticRow.name,
        city: detailCity || staticRow.city,
        address: detailAddress,
      };
      if (sessionId) centerCache.set(sessionId, result);
      return result;
    }
  } catch {
    // ignore detail lookup failure
  }

  const city = candidateCity;
  const section = getSessionSectionValue(session);
  const rule = city ? sectionCenterRules[city]?.[section || ""] : null;
  if (rule) {
    const result = {
      test_center_id: rule.test_center_id,
      site_id: rule.site_id,
      name: rule.name,
      city,
      address: null,
    };
    if (sessionId) centerCache.set(sessionId, result);
    return result;
  }

  const result = {
    test_center_id: candidateTestCenterId,
    site_id: candidateSiteId,
    name: city ? `${city} Center` : "Unknown Center",
    city,
    address: candidateAddress,
  };
  if (sessionId) centerCache.set(sessionId, result);
  return result;
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/svp-proxy/, "");
  const query = url.search.replace(/^\?/, "");

  try {
    const { user, svpToken } = await requireAuth(req);

    // ── Available dates (with fallbacks) ──────────────────────
    if (req.method === "GET" && path === "/available-dates") {
      const paths = [
        "/api/v1/individual_labor_space/exam_sessions/available_dates",
        "/api/v1/individual_labor_space/available_dates",
        "/api/v1/individual_labor_space/available-dates",
      ];
      for (let i = 0; i < paths.length; i++) {
        try {
          const data = await svpFetch(buildPath(paths[i], query), { method: "GET", token: svpToken });
          return json(data);
        } catch (err: any) {
          if (err?.statusCode !== 404 || i === paths.length - 1) throw err;
        }
      }
    }

    // ── Exam sessions (enriched with available_seats) ────────
    if (req.method === "GET" && path === "/exam-sessions") {
      const listData: any = await svpFetch(
        buildPath("/api/v1/individual_labor_space/exam_sessions", query),
        { method: "GET", token: svpToken }
      );
      const sessions: any[] = listData?.exam_sessions || [];

      // Always enrich sessions with full detail so test_center.name and seat
      // counts are present even when the list payload omits them.
      if (sessions.length > 0) {
        const enriched = await Promise.all(
          sessions.map(async (s: any) => {
            let detail: any = null;
            try {
              const response: any = await svpFetch(
                `/api/v1/individual_labor_space/exam_sessions/${s.id}`,
                { method: "GET", token: svpToken }
              );
              detail = response?.exam_session || response;
            } catch {
              // ignore detailed session lookup failure
            }
            try {
              const d = detail?.exam_session || detail;
              const mergedTc = { ...(s?.test_center || {}), ...(d?.test_center || {}) };
              const tcid = getSessionTestCenterId({ ...s, ...(d || {}), test_center: mergedTc });
              if (tcid && !mergedTc?.name && !mergedTc?.test_center_name) {
                try {
                  const centerDetail: any = await svpFetch(
                    `/api/v1/individual_labor_space/test_centers/${tcid}`,
                    { method: "GET", token: svpToken }
                  );
                  const center = centerDetail?.test_center || centerDetail?.data?.test_center || centerDetail?.data || centerDetail;
                  Object.assign(mergedTc, center);
                } catch {
                  // Keep exam_session data if the direct test_centers endpoint is unavailable.
                }
              }
              const resolved = await resolveSessionCenter({ ...s, ...(d || {}), test_center: mergedTc }, svpToken, d);
              const test_center = { ...mergedTc, ...resolved };
              return {
                ...s,
                ...(d || {}),
                test_center,
                test_center_name:
                  resolved.name || s?.test_center_name || d?.test_center?.name || d?.test_center_name || test_center?.name,
                available_seats: d?.available_seats ?? s?.available_seats ?? d?.seats_available ?? null,
                total_seats: d?.total_seats ?? s?.total_seats ?? d?.seats_total ?? null,
              };
            } catch {
              return s;
            }
          })
        );
        listData.exam_sessions = enriched;
      }

      return json(listData);
    }

    if (req.method === "GET" && path.startsWith("/exam-session/")) {
      const match = path.match(/^\/exam-session\/([^/]+)$/);
      if (match) {
        const response: any = await svpFetch(
          buildPath(`/api/v1/individual_labor_space/exam_sessions/${match[1]}`, query),
          { method: "GET", token: svpToken }
        );
        const examSession = response?.exam_session || response;
        const resolved = await resolveSessionCenter(examSession, svpToken, examSession);
        const test_center = { ...(examSession?.test_center || {}), ...resolved };
        const normalized = {
          ...examSession,
          test_center,
          test_center_name: resolved.name || examSession?.test_center_name || examSession?.test_center?.name || test_center?.name,
        };
        return json(response?.exam_session ? { ...response, exam_session: normalized } : normalized);
      }
    }

    // ── User balance (auto-detect SVP user ID) ───────────────
    if (req.method === "GET" && path === "/user-balance") {
      const supabase = getSupabase();
      const { data: session } = await supabase
        .from("svp_sessions")
        .select("*, svp_users(*)")
        .eq("id", user.sid as string)
        .single();

      const svpUser = (session as any)?.svp_users;
      const tokenPayload = decodeJwtPayload(svpToken);
      const svpUserId = Number(
        svpUser?.svp_user_id || tokenPayload?.user_id || tokenPayload?.userId || tokenPayload?.uid || 0
      );
      if (!svpUserId) throw { statusCode: 400, message: "Missing svpUserId" };

      try {
        return json(await svpFetch(buildPath(`/api/v1/users/${svpUserId}/balance`, query), { method: "GET", token: svpToken }));
      } catch (err: any) {
        if (err?.statusCode === 404) {
          return json(await svpFetch(buildPath(`/api/v1/individual_labor_space/user_balance/${svpUserId}`, query), { method: "GET", token: svpToken }));
        }
        throw err;
      }
    }

    // ── Ticket PDF ────────────────────────────────────────────
    const pdfMatch = path.match(/^\/tickets\/([^/]+)\/show-pdf$/);
    if (req.method === "GET" && pdfMatch) {
      const upstream = await svpFetchRaw(
        buildPath(`/api/v1/individual_labor_space/tickets/${pdfMatch[1]}/show_pdf`, query),
        svpToken
      );
      if (!upstream.ok) {
        const text = await upstream.text();
        let details;
        try { details = JSON.parse(text); } catch { details = { raw: text }; }
        throw { statusCode: upstream.status, message: `SVP request failed: ${upstream.status}`, details };
      }
      const contentType = upstream.headers.get("content-type") || "application/pdf";
      const disposition = upstream.headers.get("content-disposition");
      const headers: Record<string, string> = { ...corsHeaders, "Content-Type": contentType };
      if (disposition) headers["Content-Disposition"] = disposition;
      return new Response(await upstream.arrayBuffer(), { status: 200, headers });
    }

    // ── Standard routes ──────────────────────────────────────
    for (const route of routes) {
      if (req.method !== route.method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      const svpPath = typeof route.svpPath === "function" ? route.svpPath(match, query) : route.svpPath;
      const body = route.bodyForward ? await req.json().catch(() => ({})) : undefined;
      const data = await svpFetch(buildPath(svpPath, query), { method: route.method, token: svpToken, body });
      return json(data);
    }

    return json({ error: "Not found" }, 404);
  } catch (err: any) {
    const status = err?.statusCode || 500;
    return json({ message: err?.message || "Server error", details: err?.details }, status);
  }
});
