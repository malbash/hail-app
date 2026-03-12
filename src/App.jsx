import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_W = 794;
const PAGE_H = 1123;

const theme = {
  bg: "#03070f",
  pageBg: "#03070f",
  headerBg: "#07101d",
  panel: "#050b14",
  border: "#17325f",
  borderSoft: "#102240",
  text: "#eef3ff",
  muted: "#7ea2df",
  muted2: "#4d6797",
  blue: "#76a8ff",
  blueBright: "#8db7ff",
  button: "#5e86f0",
  buttonText: "#f8fbff",
  riskBg: "#572a00",
  riskBorder: "#b65c00",
  riskText: "#ffb04d",
  dangerText: "#ff8b47",
  purpleText: "#b395ff",
  white: "#ffffff",
};

const systemPrompt = `You are a severe weather research assistant specializing in hail and storm data.
When given an address, search reliable weather/storm sources and return ONLY valid JSON with this exact structure:

{
  "location": {
    "address": "...",
    "county": "...",
    "state": "...",
    "lat": "...",
    "lon": "..."
  },
  "summary": "1-2 sentence plain-English summary of hail/severe weather risk for this area",
  "riskLevel": "Low" | "Moderate" | "High" | "Very High",
  "hailEvents": [
    {
      "date": "YYYY-MM-DD",
      "size": "X.XX inches (description)",
      "location": "city/area",
      "injuries": 0,
      "deaths": 0,
      "propertyDamage": "$X,XXX or N/A",
      "source": "NOAA Storm Events"
    }
  ],
  "otherEvents": [
    {
      "date": "YYYY-MM-DD",
      "type": "Tornado | Thunderstorm Wind | Flash Flood | Hurricane | Tropical Storm | etc",
      "description": "brief description",
      "damage": "$X,XXX or N/A"
    }
  ],
  "stats": {
    "totalHailEvents": 0,
    "largestHailSize": "X.XX inches",
    "avgEventsPerYear": "X.X",
    "mostActiveMonth": "Month",
    "yearsSearched": "YYYY-YYYY"
  },
  "sources": ["url1", "url2"]
}`;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ensureFonts() {
  if (!document.getElementById("swi-fonts")) {
    const link = document.createElement("link");
    link.id = "swi-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }
}

async function parseResponseJson(response, label = "API") {
  const text = await response.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned invalid JSON: ${text.slice(0, 180)}`);
  }

  return data;
}

function extractJsonPayload(data) {
  const textBlocks = (data?.content || []).filter((b) => b.type === "text");
  const raw = textBlocks
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/gi, "")
    .trim();

  if (!raw) return null;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const candidate = raw.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  return String(dateStr).trim();
}

function normalizeResult(result, address) {
  if (!result) return null;

  const years = result?.stats?.yearsSearched || `${CURRENT_YEAR - 5}-${CURRENT_YEAR}`;

  return {
    location: {
      address: result?.location?.address || address || "N/A",
      county: result?.location?.county || "Unknown County",
      state: result?.location?.state || "Unknown State",
      lat: result?.location?.lat || "",
      lon: result?.location?.lon || "",
    },
    summary: result?.summary || "No summary was returned. Please rerun the query.",
    riskLevel: result?.riskLevel || "Moderate",
    hailEvents: Array.isArray(result?.hailEvents) ? result.hailEvents : [],
    otherEvents: Array.isArray(result?.otherEvents) ? result.otherEvents : [],
    stats: {
      totalHailEvents: result?.stats?.totalHailEvents ?? 0,
      largestHailSize: result?.stats?.largestHailSize || "N/A",
      avgEventsPerYear: result?.stats?.avgEventsPerYear || "0.0",
      mostActiveMonth: result?.stats?.mostActiveMonth || "N/A",
      yearsSearched: years,
    },
    sources: Array.isArray(result?.sources) ? result.sources : [],
  };
}

function getRiskStyle(risk) {
  switch (risk) {
    case "Low":
      return { bg: "#102713", border: "#2f7a36", text: "#8ef49c" };
    case "Moderate":
      return { bg: "#433000", border: "#b98700", text: "#ffd25a" };
    case "High":
      return { bg: theme.riskBg, border: theme.riskBorder, text: theme.riskText };
    case "Very High":
      return { bg: "#4a0f0f", border: "#af3030", text: "#ff8177" };
    default:
      return { bg: theme.riskBg, border: theme.riskBorder, text: theme.riskText };
  }
}

function LogoMark({ large = false }) {
  return (
    <img
      src="/trinity-logo.png"
      alt="Trinity Engineering"
      style={{
        width: large ? 180 : 118,
        height: large ? 86 : 54,
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

function AppHeader({ onLogout }) {
  return (
    <div
      style={{
        background: theme.headerBg,
        borderBottom: `1px solid ${theme.borderSoft}`,
        padding: "14px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <LogoMark />
          <div>
            <div
              style={{
                color: theme.white,
                fontWeight: 800,
                fontSize: 21,
                letterSpacing: 0.5,
                fontFamily: "Inter, Arial, sans-serif",
              }}
            >
              SEVERE WEATHER INTELLIGENCE
            </div>
            <div
              style={{
                color: theme.muted2,
                fontSize: 11,
                letterSpacing: 3,
                textTransform: "uppercase",
                fontFamily: '"IBM Plex Mono", monospace',
                marginTop: 4,
              }}
            >
              NOAA storm events database · 5-year lookback
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              color: theme.muted2,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            Data Source: NOAA NWS
          </div>
          <div
            style={{
              color: theme.muted2,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            NCEI Storm Events DB
          </div>
          <button
            onClick={onLogout}
            style={{
              marginTop: 10,
              background: "transparent",
              color: theme.blue,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ username, password, setUsername, setPassword, onLogin, loading, error }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <LogoMark large />
        </div>

        <div
          style={{
            textAlign: "center",
            fontWeight: 800,
            fontSize: 24,
            color: theme.white,
            marginBottom: 6,
          }}
        >
          Severe Weather Intelligence
        </div>

        <div
          style={{
            textAlign: "center",
            color: theme.muted2,
            fontSize: 12,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontFamily: '"IBM Plex Mono", monospace',
            marginBottom: 22,
          }}
        >
          Authorized access only
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          style={loginInputStyle}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLogin()}
          placeholder="Password"
          style={{ ...loginInputStyle, marginTop: 12 }}
        />

        {error ? (
          <div
            style={{
              marginTop: 12,
              color: "#ff9f9f",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          onClick={onLogin}
          disabled={loading}
          style={{
            marginTop: 18,
            width: "100%",
            border: "none",
            borderRadius: 10,
            padding: "13px 16px",
            background: theme.button,
            color: theme.buttonText,
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 0 24px rgba(118,168,255,0.18)",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </div>
  );
}

const loginInputStyle = {
  width: "100%",
  background: "#02060d",
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: "13px 14px",
  fontSize: 14,
  outline: "none",
};

function SectionLabel({ children }) {
  return (
    <div
      style={{
        color: theme.muted2,
        fontSize: 10,
        letterSpacing: 3.2,
        textTransform: "uppercase",
        fontFamily: '"IBM Plex Mono", monospace',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Panel({ children, style = {} }) {
  return (
    <div
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SearchPanel({ address, setAddress, onLookup, loading }) {
  return (
    <Panel style={{ marginBottom: 18 }}>
      <SectionLabel>Property Address Lookup</SectionLabel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 170px",
          gap: 14,
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLookup()}
          placeholder="53 Angus Run, Seneca, SC"
          style={{
            background: "#01050b",
            color: theme.blueBright,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: "14px 18px",
            fontSize: 15,
            outline: "none",
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        />

        <button
          onClick={onLookup}
          disabled={loading}
          style={{
            border: "none",
            borderRadius: 8,
            background: theme.button,
            color: theme.buttonText,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 0 28px rgba(118,168,255,0.15)",
            letterSpacing: 1,
          }}
        >
          {loading ? "RUNNING..." : "RUN QUERY"}
        </button>
      </div>
    </Panel>
  );
}

function PdfPageShell({ children, showTopHeader = false }) {
  return (
    <div
      style={{
        width: PAGE_W,
        height: PAGE_H,
        background: theme.pageBg,
        color: theme.text,
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      {showTopHeader ? (
        <div
          style={{
            height: 92,
            background: theme.headerBg,
            borderBottom: `1px solid ${theme.borderSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px 10px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <LogoMark />
            <div>
              <div
                style={{
                  color: theme.white,
                  fontWeight: 800,
                  fontSize: 19,
                  letterSpacing: 0.4,
                }}
              >
                SEVERE WEATHER INTELLIGENCE
              </div>
              <div
                style={{
                  color: theme.muted2,
                  fontSize: 9.5,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  fontFamily: '"IBM Plex Mono", monospace',
                  marginTop: 5,
                }}
              >
                NOAA storm events database · 5-year lookback
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: "right",
              color: theme.muted2,
              fontSize: 9,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontFamily: '"IBM Plex Mono", monospace',
              lineHeight: 1.35,
            }}
          >
            <div>Data Source: NOAA NWS</div>
            <div>NCEI Storm Events DB</div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          padding: showTopHeader ? "18px 22px 18px 22px" : "20px 22px 18px 22px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AddressLookupBand({ address }) {
  return (
    <Panel style={{ marginBottom: 18, paddingBottom: 16 }}>
      <SectionLabel>Property Address Lookup</SectionLabel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 160px",
          gap: 12,
        }}
      >
        <div
          style={{
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            background: "#01050b",
            color: theme.blueBright,
            padding: "0 16px",
            fontSize: 14,
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {address || "N/A"}
        </div>

        <div
          style={{
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: theme.button,
            color: theme.buttonText,
            fontWeight: 800,
            letterSpacing: 1,
            boxShadow: "0 0 22px rgba(118,168,255,0.12)",
          }}
        >
          RUN QUERY
        </div>
      </div>
    </Panel>
  );
}

