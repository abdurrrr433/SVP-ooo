import { Router } from 'express';

import { requireAuth } from '../lib/authMiddleware.js';
import { decryptString } from '../lib/crypto.js';
import { prisma } from '../lib/prisma.js';
import { svpRequest } from '../lib/svpClient.js';

const router = Router();

router.use(requireAuth);

async function getSvpToken(req) {
  const sessionId = req.user?.sid;
  if (!sessionId) {
    const err = new Error('Missing session id on access token');
    err.statusCode = 401;
    throw err;
  }

  const session = await prisma.session.findUnique({ where: { id: String(sessionId) } });
  if (!session || session.revokedAt) {
    const err = new Error('Session not found or revoked');
    err.statusCode = 401;
    throw err;
  }

  if (!session.svpAccessEnc) {
    const err = new Error('Missing SVP access token on session');
    err.statusCode = 401;
    throw err;
  }

  return decryptString(session.svpAccessEnc);
}

async function getActiveSession(req, { includeUser = false } = {}) {
  const sessionId = req.user?.sid;
  if (!sessionId) {
    const err = new Error('Missing session id on access token');
    err.statusCode = 401;
    throw err;
  }

  const session = await prisma.session.findUnique({
    where: { id: String(sessionId) },
    include: includeUser ? { user: true } : undefined,
  });
  if (!session || session.revokedAt) {
    const err = new Error('Session not found or revoked');
    err.statusCode = 401;
    throw err;
  }
  if (!session.svpAccessEnc) {
    const err = new Error('Missing SVP access token on session');
    err.statusCode = 401;
    throw err;
  }
  return session;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function buildPath(basePath, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (key === 'locale') return;
    params.set(key, String(value));
  });

  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSessionCenterNameValue(session) {
  return normalizeString(
    session?.test_center?.test_center_name || session?.test_center?.name || session?.test_center_name
  );
}

function getSessionCenterCityValue(session) {
  return normalizeString(
    session?.test_center?.test_center_city || session?.test_center?.city || session?.city || session?.site_city
  );
}

function getSessionCenterSiteIdValue(session) {
  return toPositiveNumber(session?.test_center?.site_id ?? session?.site_id);
}

function getSessionCenterTestCenterIdValue(session) {
  return toPositiveNumber(session?.test_center?.test_center_id ?? session?.test_center?.id);
}

function getSessionSectionValue(session) {
  return normalizeString(session?.section || session?.require_section || session?.section_name);
}

const centerCache = new Map();
const sectionCenterRules = {
  Dhaka: {
    cbt: { name: 'Prometric Dhaka — Banani', test_center_id: 9012, site_id: 50231 },
    practical: { name: 'Prometric Dhaka — Uttara', test_center_id: 9013, site_id: 50244 },
  },
};

async function resolveSessionCenter(session, token, detail) {
  const sessionId = String(session?.id || '');
  const candidateName = getSessionCenterNameValue(session);
  const candidateCity = getSessionCenterCityValue(session);
  const candidateSiteId = getSessionCenterSiteIdValue(session);
  const candidateTestCenterId = getSessionCenterTestCenterIdValue(session);
  const candidateAddress = normalizeString(
    session?.test_center?.address || session?.address || session?.test_center?.address
  );

  if (candidateName) {
    const result = {
      test_center_id: candidateTestCenterId,
      site_id: candidateSiteId,
      name: candidateName,
      city: candidateCity,
      address: candidateAddress,
    };

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
    const detailAddress = normalizeString(
      mergedDetail?.test_center?.address || mergedDetail?.address || candidateAddress
    );

    if (detailName) {
      const result = {
        test_center_id: detailTestCenterId,
        site_id: detailSiteId,
        name: detailName,
        city: detailCity,
        address: detailAddress,
      };
      if (sessionId) centerCache.set(sessionId, result);
      return result;
    }
  }

  try {
    const response = await svpRequest(buildPath(`/api/v1/individual_labor_space/exam_sessions/${sessionId}`, {}), {
      method: 'GET',
      token,
    });
    const detailNode = response?.exam_session || response;
    const detailName = getSessionCenterNameValue(detailNode);
    const detailCity = getSessionCenterCityValue(detailNode) || candidateCity;
    const detailSiteId = getSessionCenterSiteIdValue(detailNode) ?? candidateSiteId;
    const detailTestCenterId = getSessionCenterTestCenterIdValue(detailNode) ?? candidateTestCenterId;
    const detailAddress = normalizeString(
      detailNode?.test_center?.address || detailNode?.address || candidateAddress
    );

    if (detailName) {
      const result = {
        test_center_id: detailTestCenterId,
        site_id: detailSiteId,
        name: detailName,
        city: detailCity,
        address: detailAddress,
      };
      if (sessionId) centerCache.set(sessionId, result);
      return result;
    }
  } catch {
    // ignore detailed session lookup failure
  }

  const city = candidateCity;
  const section = getSessionSectionValue(session);
  const rule = city ? sectionCenterRules[city]?.[section || ''] : null;
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
    name: city ? `${city} Center` : 'Unknown Center',
    city,
    address: candidateAddress,
  };
  if (sessionId) centerCache.set(sessionId, result);
  return result;
}

