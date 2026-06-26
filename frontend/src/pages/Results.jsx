// src/pages/Results.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MapContainer, TileLayer, CircleMarker, Popup, ImageOverlay, useMap,
} from "react-leaflet";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import jsPDF from "jspdf";
import "leaflet/dist/leaflet.css";
import { BarChart3, Map, FileText, TrendingUp, CheckCircle, Building2, Lightbulb, Loader } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

const TABS = [
  { id: "chart",  label: "Analysis",        icon: BarChart3 },
  { id: "map",    label: "Map View",         icon: Map },
  { id: "report", label: "Report",           icon: FileText },
  { id: "ai",     label: "AI Recommendations", icon: Lightbulb },
];

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("chart");

  /* Listen for tab changes dispatched from Navbar */
  useEffect(() => {
    const handler = (e) => setActiveTab(e.detail);
    window.addEventListener("results-tab", handler);
    return () => window.removeEventListener("results-tab", handler);
  }, []);

  const stateData = useMemo(() => {
    if (location.state) return location.state;
    try {
      const raw = sessionStorage.getItem("results_state");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [location.state]);

  const mapBounds = stateData?.map_bounds ?? stateData?.bounds;

  const stats = useMemo(() => {
    const s = stateData?.stats ?? {};
    return {
      noChange:   parseFloat(s["No Change"]  ?? "0"),
      change:     parseFloat(s["Change"]     ?? "0"),
      demolished: parseFloat(s["Demolished"] ?? "0"),
    };
  }, [stateData]);

  // ── AI Recommendations state ──────────────────────────────────────────────
  const [aiRecs, setAiRecs]         = useState(null);   // fetched text
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState(null);
  const [aiFetched, setAiFetched]   = useState(false);

  // Fetch when AI tab is opened for the first time
  useEffect(() => {
    if (activeTab !== "ai" || aiFetched || !stateData) return;
    setAiFetched(true);
    setAiLoading(true);
    setAiError(null);

    const s     = stateData?.stats ?? {};
    const preds = stateData?.predictions ?? [];
    const ctx   = {
      no_change:        parseFloat(s["No Change"]  ?? "0"),
      change:           parseFloat(s["Change"]     ?? "0"),
      demolished:       parseFloat(s["Demolished"] ?? "0"),
      start_year:       stateData?.start_year ?? "unknown",
      end_year:         stateData?.end_year   ?? "unknown",
      total_areas:      preds.length,
      no_change_areas:  preds.filter((p) => p.class === 2).length,
      changed_areas:    preds.filter((p) => p.class === 1).length,
      demolished_areas: preds.filter((p) => p.class === 0).length,
      bounds:           stateData?.map_bounds ?? stateData?.bounds ?? null,
    };

    fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          `Based on these satellite land change results (${ctx.start_year}–${ctx.end_year}): ` +
          `No Change ${ctx.no_change.toFixed(1)}%, Change ${ctx.change.toFixed(1)}%, ` +
          `Demolished ${ctx.demolished.toFixed(1)}% across ${ctx.total_areas} zones — ` +
          `provide 5 specific future recommendations for urban planners, environmental ` +
          `authorities, and policymakers. Number each recommendation 1-5. ` +
          `Each recommendation should be 2-3 sentences. Be precise and actionable.`,
        context: ctx,
        history: [],
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setAiError(d.error);
        else setAiRecs(d.reply);
      })
      .catch(() => setAiError("Could not connect to AI server."))
      .finally(() => setAiLoading(false));
  }, [activeTab, aiFetched, stateData]);

  const lineData = [
    { category: "No Change",  value: stats.noChange   },
    { category: "Change",     value: stats.change     },
    { category: "Demolished", value: stats.demolished },
  ];

  const mapData = stateData?.predictions ?? [];
  const mapKey  = stateData?.run_id ?? "results";

  const center = mapBounds
    ? [(mapBounds[0][0] + mapBounds[1][0]) / 2, (mapBounds[0][1] + mapBounds[1][1]) / 2]
    : [33.905, 73.275];

  useEffect(() => {
    if (!stateData) navigate("/", { replace: true });
  }, [stateData, navigate]);

  const getColor = (cls) => {
    if (cls === 0) return "#3b82f6";
    if (cls === 1) return "#ef4444";
    return "#22c55e";
  };

  /* ── PDF report ── */
  const generateReport = () => {
    const doc = new jsPDF();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(103, 232, 249);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("AI-GIS Land Change Detection Report", 15, 18);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, 15, 26);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    let y = 42;
    if (stateData?.run_id)   { doc.text(`Session ID: ${stateData.run_id}`, 15, y); y += 7; }
    if (stateData?.start_year && stateData?.end_year) {
      doc.text(`Period: ${stateData.start_year} → ${stateData.end_year}`, 15, y); y += 7;
    }
    if (mapBounds) {
      doc.text(
        `Bounds: Lat [${mapBounds[0][0].toFixed(4)}, ${mapBounds[1][0].toFixed(4)}]  Lng [${mapBounds[0][1].toFixed(4)}, ${mapBounds[1][1].toFixed(4)}]`,
        15, y
      ); y += 12;
    }

    doc.setFillColor(241, 245, 249);
    doc.rect(12, y - 4, 186, 48, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Prediction Results", 15, y + 4); y += 12;

    [
      ["No Change",  `${stats.noChange.toFixed(1)}%`,   [34, 197, 94]],
      ["Change",     `${stats.change.toFixed(1)}%`,     [239, 68, 68]],
      ["Demolished", `${stats.demolished.toFixed(1)}%`, [59, 130, 246]],
    ].forEach(([label, val, rgb]) => {
      doc.setFillColor(...rgb);
      doc.rect(15, y - 3, 4, 5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(label, 23, y + 1);
      doc.setFont("helvetica", "bold");
      doc.text(val, 80, y + 1);
      y += 9;
    });

    y += 10;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Color Legend:", 15, y); y += 8;
    doc.setFont("helvetica", "normal");
    [["Green", "No Change"], ["Red", "Change Detected"], ["Blue", "Demolished Areas"]].forEach(([c, d]) => {
      doc.text(`• ${c}: ${d}`, 18, y); y += 6;
    });

    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("This report was generated using AI-powered satellite land change detection.", 15, y);
    doc.text("Powered by Sentinel-2 · Google Earth Engine · ResNet50", 15, y + 5);

    doc.save(`land_change_report_${stateData?.run_id || "session"}.pdf`);
  };

  if (!stateData) return null;

  return (
    <div className="flex flex-col min-h-full text-white">

      {/* ── Sub-navbar tabs ── */}
      <div className="sticky top-16 z-[1500] border-b border-white/10 bg-slate-950/90 backdrop-blur-xl shadow-lg">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4">
          <nav className="flex items-center">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={
                  "flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-all duration-200 " +
                  (activeTab === id
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-white/20")
                }
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          {/* Year range badge */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            {stateData?.start_year && stateData?.end_year && (
              <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1">
                {stateData.start_year} → {stateData.end_year}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6">

        {/* ══════════ ANALYSIS TAB ══════════ */}
        {activeTab === "chart" && (
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { key: "noChange",   label: "No Change",  icon: CheckCircle, color: "#22c55e", bg: "from-green-500/10 to-green-500/5", border: "border-green-500/20", desc: "Stable land area" },
                { key: "change",     label: "Change",     icon: TrendingUp,  color: "#ef4444", bg: "from-red-500/10 to-red-500/5",   border: "border-red-500/20",   desc: "Modified land area" },
                { key: "demolished", label: "Demolished", icon: Building2,   color: "#3b82f6", bg: "from-blue-500/10 to-blue-500/5", border: "border-blue-500/20",  desc: "Removed structures" },
              ].map(({ key, label, icon: Icon, color, bg, border, desc }) => (
                <div key={key} className={`rounded-2xl border ${border} bg-gradient-to-br ${bg} p-5`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-slate-400">{label}</div>
                      <div className="mt-1 text-3xl font-bold" style={{ color }}>{stats[key].toFixed(1)}%</div>
                      <div className="mt-1 text-xs text-slate-500">{desc}</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
                      <Icon size={22} style={{ color }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Line chart */}
            <div className="glass-card px-5 py-5">
              <div className="mb-4 text-sm font-semibold text-slate-100">Land Change Distribution</div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lineData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="category" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v) => [`${v.toFixed(1)}%`, "Coverage"]}
                    contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f1f5f9", fontSize: 13 }}
                    labelStyle={{ color: "#67e8f9", fontWeight: 600 }}
                    cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="5 5" label={{ value: "50%", fill: "#64748b", fontSize: 11, position: "right" }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="url(#lineGrad)"
                    strokeWidth={3}
                    dot={(props) => {
                      const c = { "No Change": "#22c55e", "Change": "#ef4444", "Demolished": "#3b82f6" }[props.payload.category] || "#818cf8";
                      return <circle key={props.index} cx={props.cx} cy={props.cy} r={8} fill={c} stroke="#0f172a" strokeWidth={2.5} />;
                    }}
                    activeDot={{ r: 10, strokeWidth: 2, stroke: "#fff" }}
                  />
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%"   stopColor="#22c55e" />
                      <stop offset="50%"  stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap justify-center gap-5">
                {[{ label: "No Change", color: "#22c55e" }, { label: "Change", color: "#ef4444" }, { label: "Demolished", color: "#3b82f6" }].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ MAP TAB ══════════ */}
        {activeTab === "map" && (
          <div className="space-y-4">
            <div className="glass-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div className="text-sm font-semibold text-slate-100">Spatial Distribution</div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  {[{ label: "No Change", color: "#22c55e" }, { label: "Change", color: "#ef4444" }, { label: "Demolished", color: "#3b82f6" }].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <MapContainer key={mapKey} center={center} zoom={12} style={{ height: "520px", width: "100%" }}>
                <FitBounds bounds={mapBounds} />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />

                {mapData
                  .filter((p) => p.lat && p.lng && !(p.lat === 0 && p.lng === 0))
                  .map((p, idx) => (
                    <CircleMarker key={idx} center={[p.lat, p.lng]} color={getColor(p.class)} fillColor={getColor(p.class)} fillOpacity={0.7} weight={2} radius={7}>
                      <Popup>
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                          <b style={{ color: getColor(p.class) }}>
                            {p.class === 0 ? "Demolished" : p.class === 1 ? "Change" : "No Change"}
                          </b><br />
                          <span style={{ color: "#64748b" }}>Lat:</span> {p.lat?.toFixed(5)}<br />
                          <span style={{ color: "#64748b" }}>Lng:</span> {p.lng?.toFixed(5)}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}

                {stateData?.color_map && mapBounds && (
                  <ImageOverlay url={`${API_BASE_URL}/${stateData.color_map}?v=${encodeURIComponent(mapKey)}`} bounds={mapBounds} opacity={0.45} />
                )}
              </MapContainer>
            </div>

            {/* Area counts — no "patches" word */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "No Change Areas",  value: mapData.filter((p) => p.class === 2).length, color: "#22c55e" },
                { label: "Changed Areas",    value: mapData.filter((p) => p.class === 1).length, color: "#ef4444" },
                { label: "Demolished Areas", value: mapData.filter((p) => p.class === 0).length, color: "#3b82f6" },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass-card px-4 py-3 text-center">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="mt-1 text-xl font-bold" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ REPORT TAB ══════════ */}
        {activeTab === "report" && (
          <div className="space-y-5">
            <div className="glass-card px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-white">Analysis Report</div>
                  <div className="mt-1 text-xs text-slate-400">
                    AI-GIS Land Change Detection · Session {stateData?.run_id ?? "—"}
                  </div>
                </div>
                <button onClick={generateReport} className="btn-primary shrink-0 px-5 py-2.5 text-sm">
                  <FileText size={15} />
                  Download PDF
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Session details */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Session Details</div>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Session ID",  stateData?.run_id ?? "—"],
                      ["Start Year",  stateData?.start_year ?? "—"],
                      ["End Year",    stateData?.end_year ?? "—"],
                      ["Generated",   new Date().toLocaleDateString()],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-slate-400">{k}</span>
                        <span className="font-medium text-slate-200">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results summary with progress bars */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Results Summary</div>
                  <div className="space-y-3">
                    {[
                      { label: "No Change",  value: stats.noChange,   color: "#22c55e" },
                      { label: "Change",     value: stats.change,     color: "#ef4444" },
                      { label: "Demolished", value: stats.demolished, color: "#3b82f6" },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-slate-400">{label}</span>
                          <span className="font-semibold" style={{ color }}>{value.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Geographic bounds */}
              {mapBounds && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Geographic Bounds</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[["Min Lat", mapBounds[0][0].toFixed(5)], ["Min Lng", mapBounds[0][1].toFixed(5)], ["Max Lat", mapBounds[1][0].toFixed(5)], ["Max Lng", mapBounds[1][1].toFixed(5)]].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-slate-400">{k}</span>
                        <span className="font-mono text-slate-200">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Color legend */}
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Color Legend</div>
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: "No Change",  color: "#22c55e", desc: "Stable, unchanged land" },
                    { label: "Change",     color: "#ef4444", desc: "Construction / modification" },
                    { label: "Demolished", color: "#3b82f6", desc: "Removed structures" },
                  ].map(({ label, color, desc }) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <span className="h-4 w-4 shrink-0 rounded" style={{ background: color }} />
                      <div>
                        <div className="text-xs font-medium text-slate-200">{label}</div>
                        <div className="text-[11px] text-slate-500">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-300/80">
              ⚠️ Results are based on Sentinel-2 satellite imagery and AI classification. For critical decisions, validate with ground-truth data.
            </div>
          </div>
        )}

        {/* ══════════ AI RECOMMENDATIONS TAB ══════════ */}
        {activeTab === "ai" && (
          <div className="space-y-5">

            {/* Header card */}
            <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/8 to-indigo-600/8 px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600">
                  <Lightbulb size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">AI Future Recommendations</div>
                  <div className="text-xs text-slate-400">
                    Based on {stateData?.start_year} → {stateData?.end_year} satellite analysis
                  </div>
                </div>
              </div>

              {/* Stats summary strip */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { label: "No Change", value: stats.noChange,   color: "#22c55e", bg: "bg-green-500/10  border-green-500/20"  },
                  { label: "Change",    value: stats.change,     color: "#ef4444", bg: "bg-red-500/10    border-red-500/20"    },
                  { label: "Demolished",value: stats.demolished, color: "#3b82f6", bg: "bg-blue-500/10   border-blue-500/20"   },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`rounded-xl border ${bg} px-3 py-2.5 text-center`}>
                    <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
                    <div className="text-xl font-bold" style={{ color }}>{value.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Loading */}
            {aiLoading && (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-600/20 border border-cyan-500/20">
                  <Loader size={26} className="text-cyan-400 animate-spin" />
                </div>
                <div className="text-sm text-slate-300 font-medium">Generating AI recommendations…</div>
                <div className="text-xs text-slate-500">Analyzing {stateData?.start_year}–{stateData?.end_year} results</div>
              </div>
            )}

            {/* Error */}
            {aiError && !aiLoading && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4">
                <div className="text-sm font-semibold text-red-300 mb-1">Could not load recommendations</div>
                <div className="text-xs text-slate-400">{aiError}</div>
                <button
                  onClick={() => { setAiFetched(false); setAiError(null); }}
                  className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white hover:bg-white/10 transition"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Recommendations content */}
            {aiRecs && !aiLoading && (
              <div className="space-y-3">
                {aiRecs
                  .split(/\n(?=\d+\.)/)
                  .filter((s) => s.trim())
                  .map((rec, idx) => {
                    const clean  = rec.replace(/^\d+\.\s*/, "").trim();
                    const title  = clean.split(/[.!?]/)[0].replace(/\*\*/g, "").trim();
                    const body   = clean.slice(title.length).replace(/^[.!?\s]+/, "").replace(/\*\*/g, "").trim();
                    const colors = [
                      { border: "border-cyan-500/25",    bg: "bg-cyan-500/8",    num: "bg-cyan-500/20  text-cyan-300"    },
                      { border: "border-indigo-500/25",  bg: "bg-indigo-500/8",  num: "bg-indigo-500/20 text-indigo-300" },
                      { border: "border-emerald-500/25", bg: "bg-emerald-500/8", num: "bg-emerald-500/20 text-emerald-300"},
                      { border: "border-amber-500/25",   bg: "bg-amber-500/8",   num: "bg-amber-500/20  text-amber-300"  },
                      { border: "border-rose-500/25",    bg: "bg-rose-500/8",    num: "bg-rose-500/20   text-rose-300"   },
                    ];
                    const col = colors[idx % colors.length];
                    return (
                      <div key={idx} className={`rounded-2xl border ${col.border} ${col.bg} px-5 py-4`}>
                        <div className="flex items-start gap-3">
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${col.num} mt-0.5`}>
                            {idx + 1}
                          </span>
                          <div>
                            {title && (
                              <div className="text-sm font-semibold text-white mb-1">{title}</div>
                            )}
                            {body && (
                              <div className="text-[13px] text-slate-300 leading-relaxed">{body}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-300/80 mt-2">
                  ⚠️ AI recommendations are based on satellite imagery analysis. Validate with ground-truth data before policy decisions.
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
