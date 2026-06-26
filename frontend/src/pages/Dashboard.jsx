import { useEffect, useMemo, useState } from "react";
import MapComponent from "../components/MapComponent";
import ControlPanel from "../components/ControlPanel";

function Toast({ t, onDismiss }) {
  const icons = { success: "✅", error: "⚠️", info: "⏳" };
  return (
    <div className="pointer-events-auto glass-card px-4 py-3 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{icons[t.type] ?? "ℹ️"} {t.title}</div>
          {t.message && <div className="mt-0.5 text-xs text-slate-300">{t.message}</div>}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:bg-white/10"
        >✕</button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [drawnPolygon, setDrawnPolygon] = useState(null);
  const [startYear, setStartYear] = useState(() => {
    const v = Number(localStorage.getItem("startYear"));
    return Number.isFinite(v) && v ? v : 2021;
  });
  const [endYear, setEndYear] = useState(() => {
    const v = Number(localStorage.getItem("endYear"));
    return Number.isFinite(v) && v ? v : 2025;
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [panelOpen, setPanelOpen] = useState(true);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => { localStorage.setItem("startYear", String(startYear)); }, [startYear]);
  useEffect(() => { localStorage.setItem("endYear",   String(endYear));   }, [endYear]);

  const years = useMemo(() => [2021, 2022, 2023, 2024, 2025], []);

  const pushToast = (toast) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type: "info", title: "Status", ...toast }, ...prev].slice(0, 3));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), toast.durationMs ?? 4000);
  };

  return (
    <div className="relative flex-1 overflow-hidden">

      {/* Toast stack */}
      <div className="pointer-events-none fixed left-1/2 top-[80px] z-[3000] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} t={t} onDismiss={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />
        ))}
      </div>

      {/* Map — full canvas */}
      <div className="absolute inset-0">
        <MapComponent setDrawnPolygon={setDrawnPolygon} />
      </div>

      {/* Control panel — LEFT side */}
      <div
        className="absolute z-[1600]"
        style={{ left: isMobile ? "8px" : "12px", top: isMobile ? "8px" : "12px" }}
      >
        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="mb-2 flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-xl transition hover:bg-slate-900/90"
          title={panelOpen ? "Collapse panel" : "Expand panel"}
        >
          <span>{panelOpen ? "✕" : "☰"}</span>
          <span className="hidden sm:inline">{panelOpen ? "Close" : "Controls"}</span>
        </button>

        {/* Panel */}
        <div
          className={
            "origin-top-left transition-all duration-300 ease-in-out " +
            (panelOpen
              ? "scale-100 opacity-100 pointer-events-auto"
              : "scale-95 opacity-0 pointer-events-none")
          }
        >
          <div className="glass-card w-[min(320px,calc(100vw-2rem))] p-4 text-white shadow-2xl">
            <ControlPanel
              drawnPolygon={drawnPolygon}
              startYear={startYear}
              endYear={endYear}
              years={years}
              setStartYear={setStartYear}
              setEndYear={setEndYear}
              onToast={pushToast}
            />
          </div>
        </div>
      </div>

      {/* Mobile hint */}
      {isMobile && !drawnPolygon && (
        <div className="absolute bottom-4 left-1/2 z-[1600] -translate-x-1/2">
          <div className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl shadow-lg">
            ✏️ Draw a polygon or rectangle on the map
          </div>
        </div>
      )}
    </div>
  );
}
