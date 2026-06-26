import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Results from "./pages/Results";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

function Layout() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";
  const isResults   = location.pathname === "/results";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <Navbar resultsTabs={isResults} searchSlot={isDashboard} />

      <main className="flex flex-1 flex-col pt-16">
        <Routes>
          <Route path="/"       element={<Dashboard />} />
          <Route path="/results" element={<Results />} />
        </Routes>
      </main>

      {isResults && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}