function SummaryCards({ data }) {
  const risk = getRiskStyle(data.riskLevel);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 18,
        marginBottom: 18,
      }}
    >
      <Panel>
        <SectionLabel>Location Identified</SectionLabel>
        <div
          style={{
            color: theme.blueBright,
            fontWeight: 800,
            fontSize: 17,
            lineHeight: 1.25,
            marginBottom: 8,
          }}
        >
          {data.location.county}, {data.location.state}
        </div>
        <div
          style={{
            color: theme.muted,
            fontSize: 13,
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {data.location.address}
        </div>
      </Panel>

      <div
        style={{
          background: risk.bg,
          border: `1px solid ${risk.border}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <SectionLabel>Hail Risk Assessment</SectionLabel>
        <div
          style={{
            color: risk.text,
            fontWeight: 800,
            fontSize: 22,
            marginBottom: 8,
          }}
        >
          {data.riskLevel}
        </div>
        <div
          style={{
            color: "#d5b07a",
            fontSize: 13,
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {data.stats.yearsSearched} · {data.stats.totalHailEvents} events found
        </div>
      </div>
    </div>
  );
}

function WeatherSummary({ text }) {
  return (
    <Panel style={{ marginBottom: 18 }}>
      <SectionLabel>Weather Summary</SectionLabel>
      <div
        style={{
          color: theme.text,
          fontSize: 14,
          lineHeight: 1.9,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>
    </Panel>
  );
}

function StatsGrid({ stats }) {
  const items = [
    { label: "Total Hail Events", value: stats.totalHailEvents },
    { label: "Largest Hail", value: stats.largestHailSize },
    { label: "Avg / Year", value: stats.avgEventsPerYear },
    { label: "Most Active Month", value: stats.mostActiveMonth },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {items.map((item) => (
        <Panel key={item.label} style={{ padding: "14px 14px 16px 14px" }}>
          <div
            style={{
              color: theme.muted2,
              fontSize: 10,
              letterSpacing: 2.6,
              textTransform: "uppercase",
              fontFamily: '"IBM Plex Mono", monospace',
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              color: theme.blueBright,
              textAlign: "center",
              fontSize: 16,
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            {item.value}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function TableShell({ title, children }) {
  return (
    <div
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          padding: "16px 18px 13px 18px",
          borderBottom: `1px solid ${theme.borderSoft}`,
          color: theme.muted2,
          fontSize: 10,
          letterSpacing: 3.2,
          textTransform: "uppercase",
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function TableHeader({ columns }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns.map((c) => c.width).join(" "),
        padding: "10px 18px",
        borderBottom: `1px solid ${theme.borderSoft}`,
        color: theme.muted,
        fontSize: 10,
        letterSpacing: 1.8,
        textTransform: "uppercase",
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    >
      {columns.map((c) => (
        <div key={c.key}>{c.label}</div>
      ))}
    </div>
  );
}

const monoCellStyle = {
  fontFamily: '"IBM Plex Mono", monospace',
  color: theme.text,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const emptyRowStyle = {
  padding: "18px",
  color: theme.muted,
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 13,
};

function HailEventsTable({ rows, title = "Hail Events - Past 5 Years" }) {
  const cols = [
    { key: "date", label: "Date", width: "0.85fr" },
    { key: "size", label: "Size", width: "2.9fr" },
    { key: "location", label: "Location", width: "1.95fr" },
    { key: "damage", label: "Property Dmg", width: "1fr" },
    { key: "inj", label: "Injuries", width: "0.7fr" },
    { key: "dea", label: "Deaths", width: "0.7fr" },
  ];

  return (
    <TableShell title={title}>
      <TableHeader columns={cols} />

      {rows.length === 0 ? (
        <div style={emptyRowStyle}>No hail events returned.</div>
      ) : (
        rows.map((row, idx) => (
          <div
            key={`${row.date}-${idx}`}
            style={{
              display: "grid",
              gridTemplateColumns: cols.map((c) => c.width).join(" "),
              padding: "13px 18px",
              borderBottom: idx === rows.length - 1 ? "none" : `1px solid ${theme.borderSoft}`,
              fontSize: 13,
              lineHeight: 1.35,
            }}
          >
            <div style={monoCellStyle}>{formatDate(row.date)}</div>
            <div style={{ ...monoCellStyle, color: "#ffcb54", fontWeight: 700 }}>
              {row.size || "N/A"}
            </div>
            <div style={monoCellStyle}>{row.location || "N/A"}</div>
            <div style={{ ...monoCellStyle, color: theme.dangerText }}>
              {row.propertyDamage || "N/A"}
            </div>
            <div style={{ ...monoCellStyle, textAlign: "center" }}>{row.injuries ?? 0}</div>
            <div style={{ ...monoCellStyle, textAlign: "center" }}>{row.deaths ?? 0}</div>
          </div>
        ))
      )}
    </TableShell>
  );
}

function OtherEventsTable({ rows, title = "Other Severe Weather Events" }) {
  const cols = [
    { key: "date", label: "Date", width: "0.9fr" },
    { key: "type", label: "Type", width: "1.85fr" },
    { key: "desc", label: "Description", width: "4.8fr" },
    { key: "damage", label: "Damage", width: "1.65fr" },
  ];

  return (
    <TableShell title={title}>
      <TableHeader columns={cols} />

      {rows.length === 0 ? (
        <div style={emptyRowStyle}>No additional severe weather events returned.</div>
      ) : (
        rows.map((row, idx) => (
          <div
            key={`${row.date}-${idx}`}
            style={{
              display: "grid",
              gridTemplateColumns: cols.map((c) => c.width).join(" "),
              padding: "13px 18px",
              borderBottom: idx === rows.length - 1 ? "none" : `1px solid ${theme.borderSoft}`,
              fontSize: 13,
              lineHeight: 1.35,
            }}
          >
            <div style={monoCellStyle}>{formatDate(row.date)}</div>
            <div style={{ ...monoCellStyle, color: theme.purpleText, fontWeight: 700 }}>
              {row.type || "N/A"}
            </div>
            <div style={monoCellStyle}>{row.description || "N/A"}</div>
            <div style={{ ...monoCellStyle, color: theme.dangerText }}>
              {row.damage || "N/A"}
            </div>
          </div>
        ))
      )}
    </TableShell>
  );
}

function SourcesBlock({ sources }) {
  return (
    <TableShell title="Data Sources">
      <div style={{ padding: "14px 18px 12px 18px" }}>
        {sources.length === 0 ? (
          <div style={emptyRowStyle}>No source links returned.</div>
        ) : (
          sources.map((s, i) => (
            <div
              key={`${s}-${i}`}
              style={{
                color: theme.blue,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 12,
                lineHeight: 1.7,
                marginBottom: 6,
                wordBreak: "break-all",
              }}
            >
              ↗ {s}
            </div>
          ))
        )}
      </div>
    </TableShell>
  );
}

function TrinityFooter() {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 34,
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <LogoMark large />
      </div>
      <div
        style={{
          color: theme.white,
          fontSize: 14,
        }}
      >
        ©2026 Trinity Engineering, PLLC All Rights Reserved
      </div>
    </div>
  );
}

function ReportPageOne({ data, address, hailRows, firstOtherRows }) {
  return (
    <PdfPageShell showTopHeader>
      <AddressLookupBand address={address} />
      <SummaryCards data={data} />
      <WeatherSummary text={data.summary} />
      <StatsGrid stats={data.stats} />
      <HailEventsTable rows={hailRows} />
      <OtherEventsTable rows={firstOtherRows} />
    </PdfPageShell>
  );
}

function ReportContinuationPage({ title, rows, type, showSources, sources, showFooter }) {
  return (
    <PdfPageShell>
      {type === "hail" ? (
        <HailEventsTable rows={rows} title={title} />
      ) : (
        <OtherEventsTable rows={rows} title={title} />
      )}

      {showSources ? <SourcesBlock sources={sources} /> : null}
      {showFooter ? <TrinityFooter /> : null}
    </PdfPageShell>
  );
}

function ReportSourcesOnlyPage({ sources }) {
  return (
    <PdfPageShell>
      <SourcesBlock sources={sources} />
      <TrinityFooter />
    </PdfPageShell>
  );
}

function buildPageModel(data) {
  if (!data) return [];

  const hailPage1Count = 3;
  const hailContinuationCount = 6;
  const otherPage1Count = 1;
  const otherContinuationCount = 3;

  const hailPage1 = data.hailEvents.slice(0, hailPage1Count);
  const hailOverflow = chunkArray(data.hailEvents.slice(hailPage1Count), hailContinuationCount);

  const otherPage1 = data.otherEvents.slice(0, otherPage1Count);
  const otherOverflow = chunkArray(data.otherEvents.slice(otherPage1Count), otherContinuationCount);

  const pages = [
    {
      kind: "page1",
      hailRows: hailPage1,
      otherRows: otherPage1,
    },
  ];

  hailOverflow.forEach((rows, index) => {
    pages.push({
      kind: "hailContinuation",
      title: index === 0 ? "Hail Events - Continued" : `Hail Events - Continued (${index + 1})`,
      rows,
    });
  });

  if (otherOverflow.length > 0) {
    otherOverflow.forEach((rows, index) => {
      const isLast = index === otherOverflow.length - 1;
      pages.push({
        kind: "otherContinuation",
        title:
          index === 0
            ? "Other Severe Weather Events"
            : `Other Severe Weather Events - Continued (${index + 1})`,
        rows,
        showSources: isLast,
        showFooter: isLast,
      });
    });
  } else {
    pages.push({ kind: "sourcesOnly" });
  }

  return pages;
}

function ReportPreview({ data, address, pageModels }) {
  return (
    <div>
      <div
        style={{
          color: theme.muted2,
          fontSize: 11,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          fontFamily: '"IBM Plex Mono", monospace',
          marginBottom: 12,
        }}
      >
        Report preview
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {pageModels.map((page, idx) => (
          <div
            key={`preview-${idx}`}
            style={{
              width: "100%",
              overflowX: "auto",
              borderRadius: 14,
              border: `1px solid ${theme.borderSoft}`,
              background: "#01040a",
              padding: 10,
            }}
          >
            <div style={{ width: PAGE_W }}>
              {page.kind === "page1" ? (
                <ReportPageOne
                  data={data}
                  address={address}
                  hailRows={page.hailRows}
                  firstOtherRows={page.otherRows}
                />
              ) : page.kind === "hailContinuation" ? (
                <ReportContinuationPage
                  title={page.title}
                  rows={page.rows}
                  type="hail"
                  showSources={false}
                  showFooter={false}
                  sources={[]}
                />
              ) : page.kind === "otherContinuation" ? (
                <ReportContinuationPage
                  title={page.title}
                  rows={page.rows}
                  type="other"
                  showSources={page.showSources}
                  showFooter={page.showFooter}
                  sources={data.sources}
                />
              ) : (
                <ReportSourcesOnlyPage sources={data.sources} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const pageRefs = useRef([]);

  useEffect(() => {
    ensureFonts();
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/session", { credentials: "include" });
        const data = await parseResponseJson(res, "Session API");
        setAuthenticated(Boolean(data?.authenticated));
      } catch {
        setAuthenticated(false);
      } finally {
        setAuthChecking(false);
      }
    };

    checkSession();
  }, []);

  const normalized = useMemo(() => normalizeResult(result, address), [result, address]);
  const pageModels = useMemo(() => buildPageModel(normalized), [normalized]);

  async function handleLogin() {
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await parseResponseJson(res, "Login API");

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Invalid credentials.");
      }

      setAuthenticated(true);
      setUsername("");
      setPassword("");
    } catch (err) {
      setAuthError(err.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }

    setAuthenticated(false);
    setResult(null);
    setAddress("");
  }

  async function callAnthropic(messages, useTools = true) {
    const res = await fetch("/api/anthropic", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: useTools ? 1800 : 2200,
        system: systemPrompt,
        ...(useTools
          ? { tools: [{ type: "web_search_20250305", name: "web_search" }] }
          : {}),
        messages,
      }),
    });

    const text = await res.text();

    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Unexpected server response: ${text.slice(0, 160)}`);
    }

    if (res.status === 401) {
      setAuthenticated(false);
      throw new Error("Your session expired. Please sign in again.");
    }

    if (!res.ok) {
      throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
    }

    return data;
  }

  async function handleLookup() {
    if (!address.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      let messages = [
        {
          role: "user",
          content: `Look up hail and severe weather data for this address: ${address}

Search for the past 5 years (${CURRENT_YEAR - 5} to ${CURRENT_YEAR}).
Return only valid JSON in the exact schema.`,
        },
      ];

      let data = null;

      for (let i = 0; i < 5; i += 1) {
        data = await callAnthropic(messages, true);

        if (data?.stop_reason === "tool_use") {
          messages = [...messages, { role: "assistant", content: data.content }];

          const toolResults = (data.content || [])
            .filter((b) => b.type === "tool_use")
            .map((b) => ({
              type: "tool_result",
              tool_use_id: b.id,
              content: b.content ?? "Search completed.",
            }));

          messages = [...messages, { role: "user", content: toolResults }];
        } else {
          break;
        }
      }

      let parsed = extractJsonPayload(data);

      if (!parsed && data) {
        const repairMessages = [
          ...messages,
          { role: "assistant", content: data.content },
          {
            role: "user",
            content:
              "Return the exact same final answer again as valid JSON only. No markdown. No prose. No citations. Start with { and end with }.",
          },
        ];

        const repaired = await callAnthropic(repairMessages, false);
        parsed = extractJsonPayload(repaired);
      }

      if (!parsed) {
        throw new Error("Claude returned a non-JSON answer. Please try again.");
      }

      setResult(parsed);
    } catch (err) {
      setError(err.message || "Failed to retrieve weather data.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPDF() {
    if (!normalized || pageModels.length === 0) return;

    setPdfLoading(true);

    try {
      await document.fonts.ready;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageModels.length; i += 1) {
        const node = pageRefs.current[i];
        if (!node) continue;

        const canvas = await html2canvas(node, {
          backgroundColor: theme.pageBg,
          scale: 2.2,
          useCORS: true,
          logging: false,
          windowWidth: PAGE_W,
          windowHeight: PAGE_H,
        });

        const img = canvas.toDataURL("image/png");

        if (i > 0) pdf.addPage();
        pdf.addImage(img, "PNG", 0, 0, pdfW, pdfH, undefined, "FAST");
      }

      const countyName = String(normalized.location.county || "report")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

      const fileName = `trinity-swi-report-${countyName}-${new Date().toISOString().slice(0, 10)}.pdf`;

      pdf.save(fileName);
    } catch (err) {
      setError(`PDF generation failed: ${err.message || err}`);
    } finally {
      setPdfLoading(false);
    }
  }

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: theme.bg,
          color: theme.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        Checking session...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginScreen
        username={username}
        password={password}
        setUsername={setUsername}
        setPassword={setPassword}
        onLogin={handleLogin}
        loading={authLoading}
        error={authError}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <AppHeader onLogout={handleLogout} />

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: 20 }}>
        <SearchPanel
          address={address}
          setAddress={setAddress}
          onLookup={handleLookup}
          loading={loading}
        />

        {error ? (
          <div
            style={{
              marginBottom: 16,
              color: "#ff9c9c",
              background: "#220b12",
              border: "1px solid #5d1c2b",
              padding: "12px 14px",
              borderRadius: 10,
            }}
          >
            {error}
          </div>
        ) : null}

        {!normalized ? (
          <Panel>
            <SectionLabel>Status</SectionLabel>
            <div style={{ color: theme.muted, lineHeight: 1.8 }}>
              Enter a property address and run the query. The report preview and PDF export will appear after results are returned.
            </div>
          </Panel>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: theme.white,
                    fontWeight: 800,
                    fontSize: 18,
                    marginBottom: 4,
                  }}
                >
                  Report ready
                </div>
                <div
                  style={{
                    color: theme.muted,
                    fontSize: 13,
                  }}
                >
                  {normalized.location.address}
                </div>
              </div>

              <button
                onClick={downloadPDF}
                disabled={pdfLoading}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: "#1f9d52",
                  color: "#ffffff",
                  padding: "12px 18px",
                  fontWeight: 800,
                  cursor: "pointer",
                  minWidth: 180,
                }}
              >
                {pdfLoading ? "Generating PDF..." : "Download PDF"}
              </button>
            </div>

            <ReportPreview
              data={normalized}
              address={address}
              pageModels={pageModels}
            />
          </>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: -20000,
          top: 0,
          width: PAGE_W,
          pointerEvents: "none",
        }}
      >
        {normalized &&
          pageModels.map((page, idx) => (
            <div
              key={`pdf-${idx}`}
              ref={(el) => {
                pageRefs.current[idx] = el;
              }}
              style={{ width: PAGE_W, height: PAGE_H, marginBottom: 20 }}
            >
              {page.kind === "page1" ? (
                <ReportPageOne
                  data={normalized}
                  address={address}
                  hailRows={page.hailRows}
                  firstOtherRows={page.otherRows}
                />
              ) : page.kind === "hailContinuation" ? (
                <ReportContinuationPage
                  title={page.title}
                  rows={page.rows}
                  type="hail"
                  showSources={false}
                  showFooter={false}
                  sources={[]}
                />
              ) : page.kind === "otherContinuation" ? (
                <ReportContinuationPage
                  title={page.title}
                  rows={page.rows}
                  type="other"
                  showSources={page.showSources}
                  showFooter={page.showFooter}
                  sources={normalized.sources}
                />
              ) : (
                <ReportSourcesOnlyPage sources={normalized.sources} />
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
