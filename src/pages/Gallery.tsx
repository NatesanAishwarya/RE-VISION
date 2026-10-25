import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { GalleryItem } from "../services/api";
import { analyse } from "../services/analysis";
import { KIND_LABEL, failureDetail } from "../services/failures";
import type { Failure, FailureKind } from "../services/failures";
import { CONDITION_LABEL } from "../services/transform";
import { useImage } from "../hooks";
import FailureThumb from "../components/FailureThumb";
import type { Experiment, ExperimentSummary } from "../types/experiment";
import type { ThemeColors } from "../theme";

function Card({ item, me, colors, onDelete, onOpen }: { item: GalleryItem; me: string; colors: ThemeColors; onDelete: () => void; onOpen: () => void }) {
  const img = useImage(api.imageUrl(item.experimentId));
  const f = item.data;
  return (
    <article className="gcard">
      {img ? <FailureThumb image={img} failure={f} colors={colors} /> : <div className="thumb loading">Loading…</div>}
      <p><b>{KIND_LABEL[f.kind] ?? item.kind}:</b> {f.className}, {CONDITION_LABEL[f.condition]?.toLowerCase()} {f.severity}</p>
      <small>{failureDetail(f)}</small>
      {item.note && <p className="prose">“{item.note}”</p>}
      <small>{item.modelLabel}, from {item.experimentTitle}, added by {item.owner === me ? "you" : item.owner}</small>
      <div className="row"><button className="btn ghost small" onClick={onOpen}>Open experiment</button>{item.owner === me && <button className="btn ghost small" onClick={onDelete}>Remove</button>}</div>
    </article>
  );
}

const KINDS: FailureKind[] = ["missed", "confidence_drop", "shifted", "false_positive"];

export default function Gallery({ me, colors, onOpen }: { me: string; colors: ThemeColors; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [kind, setKind] = useState<FailureKind | "">("");
  const [error, setError] = useState<string | null>(null);
  const [exps, setExps] = useState<ExperimentSummary[]>([]);
  const [pickId, setPickId] = useState("");
  const [exp, setExp] = useState<Experiment | null>(null);
  const [note, setNote] = useState("");

  const load = () => api.gallery().then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); api.list().then(setExps).catch(() => {}); }, []);
  useEffect(() => {
    if (!pickId) return;
    let live = true;
    api.get(pickId).then((e) => live && setExp(e)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [pickId]);

  const cands = useMemo(() => (exp ? analyse({ title: exp.title, modelLabel: exp.modelLabel, settings: exp.settings, thresholds: exp.thresholds, baseline: exp.baseline, points: exp.points, combos: exp.combos, realWorld: exp.realWorld }).candidates : []), [exp]);
  const img = useImage(exp ? api.imageUrl(exp.id) : null);
  const shown = (items ?? []).filter((i) => !kind || i.kind === kind);
  const pin = async (f: Failure) => { try { await api.pin(exp!.id, f, note.trim()); setNote(""); load(); } catch (e) { setError((e as Error).message); } };
  const unpin = async (id: string) => { try { await api.unpin(id); load(); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Failure gallery</h1>
        <p className="muted">Examples of detections that went wrong under stress: objects that vanished, lost confidence, moved, or appeared from nowhere. Everyone who signs in can add to it.</p>
      </header>
      {error && <div className="note err" role="alert">{error}</div>}
      <div className="toolbar">
        <div className="chips" role="group" aria-label="Filter by kind">
          <button className={`chip ${kind === "" ? "on" : ""}`} onClick={() => setKind("")}>All</button>
          {KINDS.map((k) => <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
      </div>
      {items === null && !error && <div className="note">Loading the gallery…</div>}
      {items && shown.length === 0 && <div className="empty-state"><h2>No examples here yet</h2><p>Choose an experiment below and add the failures worth remembering.</p></div>}
      <div className="gallery-grid">
        {shown.map((i) => <Card key={i.id} item={i} me={me} colors={colors} onDelete={() => unpin(i.id)} onOpen={() => onOpen(i.experimentId)} />)}
      </div>

      <section className="panel">
        <h2>Add examples from an experiment</h2>
        <div className="row">
          <select value={pickId} onChange={(e) => { setExp(null); setPickId(e.target.value); }} aria-label="Experiment">
            <option value="">Choose an experiment…</option>
            {exps.map((e) => <option key={e.id} value={e.id}>{e.title}, {e.modelLabel}, {e.owner}</option>)}
          </select>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, such as why it matters" maxLength={300} aria-label="Note" />
        </div>
        {exp && !cands.length && <p className="muted">This experiment has no recorded failures to add. Experiments saved without a stress test have none.</p>}
        <div className="gallery-grid">
          {img && cands.map((f, i) => (
            <article key={i} className="gcard">
              <FailureThumb image={img} failure={f} colors={colors} />
              <p><b>{KIND_LABEL[f.kind]}:</b> {f.className}, {CONDITION_LABEL[f.condition].toLowerCase()} {f.severity}</p>
              <small>{failureDetail(f)}</small>
              <button className="btn small" onClick={() => pin(f)}>Add to gallery</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
