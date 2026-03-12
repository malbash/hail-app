import crypto from "crypto";

function safeEqual(a = "", b = "") {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function createToken(username, secret) {
  const ts = Date.now().toString();
  const payload = `${username}:${ts}`;
  const sig = sign(payload, secret);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const APP_USERNAME = process.env.APP_USERNAME;
  const APP_PASSWORD = process.env.APP_PASSWORD;
  const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET;

  if (!APP_USERNAME || !APP_PASSWORD || !APP_SESSION_SECRET) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing auth environment variables.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { username, password } = await req.json();

    if (!safeEqual(username, APP_USERNAME) || !safeEqual(password, APP_PASSWORD)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid credentials." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const token = createToken(username, APP_SESSION_SECRET);
    const isProd = process.env.NODE_ENV === "production";

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `hail_auth=${token}; Path=/; HttpOnly; ${isProd ? "Secure;" : ""} SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Login failed.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
