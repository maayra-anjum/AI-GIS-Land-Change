# AI-GIS Land Change Detection — Frontend

React-based frontend for the AI-GIS Land Change Detection system. Users draw a polygon on an interactive map over Pakistan, select a year range, and the application fetches Sentinel-2 satellite imagery, runs AI classification, and displays results with charts, maps, and AI-powered recommendations.

---

## Tech Stack

- **React 19** — UI framework
- **Vite 7** — build tool and dev server
- **Tailwind CSS 4** — utility-first styling
- **React Router DOM 7** — client-side routing
- **Leaflet + react-leaflet** — interactive maps
- **leaflet-draw** — polygon/rectangle drawing tools
- **leaflet-control-geocoder** — location search
- **Recharts** — data visualization charts
- **Lucide React** — icons
- **jsPDF** — PDF report generation

---

## Folder Structure

```
frontend/
│
├── src/
│   ├── App.jsx                   # Root component — routing and layout
│   ├── App.css                   # Global app styles
│   ├── main.jsx                  # React DOM entry point
│   ├── index.css                 # Tailwind imports and global CSS classes
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx         # Home page — map + control panel
│   │   └── Results.jsx           # Results page — charts, map view, report, AI recommendations
│   │
│   ├── components/
│   │   ├── Navbar.jsx            # Top navigation bar with tabs
│   │   ├── MapComponent.jsx      # Leaflet map with drawing tools and geocoder
│   │   ├── ControlPanel.jsx      # Year selector, fetch & predict button, status
│   │   ├── Chatbot.jsx           # Floating AI recommendations panel (voice support)
│   │   ├── Footer.jsx            # Footer shown on Results page
│   │   ├── ImageCard.jsx         # Reusable image display card
│   │   ├── Loader.jsx            # Loading spinner component
│   │   └── ChartTemp.jsx         # Chart template component
│   │
│   ├── services/
│   │   └── api.js                # API call functions to Flask backend
│   │
│   └── utils/
│       └── mapUtils.js           # Map helper utilities
│
├── index.html                    # HTML entry point
├── package.json                  # Dependencies and scripts
├── vite.config.js                # Vite configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── postcss.config.js             # PostCSS configuration
└── .gitignore                    # Files excluded from git
```

---

## File-by-File Description

### `src/main.jsx`
React application entry point. Mounts the root `<App />` component into the `#root` DOM element.

### `src/App.jsx`
Root application component:
- Sets up `BrowserRouter` for client-side routing
- Defines two routes: `/` (Dashboard) and `/results` (Results)
- Renders `<Navbar>` with conditional props based on current route
- Renders `<Footer>` only on the Results page
- Sets global dark gradient background

### `src/index.css`
Global CSS file with Tailwind configuration and custom component classes:
- `.glass-card` — frosted glass card style used throughout the app
- `.btn-primary` — gradient primary button (cyan to indigo)
- `.btn-secondary` — transparent secondary button
- `.select-modern` — styled dropdown select
- `.label-modern` — styled form label
- `.shimmer` — loading shimmer animation
- Leaflet popup dark theme overrides

---

## Pages

### `src/pages/Dashboard.jsx`
Main home page that users land on:
- Full-screen Leaflet map as background canvas
- Collapsible control panel on the left side
- Toast notification system (stacked, auto-dismiss)
- Stores `startYear` and `endYear` in `localStorage`
- Passes `drawnPolygon` state from map to control panel
- Mobile-responsive with collapsible panel toggle

### `src/pages/Results.jsx`
Results display page with 4 tabs:

**Tab 1 — Analysis**
- 3 stat cards: No Change (green), Change (red), Demolished (blue) with percentages
- Line chart showing distribution across categories using Recharts
- Color-coded legend

**Tab 2 — Map View**
- React-Leaflet map with `CircleMarker` for each predicted patch
- Color coding: Green = No Change, Red = Change, Blue = Demolished
- `ImageOverlay` showing color map from backend
- Area count summary cards

**Tab 3 — Report**
- Session details table (ID, years, date)
- Results summary with animated progress bars
- Geographic bounds display
- Color legend explanation
- PDF download via jsPDF — generates a professional report

**Tab 4 — AI Recommendations**
- Auto-fetches recommendations from Groq API when tab is opened
- Loading state with spinner
- 5 numbered recommendation cards with alternating color themes
- Each card has a title and detailed body text
- Disclaimer note about AI-generated content

---

## Components

### `src/components/Navbar.jsx`
Top navigation bar:
- App brand name and subtitle
- On Dashboard: renders geocoder search bar slot (`#search-bar-container`)
- On Results: renders tab navigation buttons (Analysis, Map View, Report, AI Recommendations)
- "New Analysis" button to go back to Dashboard
- Live indicator pulse animation
- Dispatches `results-tab` custom event for tab switching

