import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET_RAW = Deno.env.get("JWT_ACCESS_SECRET") || "access-backend-secret-key-change-me";

// Create crypto key for JWT
async function getJwtKey() {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET_RAW),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function publicAccount(account: any) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
    agency_id: account.agency_id,
    created_by_id: account.created_by_id,
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

async function signToken(payload: { sub: string; role: string }) {
  const key = await getJwtKey();
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp: getNumericDate(7 * 24 * 60 * 60) },
    key
  );
}

async function verifyToken(token: string) {
  const key = await getJwtKey();
  return await verify(token, key);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/access-auth/, "");
  const supabase = getSupabase();

  try {
    // POST /login
    if (path === "/login" && req.method === "POST") {
      const { email, password } = await req.json();
      if (!email || !password) {
        return new Response(JSON.stringify({ message: "Email and password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("email", email.toLowerCase())
        .single();

      if (error || !account) {
        return new Response(JSON.stringify({ message: "Invalid credentials" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const matches = await bcrypt.compare(password, account.password);
      if (!matches) {
        return new Response(JSON.stringify({ message: "Invalid credentials" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (account.status !== "ACTIVE") {
        return new Response(JSON.stringify({ message: `Account is ${account.status.toLowerCase()}` }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = await signToken({ sub: account.id, role: account.role });

      return new Response(JSON.stringify({
        message: "Login successful",
        accessToken: token,
        user: publicAccount(account),
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /logout
    if (path === "/logout" && req.method === "POST") {
      return new Response(JSON.stringify({ message: "Logout successful" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /me
    if (path === "/me" && req.method === "GET") {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = await verifyToken(token);
      const { data: account, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", payload.sub as string)
        .single();

      if (error || !account) {
        return new Response(JSON.stringify({ message: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: publicAccount(account) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /refresh
    if (path === "/refresh" && req.method === "POST") {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = await verifyToken(token);
      const { data: account } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", payload.sub as string)
        .single();

      if (!account || account.status !== "ACTIVE") {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newToken = await signToken({ sub: account.id, role: account.role });
      return new Response(JSON.stringify({
        message: "Token refreshed",
        accessToken: newToken,
        user: publicAccount(account),
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /bootstrap - create default admin
    if (path === "/bootstrap" && req.method === "POST") {
      const { name, email, password } = await req.json();
      const adminEmail = (email || "admin@example.com").toLowerCase();
      const adminName = name || "Super Admin";
      const adminPassword = password || "12345678";

      const { data: existing } = await supabase
        .from("accounts")
        .select("id")
        .eq("email", adminEmail)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ message: "Admin already exists" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hash = await bcrypt.hash(adminPassword);
      const { data: admin, error } = await supabase
        .from("accounts")
        .insert({
          name: adminName,
          email: adminEmail,
          password: hash,
          role: "ADMIN",
          status: "ACTIVE",
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ message: "Failed to create admin", error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Admin created", admin: publicAccount(admin) }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
