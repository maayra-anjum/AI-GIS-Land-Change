import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import "leaflet-control-geocoder";

/* ─── Custom draw-toolbar icon SVGs injected via CSS ─────────────────────── */
const DRAW_ICON_CSS = `
  /* ── Zoom controls ── */
  .leaflet-control-zoom {
    border: none !important;
    box-shadow: 0 4px 24px rgba(0,0,0,0.45) !important;
    border-radius: 14px !important;
    overflow: hidden;
    backdrop-filter: blur(16px);
  }
  .leaflet-control-zoom a {
    width: 36px !important;
    height: 36px !important;
    line-height: 36px !important;
    font-size: 18px !important;
    font-weight: 300 !important;
    background: rgba(15,23,42,0.85) !important;
    color: #e2e8f0 !important;
    border: none !important;
    border-bottom: 1px solid rgba(255,255,255,0.07) !important;
    transition: background 0.2s, color 0.2s !important;
  }
  .leaflet-control-zoom a:last-child { border-bottom: none !important; }
  .leaflet-control-zoom a:hover {
    background: rgba(99,102,241,0.55) !important;
    color: #fff !important;
  }

  /* ── Draw toolbar container ── */
  .leaflet-draw-toolbar {
    border: none !important;
    box-shadow: 0 4px 24px rgba(0,0,0,0.45) !important;
    border-radius: 14px !important;
    overflow: hidden;
    backdrop-filter: blur(16px);
    margin-top: 8px !important;
  }
  .leaflet-draw-toolbar a {
    width: 36px !important;
    height: 36px !important;
    background-color: rgba(15,23,42,0.85) !important;
    border: none !important;
    border-bottom: 1px solid rgba(255,255,255,0.07) !important;
    transition: background 0.2s !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .leaflet-draw-toolbar a:last-child { border-bottom: none !important; }
  .leaflet-draw-toolbar a:hover {
    background: rgba(99,102,241,0.55) !important;
  }

  /* ── Replace default sprite icons with SVG data-URIs ── */
  /* Polygon tool */
  .leaflet-draw-draw-polygon {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2367e8f9' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5'/%3E%3C/svg%3E") !important;
    background-size: 20px 20px !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
  }
  /* Rectangle tool */
  .leaflet-draw-draw-rectangle {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2367e8f9' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='14' rx='2'/%3E%3C/svg%3E") !important;
    background-size: 20px 20px !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
  }
  /* Edit tool */
  .leaflet-draw-edit-edit {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a78bfa' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'/%3E%3C/svg%3E") !important;
    background-size: 18px 18px !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
  }
  /* Delete tool */
  .leaflet-draw-edit-remove {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f87171' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='3 6 5 6 21 6'/%3E%3Cpath d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/%3E%3Cpath d='M10 11v6M14 11v6'/%3E%3Cpath d='M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/%3E%3C/svg%3E") !important;
    background-size: 18px 18px !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
  }

  /* ── Drawn shape styles ── */
  .leaflet-interactive {
    stroke: #67e8f9 !important;
    stroke-width: 2.5 !important;
    fill: rgba(103,232,249,0.12) !important;
  }
  /* While actively drawing */
  .leaflet-draw-guide-dash {
    background: #67e8f9 !important;
  }
  /* ── Draw tooltip text ── */
  .leaflet-draw-tooltip {
    background: rgba(15,23,42,0.9) !important;
    border: 1px solid rgba(103,232,249,0.4) !important;
    color: #67e8f9 !important;
    border-radius: 8px !important;
    font-size: 12px !important;
    padding: 4px 10px !important;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4) !important;
  }
  .leaflet-draw-tooltip-single {
    margin-top: -8px !important;
  }
  .leaflet-draw-tooltip-subtext {
    color: #94a3b8 !important;
    font-size: 11px !important;
  }
  /* Edit vertex handles — plain solid dots, no glow */
  .leaflet-editing-icon {
    background: #67e8f9 !important;
    border: 2px solid #0f172a !important;
    border-radius: 50% !important;
    box-shadow: none !important;
    width: 10px !important;
    height: 10px !important;
    margin-left: -5px !important;
    margin-top: -5px !important;
  }
  /* Middle-point ghost handles — slightly dimmer, no glow */
  .leaflet-editing-icon.leaflet-div-icon {
    background: rgba(103,232,249,0.5) !important;
    box-shadow: none !important;
  }

  /* ── Geocoder ── */
  .leaflet-control-geocoder {
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }
  .leaflet-control-geocoder-form input {
    background: rgba(15,23,42,0.85) !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
    padding: 7px 12px !important;
    font-size: 13px !important;
    outline: none !important;
    transition: border-color 0.2s !important;
    backdrop-filter: blur(12px) !important;
  }
  .leaflet-control-geocoder-form input:focus {
    border-color: rgba(103,232,249,0.5) !important;
    box-shadow: 0 0 0 3px rgba(103,232,249,0.1) !important;
  }
  .leaflet-control-geocoder-form input::placeholder { color: #64748b !important; }
  .leaflet-control-geocoder-results {
    background: rgba(15,23,42,0.95) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 10px !important;
    margin-top: 4px !important;
    overflow: hidden !important;
    backdrop-filter: blur(16px) !important;
  }
  .leaflet-control-geocoder-results li a {
    color: #cbd5e1 !important;
    font-size: 12px !important;
    padding: 8px 12px !important;
    border-bottom: 1px solid rgba(255,255,255,0.05) !important;
  }
  .leaflet-control-geocoder-results li a:hover {
    background: rgba(99,102,241,0.25) !important;
    color: #fff !important;
  }
`;

