// src/components/Chatbot.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Bot, User, Loader, Mic, MicOff, Volume2, VolumeX, BarChart3 } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const QUICK_QUESTIONS = [
  "What caused these changes?",
  "Is this alarming?",
  "What should authorities do?",
  "Environmental impact?",
  "Future predictions?",
];

/* ── Render bold **text** and newlines ── */
function MessageText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part === "\n") return <br key={i} />;
        return part;
      })}
    </span>
  );
}

/* ── Strip markdown for TTS ── */
function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#+\s/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export default function Chatbot({ stateData }) {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Voice
  const [listening, setListening]     = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [speaking, setSpeaking]       = useState(false);
  const [ttsEnabled, setTtsEnabled]   = useState(true);
  const recognitionRef = useRef(null);
  const synthRef       = useRef(window.speechSynthesis);
  const bottomRef      = useRef(null);
  const inputRef       = useRef(null);

  /* ── Browser support check ── */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      setMicSupported(true);
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (e) => { setInput(e.results[0][0].transcript); setListening(false); };
      rec.onerror  = () => setListening(false);
      rec.onend    = () => setListening(false);
      recognitionRef.current = rec;
    }
    return () => synthRef.current?.cancel();
  }, []);

  /* ── Speak in Urdu ── */
  const speak = useCallback((text) => {
    if (!ttsEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const clean    = stripMarkdown(text);
    const utt      = new SpeechSynthesisUtterance(clean);
    utt.rate       = 0.95;
    utt.pitch      = 1.0;
    utt.volume     = 1.0;

    // Try Urdu voice first, fallback to any available
    const voices   = synthRef.current.getVoices();
    const urduVoice = voices.find((v) =>
      v.lang === "ur-PK" || v.lang === "ur" || v.lang.startsWith("ur")
    );
    const fallback  = voices.find((v) => v.lang.startsWith("en"));
    utt.voice       = urduVoice || fallback || null;
    if (urduVoice) utt.lang = "ur-PK";

    utt.onstart = () => setSpeaking(true);
    utt.onend   = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    synthRef.current.speak(utt);
  }, [ttsEnabled]);

  const stopSpeaking = () => { synthRef.current?.cancel(); setSpeaking(false); };

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (listening) { recognitionRef.current.stop(); setListening(false); }
    else { stopSpeaking(); setInput(""); recognitionRef.current.start(); setListening(true); }
  };

  /* ── Build context ── */
  const buildContext = () => {
    const stats       = stateData?.stats ?? {};
    const predictions = stateData?.predictions ?? [];
    return {
      no_change:        parseFloat(stats["No Change"]  ?? "0"),
      change:           parseFloat(stats["Change"]     ?? "0"),
      demolished:       parseFloat(stats["Demolished"] ?? "0"),
      start_year:       stateData?.start_year ?? "unknown",
      end_year:         stateData?.end_year   ?? "unknown",
      total_areas:      predictions.length,
      no_change_areas:  predictions.filter((p) => p.class === 2).length,
      changed_areas:    predictions.filter((p) => p.class === 1).length,
      demolished_areas: predictions.filter((p) => p.class === 0).length,
      bounds:           stateData?.map_bounds ?? stateData?.bounds ?? null,
    };
  };

  /* ── Auto-greeting + auto recommendations ── */
  useEffect(() => {
    if (open && !initialized && stateData) {
      setInitialized(true);
      const ctx        = buildContext();
      const changeFlag = ctx.change > 30    ? "⚠️ High"     : ctx.change > 15    ? "Moderate" : "Low";
      const demFlag    = ctx.demolished > 20 ? "⚠️ Critical" : ctx.demolished > 5 ? "Moderate" : "Low";

      const greetText =
        `**Land Change Analysis — ${ctx.start_year} → ${ctx.end_year}**\n` +
        `${ctx.total_areas} zones analyzed\n\n` +
        `• No Change: **${ctx.no_change.toFixed(1)}%** (${ctx.no_change_areas} zones)\n` +
        `• Change: **${ctx.change.toFixed(1)}%** (${ctx.changed_areas} zones) — ${changeFlag}\n` +
        `• Demolished: **${ctx.demolished.toFixed(1)}%** (${ctx.demolished_areas} zones) — ${demFlag}\n\n` +
        `Generating recommendations...`;

      setMessages([{ role: "assistant", text: greetText, id: Date.now() }]);

      // Auto fetch recommendations
      setTimeout(async () => {
        setLoading(true);
        try {
          const res  = await fetch(`${API_BASE_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message:
                `Based on these exact results — No Change: ${ctx.no_change.toFixed(1)}%, ` +
                `Change: ${ctx.change.toFixed(1)}%, Demolished: ${ctx.demolished.toFixed(1)}% — ` +
                `provide specific numbered actionable recommendations for urban planners, ` +
                `environmental authorities, and policymakers. Be direct and precise.`,
              context: ctx,
              history: [],
            }),
          });
          const data = await res.json();
          if (!data.error) {
            setMessages((prev) => [...prev, { role: "assistant", text: data.reply, id: Date.now(), isRec: true }]);
            setTimeout(() => speak(data.reply), 300);
          }
        } catch { /* silent */ }
        finally { setLoading(false); }
      }, 600);
    }
  }, [open, initialized, stateData]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* ── Focus input ── */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  /* ── Send message ── */
  const sendMessage = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || loading) return;
    stopSpeaking();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText, id: Date.now() }]);
    setLoading(true);
    const history = messages.slice(-20).map((m) => ({ role: m.role, text: m.text }));
    try {
      const res  = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, context: buildContext(), history }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${data.error}`, id: Date.now(), isError: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply, id: Date.now() }]);
        speak(data.reply);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "⚠️ Server unreachable.", id: Date.now(), isError: true }]);
    } finally { setLoading(false); }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* ── Floating bubble — recommendation icon ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="AI Land Change Recommendations"
        className={
          "fixed bottom-6 right-6 z-[3500] flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 " +
          (open
            ? "bg-slate-800 border border-white/20"
            : "bg-gradient-to-br from-cyan-500 to-indigo-600 hover:scale-110 hover:shadow-cyan-500/40")
        }
      >
        {open
          ? <X size={22} className="text-white" />
          : <BarChart3 size={22} className="text-white" />
        }
        {!open && <span className="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping" />}
      </button>

      {/* ── Chat panel ── */}
      <div
        className={
          "fixed bottom-24 right-6 z-[3400] flex flex-col transition-all duration-300 ease-in-out " +
          (open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-6 pointer-events-none")
        }
        style={{ width: "min(420px, calc(100vw - 3rem))", height: "540px" }}
      >
        <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-indigo-600/10 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/20">
              <BarChart3 size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Land Change Advisor</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                AI Recommendations · Groq
              </div>
            </div>
            {/* TTS toggle */}
            <button
              onClick={() => { setTtsEnabled((v) => !v); stopSpeaking(); }}
              title={ttsEnabled ? "Mute Urdu voice" : "Enable Urdu voice"}
              className={
                "flex h-8 w-8 items-center justify-center rounded-lg border transition " +
                (ttsEnabled
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                  : "border-white/10 bg-white/5 text-slate-500 hover:bg-white/10")
              }
            >
              {ttsEnabled
                ? speaking ? <Volume2 size={14} className="animate-pulse" /> : <Volume2 size={14} />
                : <VolumeX size={14} />
              }
            </button>
          </div>

          {/* Messages — no scrollbar */}
          <div
            className="flex-1 px-4 py-3 space-y-3"
            style={{ overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <style>{`.chatbot-scroll::-webkit-scrollbar { display: none; }`}</style>

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-600/20 border border-cyan-500/20">
                  <BarChart3 size={28} className="text-cyan-400" />
                </div>
                <div className="text-sm text-slate-300 font-medium">Loading analysis…</div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={"flex gap-2.5 " + (msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 " +
                  (msg.role === "user"
                    ? "bg-indigo-600/30 border border-indigo-500/30"
                    : msg.isRec
                      ? "bg-emerald-500/20 border border-emerald-500/20"
                      : "bg-cyan-500/20 border border-cyan-500/20")
                }>
                  {msg.role === "user"
                    ? <User       size={13} className="text-indigo-300" />
                    : msg.isRec
                      ? <BarChart3 size={13} className="text-emerald-300" />
                      : <Bot       size={13} className="text-cyan-300" />
                  }
                </div>

                <div className={
                  "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed " +
                  (msg.role === "user"
                    ? "bg-indigo-600/25 border border-indigo-500/20 text-slate-100 rounded-tr-sm"
                    : msg.isError
                      ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-sm"
                      : msg.isRec
                        ? "bg-emerald-500/8 border border-emerald-500/15 text-slate-200 rounded-tl-sm"
                        : "bg-white/5 border border-white/8 text-slate-200 rounded-tl-sm")
                }>
                  <MessageText text={msg.text} />

                  {/* Replay Urdu voice */}
                  {msg.role === "assistant" && !msg.isError && (
                    <button
                      onClick={() => speak(msg.text)}
                      title="Urdu mein sunein"
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500 hover:text-cyan-400 transition"
                    >
                      <Volume2 size={11} />
                      <span>اردو آواز میں سنیں</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 bg-emerald-500/20 border border-emerald-500/20">
                  <BarChart3 size={13} className="text-emerald-300" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-white/5 border border-white/8 px-4 py-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {messages.length >= 2 && !loading && (
            <div className="px-4 pb-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5">Ask more</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-[11px] text-cyan-300 transition hover:bg-cyan-500/15 hover:border-cyan-400/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input row — no textarea resize bar */}
          <div className="border-t border-white/10 px-3 py-3">
            {listening && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs text-red-300">Listening…</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Mic */}
              {micSupported && (
                <button
                  onClick={toggleMic}
                  disabled={loading}
                  title={listening ? "Stop" : "Speak"}
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition " +
                    (listening
                      ? "border-red-500/40 bg-red-500/20 text-red-300 animate-pulse"
                      : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white")
                  }
                >
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}

              {/* Input — no resize handle */}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={listening ? "Listening…" : "Ask about results…"}
                disabled={loading || listening}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] text-white placeholder-slate-500 outline-none transition focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 disabled:opacity-60"
              />

              {/* Send / Stop */}
              {speaking ? (
                <button
                  onClick={stopSpeaking}
                  title="Stop"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition"
                >
                  <VolumeX size={15} />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-md shadow-cyan-500/20 transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                >
                  {loading
                    ? <Loader   size={15} className="text-white animate-spin" />
                    : <BarChart3 size={15} className="text-white" />
                  }
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
