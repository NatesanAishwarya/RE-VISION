import { useState } from "react";
import { api } from "../services/api";
import Wordmark from "../components/Wordmark";

export default function Login({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = mode === "in" ? await api.login(username.trim(), password) : await api.register(username.trim(), password);
      onSignedIn(r.username);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="login">
      <section className="login-hero" aria-hidden="true">
        <Wordmark size="lg" />
        <div className="stress-stack">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ filter: `blur(${[0, 1.2, 2.6, 4.4, 7][i]}px)`, opacity: 1 - i * 0.14 }}>What the model sees</span>)}
        </div>
      </section>
      <section className="login-card">
        <h1>{mode === "in" ? "Sign in" : "Create an account"}</h1>
        <p className="muted">Experiment details are stored in Firebase and files in private Vercel Blob storage. Shared experiments are visible to signed-in users; private ones are visible only to you.</p>
        <form onSubmit={submit}>
          <label className="field">Username
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={32} />
          </label>
          <label className="field">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={mode === "up" ? 8 : 1} />
            {mode === "up" && <small>At least 8 characters. Usernames use letters, numbers, dot, dash or underscore.</small>}
          </label>
          {error && <div className="note err" role="alert">{error}</div>}
          <button className="btn" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="linklike" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}>
          {mode === "in" ? "New here? Create an account" : "Already registered? Sign in"}
        </button>
      </section>
    </main>
  );
}
