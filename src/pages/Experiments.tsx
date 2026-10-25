import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { MODEL_LIST } from "../services/models";
import { grade } from "../services/robustness";
import type { ExperimentSummary } from "../types/experiment";

export default function Experiments({ me, onOpen, goto }: { me: string; onOpen: (id: string, rerun: boolean) => void; goto: (hash: string) => void }) {
  const [rows, setRows] = useState<ExperimentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [modelF, setModelF] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const load = () => api.list().then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (!mineOnly || r.owner === me) && (!modelF || r.modelId === modelF) &&
    (!q || `${r.title} ${r.imageName} ${r.owner}`.toLowerCase().includes(q.toLowerCase()))), [rows, mineOnly, modelF, q, me]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));
  const remove = async (r: ExperimentSummary) => {
    if (!confirm(`Delete "${r.title}"? Gallery items that use it are removed too.`)) return;
    try { await api.remove(r.id); setPicked((p) => p.filter((x) => x !== r.id)); load(); } catch (e) { setError((e as Error).message); }
  };
  const toggleShare = async (r: ExperimentSummary) => { try { await api.setShared(r.id, !r.shared); load(); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Experiments</h1>
        <p className="muted">Everything saved on this server. Tick two to compare them side by side, for example the same image tested with two different models.</p>
      </header>
      <div className="toolbar">
        <input type="search" placeholder="Search title, image or person" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={modelF} onChange={(e) => setModelF(e.target.value)} aria-label="Filter by model">
          <option value="">All models</option>
          {MODEL_LIST.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine</label>
        <button className="btn" disabled={picked.length !== 2} onClick={() => goto(`#/compare/${picked[0]}/${picked[1]}`)}>Compare the two selected</button>
      </div>
      {error && <div className="note err" role="alert">{error}</div>}
      {rows === null && !error && <div className="note">Loading experiments…</div>}
      {rows && shown.length === 0 && <div className="empty-state"><h2>{rows.length ? "Nothing matches" : "No experiments yet"}</h2><p>{rows.length ? "Try clearing the filters." : "Run a stress test in the Lab, then choose Save experiment. It will appear here for everyone."}</p></div>}
      <ul className="exp-list">
        {shown.map((r) => (
          <li key={r.id} className={picked.includes(r.id) ? "on" : ""}>
            <label className="pick"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title} to compare`} /></label>
            <div className="exp-main">
              <h3>{r.title}</h3>
              <p className="muted">{r.modelLabel}, {r.width}×{r.height}, {r.points} stress runs{r.combos ? `, ${r.combos} combined cases` : ""}</p>
              <p className="muted">By {r.owner === me ? "you" : r.owner}, {new Date(r.createdAt).toLocaleString()}{r.owner === me && !r.shared ? ", private" : ""}</p>
            </div>
            <div className="exp-score"><b>{r.overall === null ? "N/A" : Math.round(r.overall)}</b><span>{grade(r.overall)}</span></div>
            <div className="exp-actions">
              <button className="btn small" onClick={() => onOpen(r.id, false)}>Open</button>
              <button className="btn ghost small" onClick={() => onOpen(r.id, true)} title="Run it again with the saved settings and check the results match">Re-run and verify</button>
              {r.owner === me && <button className="btn ghost small" onClick={() => toggleShare(r)}>{r.shared ? "Make private" : "Share"}</button>}
              {r.owner === me && <button className="btn ghost small" onClick={() => remove(r)}>Delete</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
