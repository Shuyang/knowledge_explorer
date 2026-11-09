import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Doc } from "../shared/model.ts";
import { outlineNumbers } from "../shared/ops.ts";
import { api, type DocSummary, type Settings } from "./api.ts";
import { Caret, Dots, Plus } from "./icons.tsx";
import { ConfirmDialog } from "./components/Dialogs.tsx";
import { StartPage } from "./StartPage.tsx";
import { DocPage } from "./DocPage.tsx";
import type { Pending } from "./components/Block.tsx";

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
  const [openPending, setOpenPending] = useState<Record<string, Pending>>({});
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
        <div className="shell" style={{ "--sb-w": `${clampSidebar(settings.sidebarWidth ?? SIDEBAR_DEFAULT)}px` } as React.CSSProperties}>
          <Sidebar docs={docs} openDoc={docId ? openDoc : null} pending={openPending} activeId={docId} />
          {docId ? (
            <DocPage key={docId} docId={docId} onDoc={setOpenDoc} onPending={setOpenPending} />
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

export const SIDEBAR_DEFAULT = 280;
const clampSidebar = (w: number) => Math.round(Math.min(480, Math.max(200, w)));

/** Drag the sidebar's right edge to resize it; double-click resets. Saved in settings. */
function SidebarResizer() {
  const { settings, updateSettings } = useApp();
  const [drag, setDrag] = useState(false);
  const shell = () => document.querySelector<HTMLElement>(".shell");
  const width = clampSidebar(settings.sidebarWidth ?? SIDEBAR_DEFAULT);
  return (
    <div
      className={`sb-resize ${drag ? "drag" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={200}
      aria-valuemax={480}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => updateSettings({ sidebarWidth: SIDEBAR_DEFAULT })}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          updateSettings({ sidebarWidth: clampSidebar(width + (e.key === "ArrowLeft" ? -16 : 16)) });
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const left = el.parentElement!.getBoundingClientRect().left;
        let w = width;
        setDrag(true);
        const move = (ev: PointerEvent) => {
          w = clampSidebar(ev.clientX - left);
          shell()?.style.setProperty("--sb-w", `${w}px`); // live, without re-rendering the app
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
          setDrag(false);
          updateSettings({ sidebarWidth: w });
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      }}
    />
  );
}

/** ⋯ on a topic row: Delete topic… */
function TopicMenu({ doc, active }: { doc: DocSummary; active: boolean }) {
  const { refreshDocs } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="sb-more" ref={ref}>
      <button
        className={`sb-dots ${open ? "open" : ""}`}
        aria-label={`Actions for ${doc.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Dots style={{ width: 14, height: 14 }} />
      </button>
      {open && (
        <div className="menu" role="menu" style={{ right: 0, top: 26 }}>
          <button
            className="b del"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              // The open topic deletes through its page, which also drops any pending save.
              if (active) window.dispatchEvent(new CustomEvent("ke:delete-doc"));
              else setConfirm(true);
            }}
          >
            Delete topic…
          </button>
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete “${doc.title}”?`}
          text="The whole topic, including inked notes, will be deleted from this device. Export it first if you want a copy."
          confirm="Delete topic"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            try {
              await api.deleteDoc(doc.id);
            } catch {
              toast({ text: "Couldn't delete the topic", error: true });
            }
            refreshDocs();
          }}
        />
      )}
    </div>
  );
}

function Sidebar({
  docs,
  openDoc,
  pending,
  activeId,
}: {
  docs: DocSummary[] | null;
  openDoc: Doc | null;
  pending: Record<string, Pending>;
  activeId: string | null;
}) {
  const { settings, updateSettings, provider } = useApp();
  const hide = !!settings.hideExplored;

  const outline = (doc: Doc) => {
    const rows: { id: string; title: string; num: string; depth: number; explored: boolean; writing?: boolean }[] = [];
    const show = (b: Doc["blocks"][string]) => !(hide && b.lifecycle === "explored");
    const nums = outlineNumbers(doc, show);
    // A block being written appears as its container's next child, with a spinner.
    const writing = (id: string, depth: number, prefix: string) => {
      const p = pending[id];
      if (p?.status !== "writing") return;
      const n = doc.blocks[id].childIds.filter((c) => doc.blocks[c] && show(doc.blocks[c])).length + 1;
      rows.push({ id, title: p.subtopic, num: prefix ? `${prefix}.${n}` : `${n}`, depth, explored: true, writing: true });
    };
    const walk = (id: string, depth: number) => {
      const b = doc.blocks[id];
      if (!b || !show(b)) return;
      const num = nums.get(id) ?? "";
      rows.push({ id, title: b.title || "Untitled", num, depth, explored: b.lifecycle === "explored" });
      // Collapsed or not, the sidebar lists every child, so the writing row goes after them.
      for (const c of b.childIds) walk(c, depth + 1);
      writing(id, depth + 1, num);
    };
    for (const c of doc.blocks[doc.rootId].childIds) walk(c, 0);
    writing(doc.rootId, 0, "");
    return rows;
  };

  return (
    <div className="sidebar-wrap">
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
            Hide drafts
          </button>
        </div>
        {docs === null && <div className="sb" style={{ cursor: "default" }}>Loading…</div>}
        {docs?.length === 0 && <div className="sb-foot" style={{ marginTop: 0 }}>No topics yet.</div>}
        {docs?.map((d) => {
          const active = d.id === activeId;
          return (
            <div key={d.id} style={{ display: "contents" }}>
              <div className="sb-row">
                <a href={`#/doc/${d.id}`} className={`sb ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Caret open={active} />
                  <span className="lbl">{active && openDoc ? openDoc.blocks[openDoc.rootId].title : d.title}</span>
                </a>
                <TopicMenu doc={d} active={active} />
              </div>
              {active &&
                openDoc &&
                outline(openDoc).map((r) =>
                  r.writing ? (
                    <button
                      key={`writing-${r.id}`}
                      className="sb explored sb-writing"
                      style={{ paddingLeft: 30 + r.depth * 14 }}
                      onClick={() => document.querySelector(`[data-pending-for="${r.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      title={`Writing “${r.title}”…`}
                    >
                      <span className="num">{r.num}</span>
                      <span className="lbl">{r.title}</span>
                      <span className="spin" aria-hidden="true" />
                      <span className="sr-only">(being written)</span>
                    </button>
                  ) : (
                  <button
                    key={r.id}
                    className={`sb ${r.explored ? "explored" : ""}`}
                    style={{ paddingLeft: 30 + r.depth * 14 }}
                    onClick={() => window.dispatchEvent(new CustomEvent("ke:goto", { detail: r.id }))}
                    title={`${r.num} ${r.title}${r.explored ? " (draft)" : ""}`}
                  >
                    <span className="num">{r.num}</span>
                    <span className="lbl">{r.title}</span>
                    {r.explored && <span className="sr-only">(draft)</span>}
                  </button>
                  ),
                )}
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
      <SidebarResizer />
    </div>
  );
}