async function forward(req, method, basePath, body) {
  const token = await getSvpToken(req);
  return svpRequest(buildPath(basePath, req.query), { method, token, body });
}

router.get('/permissions', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/permissions'));
  } catch (error) {
    next(error);
  }
});

router.get('/occupations', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/occupations'));
  } catch (error) {
    next(error);
  }
});

router.get('/exam-constraints', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/exam_constraints'));
  } catch (error) {
    next(error);
  }
});

router.get('/available-dates', async (req, res, next) => {
  try {
    return res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/exam_sessions/available_dates'));
  } catch (error) {
    // Retry older path variants for compatibility.
    if (error?.statusCode === 404) {
      try {
        return res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/available_dates'));
      } catch (error2) {
        if (error2?.statusCode === 404) {
          try {
            return res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/available-dates'));
          } catch (error3) {
            return next(error3);
          }
        }
        return next(error2);
      }
    }
    next(error);
  }
});

router.get('/exam-sessions', async (req, res, next) => {
  try {
    const token = await getSvpToken(req);
    const listData = await svpRequest(buildPath('/api/v1/individual_labor_space/exam_sessions', req.query), {
      method: 'GET',
      token,
    });
    const sessions = listData?.exam_sessions || [];

    if (sessions.length > 0) {
      const enriched = await Promise.all(
        sessions.map(async (s) => {
          let detail = null;
          try {
            const response = await svpRequest(
              buildPath(`/api/v1/individual_labor_space/exam_sessions/${s.id}`, {}),
              { method: 'GET', token }
            );
            detail = response?.exam_session || response;
          } catch {
            // ignore detailed session lookup failure
          }

          const mergedTc = { ...(s?.test_center || {}), ...(detail?.test_center || {}) };
          const resolved = await resolveSessionCenter({ ...s, ...(detail || {}), test_center: mergedTc }, token, detail);
          const test_center = { ...mergedTc, ...resolved };
          return {
            ...s,
            ...(detail || {}),
            test_center,
            test_center_name:
              resolved.name || s?.test_center_name || detail?.test_center?.name || detail?.test_center_name || test_center?.name,
            available_seats: detail?.available_seats ?? s?.available_seats ?? detail?.seats_available ?? null,
            total_seats: detail?.total_seats ?? s?.total_seats ?? detail?.seats_total ?? null,
          };
        })
      );
      listData.exam_sessions = enriched;
    }

    res.json(listData);
  } catch (error) {
    next(error);
  }
});

router.get('/exam-session/:id', async (req, res, next) => {
  try {
    const token = await getSvpToken(req);
    const response = await svpRequest(
      buildPath(`/api/v1/individual_labor_space/exam_sessions/${req.params.id}`, req.query),
      { method: 'GET', token }
    );
    const examSession = response?.exam_session || response;
    const resolved = await resolveSessionCenter(examSession, token, examSession);
    const test_center = { ...(examSession?.test_center || {}), ...resolved };
    const normalized = {
      ...examSession,
      test_center,
      test_center_name: resolved.name || examSession?.test_center_name || examSession?.test_center?.name || test_center?.name,
    };
    res.json(response?.exam_session ? { ...response, exam_session: normalized } : normalized);
  } catch (error) {
    next(error);
  }
});

router.get('/exam-reservations', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/exam_reservations'));
  } catch (error) {
    next(error);
  }
});

router.get('/exam-reservations/:id', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', `/api/v1/individual_labor_space/exam_reservations/${req.params.id}`));
  } catch (error) {
    next(error);
  }
});

