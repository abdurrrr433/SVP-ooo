import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET_RAW = Deno.env.get("JWT_ACCESS_SECRET") || "access-backend-secret-key-change-me";

async function getJwtKey() {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw", encoder.encode(JWT_SECRET_RAW),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function publicAccount(a: any) {
  return {
    id: a.id, name: a.name, email: a.email, role: a.role, status: a.status,
    agency_id: a.agency_id, created_by_id: a.created_by_id,
    created_at: a.created_at, updated_at: a.updated_at,
  };
}

async function getAuth(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const key = await getJwtKey();
    return await verify(token, key) as { sub: string; role: string };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await getAuth(req);
  if (!auth || auth.role !== "AGENCY") {
    return new Response(JSON.stringify({ message: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/access-agency/, "");
  const supabase = getSupabase();

  try {
    // POST /users
    if (path === "/users" && req.method === "POST") {
      const { name, email, password, status } = await req.json();
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ message: "name, email, password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase.from("accounts").select("id").eq("email", email.toLowerCase()).single();
      if (existing) {
        return new Response(JSON.stringify({ message: "Email already in use" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hash = bcrypt.hashSync(password);
      const { data: account, error } = await supabase.from("accounts").insert({
        name, email: email.toLowerCase(), password: hash,
        role: "USER", status: status || "PENDING",
        agency_id: auth.sub, created_by_id: auth.sub,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ message: "User created", user: publicAccount(account) }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /users
    if (path === "/users" && req.method === "GET") {
      const { data: users, error } = await supabase
        .from("accounts").select("*")
        .eq("agency_id", auth.sub).eq("role", "USER")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ users: (users || []).map(publicAccount) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
