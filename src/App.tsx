import { useEffect, useState } from "react";
import { api } from "./services/api";
import { THEMES, useTheme } from "./theme";
import { useHashRoute } from "./hooks";
import Wordmark from "./components/Wordmark";
import Login from "./pages/Login";
import Lab from "./pages/Lab";
import Experiments from "./pages/Experiments";
import Compare from "./pages/Compare";
import Gallery from "./pages/Gallery";

const NAV = [
  { id: "lab", label: "Lab", d: "M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3M8 3h8M7 15h10" },
  { id: "experiments", label: "Experiments", d: "M4 5h16M4 12h16M4 19h10" },
  { id: "compare", label: "Compare", d: "M4 4h7v16H4zM13 4h7v16h-7z" },
  { id: "gallery", label: "Gallery", d: "M3 5h8v8H3zM13 5h8v5h-8zM13 12h8v7h-8zM3 15h8v4H3z" },
] as const;

export default function App() {
  const { theme, setTheme, colors } = useTheme();
  const hash = useHashRoute();
  const [user, setUser] = useState<string | null | undefined>(undefined); // undefined = still checking
  const [startupError, setStartupError] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<{ id: string; rerun: boolean } | null>(null);

  useEffect(() => { api.me().then((r) => setUser(r.username)).catch((e: Error) => { setStartupError(e.message); setUser(null); }); }, []);

  const [, route = "lab", a, b] = hash.split("/");
  const page = NAV.some((n) => n.id === route) ? route : "lab";
  const goto = (h: string) => { window.location.hash = h; };
  const open = (id: string, rerun = false) => { setOpenRequest({ id, rerun }); goto("#/lab"); };
  const signOut = async () => { await api.logout().catch(() => {}); setUser(null); setOpenRequest(null); };

  if (user === undefined) return <div className="boot">Starting RE:VISION…</div>;
  if (user === null) return (
    <>
      {startupError && <div className="note err" role="alert" style={{ margin: 16 }}>{startupError}</div>}
      <Login onSignedIn={(u) => { setStartupError(null); setUser(u); }} />
    </>
  );

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <a href="#/lab" className="rail-brand"><Wordmark /></a>
        <ul>
          {NAV.map((n) => (
            <li key={n.id}>
              <a href={`#/${n.id}`} aria-current={page === n.id ? "page" : undefined}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.d} /></svg>
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="rail-foot">
          <div className="themes" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} className={`swatch ${theme === t.id ? "on" : ""}`} title={t.label} aria-label={`${t.label} theme`} aria-pressed={theme === t.id}
                style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 0 45%, ${t.swatch[1]} 45% 75%, ${t.swatch[2]} 75%)` }} onClick={() => setTheme(t.id)} />
            ))}
          </div>
          <p className="whoami">Signed in as <b>{user}</b></p>
          <button className="btn ghost small" onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <div className="content">
        <div hidden={page !== "lab"}><Lab active={page === "lab"} colors={colors} owner={user} openRequest={openRequest} onRequestHandled={() => setOpenRequest(null)} /></div>
        {page === "experiments" && <Experiments me={user} onOpen={open} goto={goto} />}
        {page === "compare" && <Compare aId={a && a !== "-" ? a : undefined} bId={b && b !== "-" ? b : undefined} goto={goto} colors={colors} />}
        {page === "gallery" && <Gallery me={user} colors={colors} onOpen={(id) => open(id)} />}
      </div>
    </div>
  );
}
