

## Problem

The login flow fails because the Railway backend's `CORS_ORIGINS` environment variable does not include the Lovable preview domain (`https://id-preview--d6ab8a58-70d1-4c61-afd1-f980a1466f30.lovable.app`). The backend's `isAllowedOrigin()` function rejects the request, blocking the preflight OPTIONS response.

The backend code itself already supports wildcard-style Vercel previews but has no equivalent for Lovable domains. Since we cannot change Railway environment variables from here, we need to update the backend code to also allow `*.lovable.app` and `*.lovableproject.com` origins.

## Plan

### Step 1: Update CORS origin check in `backend/src/index.js`

Add Lovable preview domains to the `isAllowedOrigin()` function so requests from any `*.lovable.app` or `*.lovableproject.com` subdomain are automatically allowed — similar to the existing Vercel logic.

```js
// After the Vercel check, add:
try {
  const { hostname, protocol } = new URL(origin);
  if (protocol === 'https:' && 
      (hostname.endsWith('.lovable.app') || hostname.endsWith('.lovableproject.com'))) {
    return true;
  }
} catch {}
```

### Step 2: Update `.env.example` with note

Add a comment noting the Lovable domains are auto-allowed in code.

### Important Note

After updating this file, you must **redeploy the backend on Railway** for the CORS change to take effect. The frontend code does not need any changes — it's already configured correctly.

