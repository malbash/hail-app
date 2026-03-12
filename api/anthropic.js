import crypto from "crypto";

export const config = { maxDuration: 300 };

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    String(cookieHeader)
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return [part.slice(0, idx), part.slice(idx + 1)];
      })
  );
}

function verifyToken(token, secret) {
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;

    const [username, ts, sig] = parts;
    if (!username || !ts || !sig) return false;

    const payload = `${username}:${ts}`;
    const expected = sign(payload, secret);

    if (sig !== expected) return false;

    const ageMs = Date.now() - Number(ts);
    const maxAgeMs = 1000 * 60 * 60 * 24 * 14;
    if (Number.isNaN(ageMs) || ageMs > maxAgeMs) return false;

    return true;
  } catch {
    return false;
  }
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
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const sessionSecret = process.env.APP_SESSION_SECRET;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: "Missing ANTHROPIC_API_KEY." } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!sessionSecret) {
    return new Response(
      JSON.stringify({ error: { message: "Missing APP_SESSION_SECRET." } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const cookies = parseCookies(req.headers.get("cookie") || "");
  const token = cookies.hail_auth;

  if (!verifyToken(token, sessionSecret)) {
    return new Response(
      JSON.stringify({ error: { message: "Unauthorized." } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    let upstream;
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstream.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({
          error: {
            message: `Anthropic API returned unexpected response: ${text.slice(0, 200)}`,
          },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err?.name === "AbortError"
        ? "Anthropic request timed out before Vercel could complete it. Try again or reduce request complexity."
        : err.message || "Anthropic proxy failed.";

    return new Response(
      JSON.stringify({ error: { message } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}import crypto from "crypto";

export const config = { maxDuration: 300 };

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    String(cookieHeader)
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return [part.slice(0, idx), part.slice(idx + 1)];
      })
  );
}

function verifyToken(token, secret) {
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;

    const [username, ts, sig] = parts;
    if (!username || !ts || !sig) return false;

    const payload = `${username}:${ts}`;
    const expected = sign(payload, secret);

    if (sig !== expected) return false;

    const ageMs = Date.now() - Number(ts);
    const maxAgeMs = 1000 * 60 * 60 * 24 * 14;
    if (Number.isNaN(ageMs) || ageMs > maxAgeMs) return false;

    return true;
  } catch {
    return false;
  }
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
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const sessionSecret = process.env.APP_SESSION_SECRET;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: "Missing ANTHROPIC_API_KEY." } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!sessionSecret) {
    return new Response(
      JSON.stringify({ error: { message: "Missing APP_SESSION_SECRET." } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const cookies = parseCookies(req.headers.get("cookie") || "");
  const token = cookies.hail_auth;

  if (!verifyToken(token, sessionSecret)) {
    return new Response(
      JSON.stringify({ error: { message: "Unauthorized." } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    let upstream;
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstream.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({
          error: {
            message: `Anthropic API returned unexpected response: ${text.slice(0, 200)}`,
          },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err?.name === "AbortError"
        ? "Anthropic request timed out before Vercel could complete it. Try again or reduce request complexity."
        : err.message || "Anthropic proxy failed.";

    return new Response(
      JSON.stringify({ error: { message } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