export default function MapComponent({ setDrawnPolygon }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const mapRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* Inject custom CSS once */
  useEffect(() => {
    const styleId = "map-draw-custom-css";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = DRAW_ICON_CSS;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (mapRef.current) return;

    // Start zoomed out to show the whole globe, then animate in
    const map = L.map("map", {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      worldCopyJump: false,
    });
    mapRef.current = map;

    /* Tile layer */
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    /* Globe spin animation — rotate around earth then fly to Pakistan */
    let frame = 0;
    const totalFrames = 80;
    const spinInterval = setInterval(() => {
      frame++;
      const t = frame / totalFrames;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const lng  = 0   + (67  - 0)   * ease;
      const lat  = 20  + (30  - 20)  * ease;
      const zoom = 2   + (4   - 2)   * ease;
      map.setView([lat, lng], zoom, { animate: false });
      if (frame >= totalFrames) {
        clearInterval(spinInterval);
        map.flyTo([30.3753, 69.3451], 5, { duration: 1.2, easeLinearity: 0.4 });
      }
    }, 18);

    /* Zoom control — top-right */
    L.control.zoom({ position: "topright" }).addTo(map);

    /* Drawn items layer */
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    /* Area helper */
    const calcArea = (layer) => {
      if (layer instanceof L.Polygon) {
        const latlngs = layer.getLatLngs()[0];
        const area = L.GeometryUtil.geodesicArea(latlngs);
        return (area / 1e6).toFixed(3) + " km²";
      }
      return "N/A";
    };

    const bindPopup = (layer) => {
      const type = layer instanceof L.Rectangle ? "Rectangle" : "Polygon";
      const area = calcArea(layer);
      const pointCount = layer instanceof L.Polygon ? layer.getLatLngs()[0].length : 4;
      layer.bindPopup(
        `<div style="font-size:13px;line-height:1.6">
          <b style="color:#67e8f9">${type}</b><br/>
          <span style="color:#94a3b8">Points:</span> <b style="color:#f1f5f9">${pointCount}</b><br/>
          <span style="color:#94a3b8">Area:</span> <b style="color:#f1f5f9">${area}</b>
        </div>`,
        { className: "custom-popup" }
      );
    };

    /* Draw control with proper polygon configuration */
    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false, // Disable area calculation to prevent errors
          repeatMode: false,
          shapeOptions: {
            color: "#67e8f9",
            fillColor: "#67e8f9",
            fillOpacity: 0.12,
            weight: 2.5,
          },
          drawError: {
            color: "#f87171",
            message: "<strong>Error:</strong> shape edges cannot cross!",
          },
          icon: new L.DivIcon({
            iconSize: new L.Point(8, 8),
            className: 'leaflet-div-icon leaflet-editing-icon'
          }),
        },
        rectangle: {
          shapeOptions: {
            color: "#67e8f9",
            fillColor: "#67e8f9",
            fillOpacity: 0.12,
            weight: 2.5,
          },
        },
        circle: false,
        polyline: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    });
    map.addControl(drawControl);

    // Log when drawing starts to debug
    map.on(L.Draw.Event.DRAWSTART, (e) => {
      console.log('Drawing started:', e.layerType);
    });

    // Log each vertex added
    map.on(L.Draw.Event.DRAWVERTEX, (e) => {
      console.log('Vertex added, total layers:', e.layers.getLayers().length);
    });

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);
      bindPopup(layer);
      layer.openPopup();
      if (setDrawnPolygon) setDrawnPolygon(layer.toGeoJSON());
    });

    map.on(L.Draw.Event.EDITED, (e) => {
      e.layers.eachLayer((layer) => {
        bindPopup(layer);
        if (setDrawnPolygon) setDrawnPolygon(layer.toGeoJSON());
      });
    });

    map.on(L.Draw.Event.DELETED, () => {
      if (setDrawnPolygon) setDrawnPolygon(null);
    });

    /* Geocoder — moves into the navbar search slot */
    const geocoder = L.Control.geocoder({
      defaultMarkGeocode: false,
      placeholder: "Search location…",
      collapsed: false,
      position: "topleft",
      geocoder: new L.Control.Geocoder.Nominatim({
        geocodingQueryParams: { countrycodes: "PK", limit: 5 },
      }),
    }).addTo(map);

    /* Move geocoder DOM into the navbar #search-bar-container slot */
    const tryMoveGeocoder = () => {
      const geocoderEl = document.querySelector(".leaflet-control-geocoder");
      const slot = document.getElementById("search-bar-container");
      if (slot && geocoderEl && !slot.contains(geocoderEl)) {
        slot.appendChild(geocoderEl);
        geocoderEl.style.position = "relative";
        geocoderEl.style.width = "100%";
        geocoderEl.style.boxShadow = "none";
        geocoderEl.style.border = "none";
        geocoderEl.style.background = "transparent";
      }
    };
    // Try immediately and after a short delay (Leaflet may not have rendered yet)
    tryMoveGeocoder();
    setTimeout(tryMoveGeocoder, 100);

    geocoder.on("markgeocode", (e) => {
      const latlng = e.geocode.center;
      map.setView(latlng, 13);
      L.marker(latlng)
        .addTo(map)
        .bindPopup(`<b style="color:#67e8f9">${e.geocode.name}</b>`)
        .openPopup();
    });

    return () => {
      map.remove();
    };
  }, [setDrawnPolygon]);

  return (
    <div
      id="map"
      style={{
        height: isMobile ? "calc(100vh - 64px - 60px)" : "calc(100vh - 64px)",
        width: "100%",
        borderRadius: 0,
      }}
    />
  );
}
