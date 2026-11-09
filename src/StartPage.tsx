import { useRef, useState } from "react";
import { api, type DocSummary } from "./api.ts";
import { useApp, useToast } from "./App.tsx";
import { File } from "./icons.tsx";

export function relTime(iso: string): string {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return "Yesterday";
  if (s < 14 * 86400) return `${Math.floor(s / 86400)} days ago`;
  if (s < 60 * 86400) return `${Math.floor(s / (7 * 86400))} weeks ago`;
  return d.toLocaleDateString();
}

export function StartPage({ docs }: { docs: DocSummary[] | null }) {
  const { navigate, refreshDocs } = useApp();
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await api.createDoc(topic.trim());
      refreshDocs();
      navigate(`#/doc/${doc.id}`);
    } catch (err) {
      setError(`Couldn't build the outline. ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(f: File) {
    try {
      const json = JSON.parse(await f.text());
      const doc = await api.importDoc(json);
      refreshDocs();
      toast({ text: `Imported “${doc.blocks[doc.rootId].title}”` });
      navigate(`#/doc/${doc.id}`);
    } catch (err) {
      toast({ text: `Import failed: ${(err as Error).message}`, error: true });
    }
  }

  return (
    <main className="start">
      <div className="start-inner">
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1>What do you want to understand?</h1>
          <p className="lede">
            Start with a topic. You'll get a short outline, then grow it one block at a time and ink what you want to keep.
          </p>
          <form onSubmit={build}>
            <label htmlFor="topic" className="sr-only">
              Topic
            </label>
            <input
              id="topic"
              type="text"
              placeholder="e.g. ML Loss Functions"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={busy}
              autoFocus
              maxLength={300}
            />
            <button type="submit" className="b primary go" disabled={busy || !topic.trim()}>
              {busy ? "Building outline…" : "Build outline"}
            </button>
          </form>
          {error && <p className="err">{error}</p>}
        </section>

        <section style={{ display: "flex", flexDirection: "column" }}>
          <div className="recent-head">
            <h2>Recent</h2>
            <button className="b sm muted" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {docs?.length === 0 && <div className="empty">Nothing yet. Your topics are saved on this device.</div>}
          {docs?.map((d) => (
            <a key={d.id} href={`#/doc/${d.id}`} className="row">
              <File style={{ color: "#73726E" }} />
              <span className="name">{d.title}</span>
              <span className="m">
                {d.blocks} blocks · {d.explored ? `${d.explored} explored` : "all inked"}
              </span>
              <span className="m when">{relTime(d.updatedAt)}</span>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