router.post('/temporary-seats', async (req, res, next) => {
  try {
    res.json(await forward(req, 'POST', '/api/v1/individual_labor_space/temporary_seats', req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/exam-reservations', async (req, res, next) => {
  try {
    res.json(await forward(req, 'POST', '/api/v1/individual_labor_space/exam_reservations', req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/reservation-credits/use', async (req, res, next) => {
  try {
    res.json(await forward(req, 'POST', '/api/v1/individual_labor_space/reservation_credits/use', req.body));
  } catch (error) {
    next(error);
  }
});

router.get('/certificate-price', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/certificate_price'));
  } catch (error) {
    next(error);
  }
});

router.get('/payments-validate-pending', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/payments/validate_pending'));
  } catch (error) {
    next(error);
  }
});

router.post('/payments', async (req, res, next) => {
  try {
    res.json(await forward(req, 'POST', '/api/v1/individual_labor_space/payments', req.body));
  } catch (error) {
    next(error);
  }
});

router.get('/payments/:id', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', `/api/v1/individual_labor_space/payments/${req.params.id}`));
  } catch (error) {
    next(error);
  }
});

router.put('/payments/:id', async (req, res, next) => {
  try {
    res.json(await forward(req, 'PUT', `/api/v1/individual_labor_space/payments/${req.params.id}`, req.body));
  } catch (error) {
    next(error);
  }
});

router.get('/feature-flags', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/feature_flags'));
  } catch (error) {
    next(error);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', '/api/v1/individual_labor_space/notifications'));
  } catch (error) {
    next(error);
  }
});

router.get('/user-balance/:svpUserId', async (req, res, next) => {
  try {
    res.json(await forward(req, 'GET', `/api/v1/individual_labor_space/user_balance/${req.params.svpUserId}`));
  } catch (error) {
    next(error);
  }
});

router.get('/user-balance', async (req, res, next) => {
  try {
    const session = await getActiveSession(req, { includeUser: true });
    const token = decryptString(session.svpAccessEnc);
    const tokenPayload = decodeJwtPayload(token);
    const svpUserId = Number(
      session?.user?.svpUserId ||
      tokenPayload?.user_id ||
      tokenPayload?.userId ||
      tokenPayload?.uid ||
      0
    );
    if (!svpUserId) {
      const err = new Error('Missing svpUserId for current user');
      err.statusCode = 400;
      throw err;
    }

    try {
      return res.json(
        await svpRequest(buildPath(`/api/v1/users/${svpUserId}/balance`, req.query), {
          method: 'GET',
          token,
        })
      );
    } catch (error) {
      if (error?.statusCode === 404) {
        return res.json(
          await svpRequest(buildPath(`/api/v1/individual_labor_space/user_balance/${svpUserId}`, req.query), {
            method: 'GET',
            token,
          })
        );
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/tickets/:reservationId/show-pdf', async (req, res, next) => {
  try {
    const token = await getSvpToken(req);
    const base = process.env.SVP_BASE_URL;
    const locale = process.env.SVP_LOCALE || 'en';
    const svpOrigin = process.env.SVP_WEB_ORIGIN || 'https://svp-international.pacc.sa';
    const svpReferer = process.env.SVP_WEB_REFERER || `${svpOrigin}/`;
    const svpUserAgent =
      process.env.SVP_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

    const path = buildPath(`/api/v1/individual_labor_space/tickets/${req.params.reservationId}/show_pdf`, req.query);
    const url = `${base}${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}`;

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${token}`,
        Origin: svpOrigin,
        Referer: svpReferer,
        'User-Agent': svpUserAgent,
      },
    });

    const contentType = upstream.headers.get('content-type') || '';
    const disposition = upstream.headers.get('content-disposition');
    const status = upstream.status;
    const buffer = Buffer.from(await upstream.arrayBuffer());

    if (!upstream.ok) {
      let details = null;
      try {
        details = JSON.parse(buffer.toString('utf8'));
      } catch {
        details = { raw: buffer.toString('utf8') };
      }
      const err = new Error(`SVP request failed: ${status}`);
      err.statusCode = status;
      err.details = details;
      throw err;
    }

    if (contentType) res.setHeader('Content-Type', contentType);
    if (disposition) res.setHeader('Content-Disposition', disposition);
    return res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
});

export const svpRouter = router;
