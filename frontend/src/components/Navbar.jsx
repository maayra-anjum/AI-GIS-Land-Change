import { useNavigate, useLocation } from "react-router-dom";
import { BarChart3, Map, FileText, Home, Lightbulb } from "lucide-react";

export default function Navbar({ resultsTabs = false, searchSlot = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isResults = location.pathname === "/results";

  return (
    <header className="fixed left-0 top-0 z-[2000] w-full">
      <div className="bg-slate-950/85 backdrop-blur-xl border-b border-white/10 shadow-xl shadow-black/30">
        {/* Taller navbar to fit bigger brand */}
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-6 px-5 h-16">

          {/* Brand — larger text */}
          <button
            onClick={() => navigate("/")}
            className="shrink-0 flex flex-col leading-none group"
          >
            <span className="text-xl font-extrabold tracking-tight text-white group-hover:text-cyan-300 transition">
              AI-GIS Land Change
            </span>
            <span className="text-[11px] text-slate-400 group-hover:text-slate-300 transition mt-0.5">
              Satellite Detection System
            </span>
          </button>

          {/* Search bar — centred with flex-1 on both sides */}
          {searchSlot && (
            <>
              <div className="flex-1" />
              <div className="w-[280px] shrink-0">
                <div id="search-bar-container" className="w-full" />
              </div>
              <div className="flex-1" />
            </>
          )}

          {/* Result tabs — centred when no search slot */}
          {isResults && resultsTabs && (
            <>
              <div className="flex-1" />
              <nav className="flex items-center gap-0 rounded-xl border border-white/10 bg-white/5 p-1">
                {[
                  { id: "chart",  label: "Analysis",        icon: BarChart3 },
                  { id: "map",    label: "Map View",         icon: Map },
                  { id: "report", label: "Report",           icon: FileText },
                  { id: "ai",     label: "AI Recommendations", icon: Lightbulb },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent("results-tab", { detail: id }))
                    }
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <Icon size={13} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </nav>
              <div className="flex-1" />
            </>
          )}

          {/* Spacer when neither search nor tabs */}
          {!searchSlot && !isResults && <div className="flex-1" />}

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-2">
            {isResults && (
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Home size={13} />
                <span className="hidden sm:inline">New Analysis</span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] font-medium text-cyan-300">Live</span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
