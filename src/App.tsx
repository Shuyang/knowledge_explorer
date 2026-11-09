import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Doc } from "../shared/model.ts";
import { api, type DocSummary, type Settings } from "./api.ts";
import { Caret, Plus } from "./icons.tsx";
import { StartPage } from "./StartPage.tsx";
import { DocPage } from "./DocPage.tsx";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface ToastSpec {
  text: string;
  action?: { label: string; run: () => void };
  error?: boolean;
  ms?: number;
}
interface ToastItem extends ToastSpec {
  id: number;
}
const ToastCtx = createContext<(t: ToastSpec) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// App-wide context
// ---------------------------------------------------------------------------

export interface AppCtx {
  settings: Settings;
  updateSettings: (patch: Settings) => void;
  provider: { provider: string; model: string } | null;
  refreshDocs: () => void;
  navigate: (hash: string) => void;
}
const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [provider, setProvider] = useState<AppCtx["provider"]>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const nextToast = useRef(1);

  const toast = useCallback((t: ToastSpec) => {
    const id = nextToast.current++;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.ms ?? (t.action ? 10000 : 4000));
  }, []);

  const refreshDocs = useCallback(() => {
    api.listDocs().then(setDocs, () => setDocs([]));
  }, []);

  useEffect(() => {
    refreshDocs();
    api.settings().then(setSettings, () => {});
    api.status().then(setProvider, () => {});
  }, [refreshDocs]);

  const updateSettings = useCallback((patch: Settings) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      api.saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const navigate = useCallback((h: string) => {
    window.location.hash = h;
  }, []);

  const route = hash.match(/^#\/doc\/([A-Za-z0-9-]+)/);
  const docId = route?.[1] ?? null;
  useEffect(() => {
    if (!docId) setOpenDoc(null);
  }, [docId]);

  const ctx = useMemo<AppCtx>(
    () => ({ settings, updateSettings, provider, refreshDocs, navigate }),
    [settings, updateSettings, provider, refreshDocs, navigate],
  );

  return (
    <Ctx.Provider value={ctx}>
      <ToastCtx.Provider value={toast}>
        <div className="shell">
          <Sidebar docs={docs} openDoc={docId ? openDoc : null} activeId={docId} />
          {docId ? (
            <DocPage key={docId} docId={docId} onDoc={setOpenDoc} />
          ) : (
            <StartPage docs={docs} />
          )}
        </div>
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>
              <span>{t.text}</span>
              {t.action && (
                <button
                  className="b"
                  onClick={() => {
                    t.action!.run();
                    setToasts((ts) => ts.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ docs, openDoc, activeId }: { docs: DocSummary[] | null; openDoc: Doc | null; activeId: string | null }) {
  const { settings, updateSettings, provider } = useApp();
  const hide = !!settings.hideExplored;

  const outline = (doc: Doc) => {
    const rows: { id: string; title: string; depth: number; explored: boolean }[] = [];
    const walk = (id: string, depth: number) => {
      const b = doc.blocks[id];
      if (!b) return;
      if (hide && b.lifecycle === "explored") return;
      rows.push({ id, title: b.title || "Untitled", depth, explored: b.lifecycle === "explored" });
      for (const c of b.childIds) walk(c, depth + 1);
    };
    for (const c of doc.blocks[doc.rootId].childIds) walk(c, 0);
    return rows;
  };

  return (
    <nav className="sidebar" aria-label="Workspace">
      <div className="brand">
        <span className="logo" aria-hidden="true">K</span>
        Knowledge Explorer
      </div>
      <a href="#/" className={`sb ${!activeId ? "active" : ""}`}>
        <Plus />
        New root topic
      </a>
      <div className="sb-head">
        <span>Topics</span>
        <button
          className="b sm muted"
          aria-pressed={hide}
          style={{ minHeight: 22, padding: "0 6px", fontSize: 12, background: hide ? "#EBEBEA" : undefined }}
          onClick={() => updateSettings({ hideExplored: !hide })}
          title="Show only inked notes"
        >
          Hide explored
        </button>
      </div>
      {docs === null && <div className="sb" style={{ cursor: "default" }}>Loading…</div>}
      {docs?.length === 0 && <div className="sb-foot" style={{ marginTop: 0 }}>No topics yet.</div>}
      {docs?.map((d) => {
        const active = d.id === activeId;
        return (
          <div key={d.id} style={{ display: "contents" }}>
            <a href={`#/doc/${d.id}`} className={`sb ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <Caret open={active} />
              <span className="lbl">{active && openDoc ? openDoc.blocks[openDoc.rootId].title : d.title}</span>
            </a>
            {active &&
              openDoc &&
              outline(openDoc).map((r) => (
                <button
                  key={r.id}
                  className={`sb ${r.explored ? "explored" : ""}`}
                  style={{ paddingLeft: 30 + r.depth * 14 }}
                  onClick={() => window.dispatchEvent(new CustomEvent("ke:goto", { detail: r.id }))}
                  title={r.explored ? `${r.title} (draft)` : r.title}
                >
                  <span className="lbl">{r.title}</span>
                  {r.explored && <span className="sr-only">(explored draft)</span>}
                </button>
              ))}
          </div>
        );
      })}
      <div className="sb-foot">
        Saved on this device
        {provider?.provider === "demo" && (
          <div className="banner">
            Offline demo content. Set <code>ANTHROPIC_API_KEY</code> and restart to generate real explanations with Claude.
          </div>
        )}
      </div>
    </nav>
  );
}
