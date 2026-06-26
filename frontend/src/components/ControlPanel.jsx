import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const STATUS = {
  idle: "idle",
  fetching: "fetching",
  patching: "patching",
  predicting: "predicting",
  done: "done",
  error: "error",
};

export default function ControlPanel({
  drawnPolygon,
  startYear,
  endYear,
  years,
  setStartYear,
  setEndYear,
  onToast,
}) {
  const [status, setStatus] = useState(STATUS.idle);
  const [error, setError] = useState(null);
  const [lastRunId, setLastRunId] = useState(() => sessionStorage.getItem("last_run_id") ?? null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ✅ Extract bounds from polygon
  const getBoundsFromPolygon = (polygon) => {
    try {
      const coords =
        polygon?.geometry?.coordinates?.[0] ||
        polygon?.coordinates?.[0];

      if (!coords || coords.length === 0) return null;

      let lats = coords.map((c) => c[1]);
      let lngs = coords.map((c) => c[0]);

      return [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
    } catch (err) {
      console.error("Bounds extraction error:", err);
      return null;
    }
  };

  const normalizeGeoJSON = (polygon) => {
    if (!polygon) return null;

    if (polygon.type === "Feature" && polygon.geometry) {
      return {
        type: polygon.geometry.type,
        coordinates: polygon.geometry.coordinates,
      };
    }

    if (polygon.geometry && polygon.geometry.type && polygon.geometry.coordinates) {
      return {
        type: polygon.geometry.type,
        coordinates: polygon.geometry.coordinates,
      };
    }

    if (polygon.type && polygon.coordinates) {
      return {
        type: polygon.type,
        coordinates: polygon.coordinates,
      };
    }

    return null;
  };

  const loading = status !== STATUS.idle && status !== STATUS.done && status !== STATUS.error;
  const inputsDisabled = loading;

  const steps = useMemo(
    () => [
      { key: STATUS.fetching, label: "Fetching Data" },
      { key: STATUS.patching, label: "Processing Patches" },
      { key: STATUS.predicting, label: "Running Predictions" },
      { key: STATUS.done, label: "Completed" },
    ],
    []
  );

  const currentStepIndex = useMemo(() => {
    const idx = steps.findIndex((s) => s.key === status);
    if (idx >= 0) return idx;
    if (status === STATUS.idle) return -1;
    if (status === STATUS.error) return -1;
    return -1;
  }, [status, steps]);

    const handleFetchImages = () => {
      if (!drawnPolygon) {
        onToast?.({ type: "error", title: "No area selected", message: "Draw a polygon/rectangle on the map first." });
        return;
      }

      // ✅ Clear old session
      sessionStorage.removeItem("results_state");
      setError(null);

      const bounds = getBoundsFromPolygon(drawnPolygon);

      if (!bounds) {
        onToast?.({ type: "error", title: "Invalid bounds", message: "Try drawing the polygon again." });
        return;
      }

      console.log("📌 Polygon:", drawnPolygon);
      console.log("📌 Bounds:", bounds);

      const normalizedPolygon = normalizeGeoJSON(drawnPolygon);
      if (!normalizedPolygon) {
        onToast?.({ type: "error", title: "Invalid polygon", message: "The selected area could not be converted to a valid GeoJSON polygon." });
        setStatus(STATUS.error);
        setError("Invalid polygon payload");
        return;
      }

      console.log("📌 Normalized polygon:", normalizedPolygon);

      // ── Pakistan-only check (client-side fast fail) ───────────────────
      const PK = { minLat: 23.5, maxLat: 37.5, minLng: 60.5, maxLng: 77.5 };
      const allCoords = bounds
        ? [bounds[0], bounds[1], [bounds[0][0], bounds[1][1]], [bounds[1][0], bounds[0][1]]]
        : [];
      const outsidePK = allCoords.some(([lat, lng]) =>
        lat < PK.minLat || lat > PK.maxLat || lng < PK.minLng || lng > PK.maxLng
      );
      if (outsidePK) {
        onToast?.({
          type: "error",
          title: "Outside Pakistan",
          message: "This tool is designed exclusively for Pakistan. Please draw your area within Pakistan's boundaries.",
          durationMs: 6000,
        });
        return;
      }

      setStatus(STATUS.fetching);
      onToast?.({ type: "info", title: "Fetching satellite imagery", message: "Downloading images from Google Earth Engine…" });

      // 🆕 Fetch images from GEE
      fetch(`${API_BASE_URL}/fetch-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          polygon: normalizedPolygon,
          start_year: startYear,
          end_year: endYear,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            throw new Error(data.error);
          }

          console.log("✅ Images fetched:", data);
          setLastRunId(data.run_id);

          // 🆕 Auto-run prediction with fetched images
          setStatus(STATUS.predicting);
          onToast?.({ type: "info", title: "Running AI analysis", message: "Analyzing land changes with trained model…" });

          return fetch(`${API_BASE_URL}/prediction/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start_image: data.start_image,
              end_image: data.end_image,
              bounds: bounds,
              image_bounds: data.image_bounds || bounds,  // use GEE-derived bounds for accurate patch coords
              run_id: data.run_id,
              patch_size: 64,
            }),
          });
        })
        .then((res) => res.json())
        .then((predictionData) => {
          if (predictionData.error) {
            throw new Error(predictionData.error);
          }

          console.log("✅ Prediction complete:", predictionData);

          // Save results to session storage
          const resultsState = {
            ...predictionData,
            start_year: startYear,
            end_year: endYear,
            bounds: bounds,
          };
          sessionStorage.setItem("results_state", JSON.stringify(resultsState));

          setStatus(STATUS.done);
          onToast?.({ type: "success", title: "Analysis complete", message: "Land change detection finished!" });

          // Navigate to results page
          setTimeout(() => {
            navigate("/results", { state: resultsState });
          }, 1000);
        })
        .catch((err) => {
          console.error("❌ Error:", err);
          setError(err.message);
          setStatus(STATUS.error);
          onToast?.({ type: "error", title: "Analysis failed", message: err.message });
        });
    };

  return (
    <div className={isMobile ? "p-1" : "p-2"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Control Panel</div>
          <div className="mt-0.5 text-xs text-slate-200/80">
            {lastRunId ? (
              <span title="Latest session id">Session: {lastRunId}</span>
            ) : (
              <span title="No session yet">No session yet</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-2"
            title="Reset the app"
            onClick={() => window.location.reload()}
            disabled={loading}
          >
            ↻ <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label-modern" title="Select the start year">Start Year</label>
          <select
            value={startYear}
            onChange={(e) => setStartYear(Number(e.target.value))}
            className="select-modern mt-1"
            disabled={inputsDisabled}
          >
            {(years ?? [2021, 2022, 2023, 2024, 2025]).map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-modern" title="Select the end year">End Year</label>
          <select
            value={endYear}
            onChange={(e) => setEndYear(Number(e.target.value))}
            className="select-modern mt-1"
            disabled={inputsDisabled}
          >
            {(years ?? [2021, 2022, 2023, 2024, 2025]).map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading status */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200/90">Status</div>
          <div className="text-xs text-slate-200/80">
            {status === STATUS.idle && "Ready"}
            {status === STATUS.fetching && "⏳ Fetching Data"}
            {status === STATUS.patching && "⚙️ Processing Patches"}
            {status === STATUS.predicting && "🧠 Running Predictions"}
            {status === STATUS.done && "✅ Completed"}
            {status === STATUS.error && "⚠️ Error"}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2">
          {steps.map((s, idx) => {
            const active = idx === currentStepIndex;
            const complete = currentStepIndex >= 0 && idx < currentStepIndex;
            return (
              <div
                key={s.key}
                className={
                  "rounded-xl border px-2 py-2 text-[11px] transition duration-300 ease-in-out " +
                  (complete
                    ? "border-cyan-400/30 bg-cyan-400/10 text-white"
                    : active
                      ? "border-white/20 bg-white/10 text-white shimmer"
                      : "border-white/10 bg-white/5 text-slate-200/70")
                }
                title={s.label}
              >
                {s.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {status === STATUS.error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3">
          <div className="text-sm font-semibold">Something went wrong</div>
          <div className="mt-0.5 text-sm text-slate-200/90">{error?.message ?? "Unknown error"}</div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary" onClick={handleFetchImages}>
              Retry
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStatus(STATUS.idle)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleFetchImages}
          className="btn-primary"
          disabled={inputsDisabled}
          title="Fetch imagery and run predictions"
        >
          {loading ? "Running…" : "Fetch & Predict"}
        </button>
        <div className="text-xs text-slate-200/75">
          Tip: draw a polygon/rectangle on the map first.
        </div>
      </div>
    </div>
  );
}