### `src/components/MapComponent.jsx`
Core interactive map component using Leaflet:
- Globe spin animation on load → flies to Pakistan
- OpenStreetMap tile layer
- **Drawing tools**: Polygon and Rectangle (via leaflet-draw)
  - Custom SVG icons for toolbar buttons
  - Area calculation popup on drawn shapes
  - Passes drawn polygon GeoJSON to parent via `setDrawnPolygon`
- **Geocoder**: Location search (restricted to Pakistan only via `countrycodes: "PK"`)
  - Moved into Navbar's `#search-bar-container` slot
- Custom CSS for dark-themed map controls, popups, and draw tooltips
- Responsive — adjusts height for mobile vs desktop

### `src/components/ControlPanel.jsx`
Left-side control panel on the Dashboard:
- Start Year / End Year dropdowns (2021–2025)
- **Pakistan validation** — checks polygon bounds before API call
- **Fetch & Predict button** — triggers the full pipeline:
  1. POST `/fetch-image` → gets Sentinel-2 images
  2. POST `/prediction/predict` → runs AI classification
- 4-step progress indicator: Fetching Data → Processing Patches → Running Predictions → Completed
- Error state with retry button
- Saves year selections to `localStorage`
- Navigates to `/results` on success with full result state

### `src/components/Chatbot.jsx`
Floating AI recommendations widget (bottom-right corner):
- Opens/closes with a `BarChart3` icon button
- **Auto-loads recommendations** on first open using the current result context
- Shows result summary (No Change/Change/Demolished %) with severity flags
- Numbered recommendation cards with colored avatars
- **Voice output**: Attempts Urdu (`ur-PK`) voice first, falls back to English
  - Toggle mute/unmute in header
  - "اردو آواز میں سنیں" replay button on each message
- **Voice input**: Microphone support (Chrome/Edge)
- Text input field for follow-up questions
- Quick question chips after recommendations load
- No scrollbar (clean look)
- Groq API powers all responses

### `src/components/Footer.jsx`
Simple footer displayed at the bottom of the Results page with attribution and copyright.

### `src/components/ImageCard.jsx`
Reusable card component for displaying satellite images with title and metadata overlay.

### `src/components/Loader.jsx`
Animated loading spinner component used during API calls.

### `src/components/ChartTemp.jsx`
Chart template/placeholder component.

---

## Services

### `src/services/api.js`
Centralized API call functions:
- `fetchImages(polygon, startYear, endYear)` — calls `POST /fetch-image`
- Uses `VITE_API_URL` environment variable for base URL
- Falls back to `http://localhost:5000`

---

## Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Dashboard` | Home — map and control panel |
| `/results` | `Results` | Results — charts, map, report, recommendations |

Results data is passed via React Router `location.state` and backed up in `sessionStorage` for page refresh recovery.

---

## Data Flow

```
User draws polygon on map
        ↓
ControlPanel validates Pakistan bounds
        ↓
POST /fetch-image → GEE fetches Sentinel-2 images
        ↓
POST /prediction/predict → ResNet50 classifies patches
        ↓
Navigate to /results with prediction data
        ↓
Results page renders:
  - Stat cards + line chart (Analysis tab)
  - Map with colored markers (Map View tab)
  - PDF-ready report (Report tab)
  - Groq AI recommendations (AI Recommendations tab)
```

---

## Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
# Backend API URL
VITE_API_URL=http://localhost:5000
```

For production deployment, set this to your deployed backend URL.

---

## Installation & Setup

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Set up environment (optional, defaults to localhost:5000)
# Create .env file:
echo "VITE_API_URL=http://localhost:5000" > .env

# 4. Start development server
npm run dev
```

App runs at: `http://localhost:5173`

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

---

## Key Features

### Pakistan-Only Restriction
- Frontend validates polygon coordinates before sending to backend
- Geocoder search restricted to Pakistan (`countrycodes: "PK"`)
- Clear error message shown if user draws outside Pakistan

### Responsive Design
- Mobile: collapsible control panel, adjusted map height, hidden labels
- Desktop: full sidebar panel, complete navigation labels

### Voice Support (Chatbot)
- Voice input via Web Speech API (Chrome/Edge only)
- Voice output attempts Urdu (`ur-PK`) language first
- Works in background while browsing other tabs

### PDF Report Generation
- Client-side PDF using jsPDF (no server needed)
- Includes session details, result percentages, bounds, color legend
- Dark header with cyan accent colors matching the app theme

---

## Dependencies (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.3 | UI framework |
| react-dom | ^19.2.3 | DOM rendering |
| react-router-dom | ^7.13.1 | Client routing |
| leaflet | ^1.9.4 | Interactive maps |
| react-leaflet | ^5.0.0 | React wrapper for Leaflet |
| leaflet-draw | ^1.0.4 | Drawing tools on map |
| leaflet-control-geocoder | ^3.3.1 | Location search |
| recharts | ^3.8.0 | Charts and graphs |
| lucide-react | ^1.0.1 | Icon library |
| jspdf | ^4.2.1 | PDF generation |
| prop-types | ^15.8.1 | Runtime type checking |
