export default function Footer() {
  return (
    <footer className="w-full border-t border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-4 sm:flex-row">

        <span className="text-xs font-semibold text-white">AI-GIS Land Change Detection</span>

        <span className="text-[11px] text-slate-400">
          Powered by Sentinel-2 · Google Earth Engine · ResNet50
        </span>

        <span className="text-[11px] text-slate-500">
          © {new Date().getFullYear()} AI-GIS · All rights reserved
        </span>

      </div>
    </footer>
  );
}
