import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockDraft, Doc } from "../shared/model.ts";
import { getContainer, newId } from "../shared/model.ts";
import {
  addChild,
  ancestors,
  canMove,
  cleanup,
  consumeSuggestion,
  counts,
  createLink,
  deleteBlock,
  deleteLink,
  descendants,
  editContent,
  ink,
  inkChain,
  moveBlock,
  moveChain,
  replaceWithVersion,
  setCollapsed,
  setLastViewed,
  type DeleteOptions,
} from "../shared/ops.ts";
import { contextFor, relationContext } from "../shared/context.ts";
import { api } from "./api.ts";
import { useApp, useToast } from "./App.tsx";
import { Dots, Info, Rel, X } from "./icons.tsx";
import { BlockView, DocViewCtx, type DocActions, type DocView, type DropPos, type Pending } from "./components/Block.tsx";
import { CleanupDialog, ConfirmDialog, DeleteDialog, ExportDialog, InkChainDialog, MoveDialog, RelateDialog, VersionDialog } from "./components/Dialogs.tsx";
import { SidePeek } from "./components/SidePeek.tsx";

type Dialog =
  | { kind: "ink"; targetId: string; chain: string[] }
  | { kind: "inkMove"; id: string; newParentId: string; index?: number; chain: string[] }
  | { kind: "delete"; id: string }
  | { kind: "move"; id: string }
  | { kind: "relate"; from: string }
  | { kind: "version"; id: string }
  | { kind: "export" }
  | { kind: "cleanup" }
  | { kind: "deleteDoc" }
  | { kind: "deleteLink"; linkId: string };

const NEW_MS = 8000;

export function DocPage({ docId, onDoc }: { docId: string; onDoc: (d: Doc | null) => void }) {
  const { settings, updateSettings, refreshDocs, navigate } = useApp();
  const toast = useToast();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [latestId, setLatestId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const docRef = useRef<Doc | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsaved = useRef<Doc | null>(null);
  const restored = useRef(false);

  // ---------------------------------------------------------------- load/save
  useEffect(() => {
    api.getDoc(docId).then(
      (d) => {
        docRef.current = d;
        setDoc(d);
        onDoc(d);
      },
      (e) => setLoadError((e as Error).message),
    );
  }, [docId, onDoc]);

  const flush = useCallback(
    async (keepalive = false) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const d = unsaved.current;
      if (!d) return;
      unsaved.current = null;
      try {
        await api.saveDoc(d, keepalive);
        refreshDocs();
      } catch (e) {
        if (!unsaved.current) unsaved.current = d;
        toast({ text: `Couldn't save: ${(e as Error).message}`, error: true, action: { label: "Retry", run: () => void flush() } });
      }
    },
    [refreshDocs, toast],
  );

  useEffect(() => {
    const onUnload = () => void flush(true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void flush(true);
    };
  }, [flush]);

  const commit = useCallback(
    (next: Doc) => {
      docRef.current = next;
      setDoc(next);
      onDoc(next);
      unsaved.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 300);
    },
    [flush, onDoc],
  );

  /** Run a pure op on the latest doc; surface rule violations as a toast. */
  const apply = useCallback(
    (fn: (d: Doc) => Doc): boolean => {
      const cur = docRef.current;
      if (!cur) return false;
      try {
        commit(fn(cur));
        return true;
      } catch (e) {
        toast({ text: (e as Error).message, error: true });
        return false;
      }
    },
    [commit, toast],
  );

  const markNew = useCallback((id: string) => {
    setNewIds((s) => new Set(s).add(id));
    setLatestId(id);
    setTimeout(() => setNewIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    }), NEW_MS);
  }, []);

  const goto = useCallback(
    (id: string) => {
      const d = docRef.current;
      if (!d) return;
      const hidden = ancestors(d, id).filter((a) => d.ui.collapsed.includes(a));
      if (hidden.length) commit(hidden.reduce((acc, a) => setCollapsed(acc, a, false), d));
      setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${id}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        (el?.querySelector(".self") as HTMLElement | null)?.focus({ preventScroll: true });
        setFlashId(id);
        setTimeout(() => setFlashId(null), 1300);
      }, 30);
    },
    [commit],
  );

  useEffect(() => {
    const on = (e: Event) => goto((e as CustomEvent<string>).detail);
    window.addEventListener("ke:goto", on);
    return () => window.removeEventListener("ke:goto", on);
  }, [goto]);

  // Resume where the user left off; remember the block in view.
  useEffect(() => {
    if (!doc || restored.current) return;
    restored.current = true;
    const id = doc.ui.lastViewedId;
    if (id && id !== doc.rootId) setTimeout(() => document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ block: "start" }), 50);
  }, [doc]);

  const [viewId, setViewId] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        const els = [...document.querySelectorAll<HTMLElement>(".article [data-block-id]")];
        const first = els.find((el) => el.querySelector(".self")!.getBoundingClientRect().bottom > 70);
        const id = first?.dataset.blockId;
        if (!id) return;
        setViewId(id);
        const d = docRef.current;
        if (d && d.ui.lastViewedId !== id) commit(setLastViewed(d, id));
      }, 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [commit]);

  // ----------------------------------------------------------------- actions
  const doInk = useCallback(
    (ids: string[], targetId: string) => {
      const d = docRef.current!;
      const title = d.links[targetId] ? "the relation" : `“${d.blocks[targetId]?.title}”`;
      if (apply((x) => ink(x, ids)))
        toast({ text: ids.length === 1 ? `Inked ${title} · only this block` : `Inked ${title} and its chain · ${ids.length} blocks` });
    },
    [apply, toast],
  );

  const performMove = useCallback(
    (id: string, newParentId: string, index: number | undefined, chain: string[]) => {
      const d = docRef.current!;
      const oldParent = d.blocks[id].parentId;
      if (apply((x) => moveBlock(x, id, newParentId, index, chain))) {
        // Unseen candidates under the moved subtree were prepared for its old context.
        void api.invalidate(d.id, [id, ...descendants(d, id)]);
        if (oldParent !== newParentId) {
          const where = getContainer(docRef.current!, newParentId);
          toast({ text: `Moved under “${d.links[newParentId] ? "the relation" : where?.title}”${chain.length ? ` · inked ${chain.length}` : ""}` });
        }
      }
    },
    [apply, toast],
  );

  const tryMove = useCallback(
    (id: string, newParentId: string, index?: number) => {
      const d = docRef.current!;
      const err = canMove(d, id, newParentId);
      if (err) return toast({ text: err, error: true });
      const chain = moveChain(d, id, newParentId);
      if (chain.length && !settings.alwaysInkMoveChain) setDialog({ kind: "inkMove", id, newParentId, index, chain });
      else performMove(id, newParentId, index, chain);
    },
    [settings.alwaysInkMoveChain, performMove, toast],
  );

  const actions: DocActions = useMemo(
    () => ({
      async explore(parentId, subtopic) {
        const d = docRef.current;
        if (!d || pending[parentId]?.status === "writing") return;
        setPending((p) => ({ ...p, [parentId]: { subtopic, status: "writing" } }));
        if (d.ui.collapsed.includes(parentId)) commit(setCollapsed(d, parentId, false));
        const newBlockId = newId();
        try {
          const { draft } = await api.explore(d.id, { parentId, subtopic, newBlockId, context: contextFor(docRef.current!, parentId) });
          const cur = docRef.current!;
          if (!getContainer(cur, parentId)) throw new Error("The parent was deleted");
          commit(consumeSuggestion(addChild(cur, parentId, { ...draft, title: draft.title?.trim() || subtopic }, { id: newBlockId }), parentId, subtopic));
          setPending((p) => {
            const n = { ...p };
            delete n[parentId];
            return n;
          });
          markNew(newBlockId);
        } catch (e) {
          setPending((p) => ({ ...p, [parentId]: { subtopic, status: "error", error: (e as Error).message } }));
        }
      },
      requestInk(id) {
        const d = docRef.current!;
        const chain = inkChain(d, id);
        if (!chain.length) return;
        if (chain.length === 1 || settings.alwaysInkChain) doInk(chain, id);
        else setDialog({ kind: "ink", targetId: id, chain });
      },
      startEdit: (id) => setEditingId(id),
      cancelEdit: () => setEditingId(null),
      saveEdit(id, patch) {
        if (apply((x) => editContent(x, id, patch))) {
          setEditingId(null);
          void api.invalidate(docRef.current!.id, [id]);
        }
      },
      relate: (id) => setDialog({ kind: "relate", from: id }),
      openLink: (linkId) => setPeek(linkId),
      requestDelete(id) {
        const d = docRef.current!;
        const imp = (() => {
          const kids = descendants(d, id).length;
          const links = Object.values(d.links).some((l) => l.endpoints.some((e) => e === id || descendants(d, id).includes(e)));
          return kids > 0 || links;
        })();
        if (imp) setDialog({ kind: "delete", id });
        else performDelete(id, { children: "moveUp", links: "keepAsBlock" });
      },
      requestMove: (id) => setDialog({ kind: "move", id }),
      moveStep(id, delta) {
        const d = docRef.current!;
        const pid = d.blocks[id].parentId!;
        const sibs = getContainer(d, pid)!.childIds;
        const idx = sibs.indexOf(id);
        const to = idx + delta;
        if (to < 0 || to >= sibs.length) return;
        apply((x) => moveBlock(x, id, pid, to));
      },
      requestNewVersion: (id) => setDialog({ kind: "version", id }),
      toggleCollapse(id) {
        const d = docRef.current!;
        commit(setCollapsed(d, id, !d.ui.collapsed.includes(id)));
      },
      drop(dragId: string, targetId: string, pos: DropPos) {
        const d = docRef.current!;
        if (pos === "inside") return tryMove(dragId, targetId);
        const t = d.blocks[targetId];
        if (!t?.parentId) return;
        const sibs = getContainer(d, t.parentId)!.childIds.filter((s) => s !== dragId);
        const idx = sibs.indexOf(targetId) + (pos === "after" ? 1 : 0);
        tryMove(dragId, t.parentId, idx);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, commit, doInk, markNew, pending, settings.alwaysInkChain, tryMove],
  );

  function performDelete(id: string, opts: DeleteOptions) {
    const before = docRef.current!;
    const title = before.blocks[id].title;
    const gone = [id, ...descendants(before, id)];
    if (apply((x) => deleteBlock(x, id, opts))) {
      void api.invalidate(before.id, gone);
      toast({ text: `Deleted “${title}”`, action: { label: "Undo", run: () => commit({ ...before, updatedAt: new Date().toISOString() }) } });
    }
  }

  async function relateAsk(from: string, other: string, question: string) {
    const d = docRef.current!;
    const linkId = newId();
    const { draft } = await api.relate(d.id, { linkId, question, context: relationContext(d, from, other) });
    if (apply((x) => createLink(x, from, other, { title: question, body: draft.body, suggestions: draft.suggestions }, { id: linkId }))) {
      setDialog(null);
      setPeek(linkId);
      markNew(linkId);
    }
  }

  // ------------------------------------------------------------------ render
  if (loadError)
    return (
      <main className="main-col">
        <div className="loading">
          Couldn't open this topic: {loadError}.{" "}
          <a href="#/" onClick={() => navigate("#/")}>
            Back to start
          </a>
        </div>
      </main>
    );
  if (!doc) return <main className="main-col"><div className="loading">Opening…</div></main>;

  const c = counts(doc);
  const root = doc.blocks[doc.rootId];
  const crumbIds = viewId && doc.blocks[viewId] ? [...ancestors(doc, viewId), viewId].filter((x) => doc.blocks[x]) : [doc.rootId];
  const crumbs = crumbIds.length > 3 ? [crumbIds[0], "…", ...crumbIds.slice(-2)] : crumbIds;
  const highlight = new Set(peek && doc.links[peek] ? doc.links[peek].endpoints : []);
  const view: DocView = {
    doc,
    hideExplored: !!settings.hideExplored,
    editingId,
    pending,
    newIds,
    latestId,
    highlight,
    flashId,
    actions,
  };
  const links = Object.values(doc.links);

  return (
    <DocViewCtx.Provider value={view}>
      <div className="main-col">
        <header className="topbar">
          <span className="crumbs">
            {crumbs.map((id, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">/</span>}
                {id === "…" ? "…" : <button className="b sm" style={{ padding: "0 2px", minHeight: 22, color: "inherit", fontSize: 14 }} onClick={() => goto(id)}>{doc.blocks[id].title}</button>}
              </span>
            ))}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 2, position: "relative" }}>
            <span className="meta">
              {c.blocks} blocks · {c.explored ? `${c.explored} explored` : "all inked"}
            </span>
            <button className="b" onClick={() => setDialog({ kind: "export" })}>
              Export
            </button>
            <button className="b icon" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Dots />
            </button>
            {menu && (
              <div className="menu" role="menu" style={{ right: 0, top: 36 }} onMouseLeave={() => setMenu(false)}>
                <button className="b" role="menuitem" onClick={() => { setMenu(false); setDialog({ kind: "cleanup" }); }}>
                  Clean up drafts…
                </button>
                <button className="b" role="menuitem" onClick={() => { setMenu(false); updateSettings({ alwaysInkChain: false, alwaysInkMoveChain: false }); toast({ text: "You'll be asked before inking a chain again" }); }} disabled={!settings.alwaysInkChain && !settings.alwaysInkMoveChain}>
                  Ask before inking chains
                </button>
                <hr />
                <button className="b del" role="menuitem" onClick={() => { setMenu(false); setDialog({ kind: "deleteDoc" }); }}>
                  Delete topic…
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="workspace">
          <main className="page">
            <article className="article">
              <BlockView
                id={doc.rootId}
                depth={0}
                afterBody={
              !settings.tipDismissed && (
                <div className="tip">
                  <Info />
                  <span>
                    New blocks arrive as drafts on the blue tint. Tick <strong>✓</strong> on the ones you accept and they become part of your page. Explore a subtopic under any block to add one more.
                  </span>
                  <button className="b icon muted" aria-label="Dismiss tip" style={{ minHeight: 24 }} onClick={() => updateSettings({ tipDismissed: true })}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )
                }
              />
              {settings.hideExplored && c.explored > 0 && (
                <p style={{ fontSize: 13, color: "#73726E", marginTop: 24 }}>
                  Showing inked notes only · {c.explored} explored hidden.{" "}
                  <button className="b sm" onClick={() => updateSettings({ hideExplored: false })}>Show all</button>
                </p>
              )}
            </article>
          </main>

          <aside className="relations" aria-label="Relations">
            <span className="h">Relations</span>
            {links.length === 0 && <span style={{ fontSize: 13, lineHeight: 1.5, color: "#73726E" }}>None yet. Use Relate on a block to explain how two sections connect.</span>}
            {links
              .filter((l) => !(settings.hideExplored && l.lifecycle === "explored"))
              .map((l) => {
                const [a, b] = l.endpoints.map((e) => doc.blocks[e]?.title ?? "?");
                return (
                  <button key={l.id} className={`rel ${peek === l.id ? "active" : ""}`} onClick={() => setPeek(l.id)}>
                    <span className="t">
                      <Rel style={{ width: 13, height: 13 }} />
                      <span>
                        {a} ↔ {b}
                      </span>
                    </span>
                    <span className="s">
                      {l.title} · {1 + l.childIds.length} block{l.childIds.length ? "s" : ""}
                      {l.lifecycle === "explored" ? " · draft" : ""}
                    </span>
                  </button>
                );
              })}
          </aside>
        </div>
      </div>

      {peek && doc.links[peek] && (
        <SidePeek
          linkId={peek}
          onClose={() => setPeek(null)}
          onGoto={goto}
          onDelete={() => setDialog({ kind: "deleteLink", linkId: peek })}
        />
      )}

      {dialog?.kind === "ink" && (
        <InkChainDialog
          doc={doc}
          chain={dialog.chain}
          targetId={dialog.targetId}
          mode="ink"
          onCancel={() => setDialog(null)}
          onConfirm={(always) => {
            if (always) updateSettings({ alwaysInkChain: true });
            setDialog(null);
            doInk(inkChain(docRef.current!, dialog.targetId), dialog.targetId);
          }}
        />
      )}
      {dialog?.kind === "inkMove" && (
        <InkChainDialog
          doc={doc}
          chain={dialog.chain}
          targetId={dialog.id}
          mode="move"
          onCancel={() => {
            setDialog(null);
            toast({ text: "Not moved" });
          }}
          onConfirm={(always) => {
            if (always) updateSettings({ alwaysInkMoveChain: true });
            setDialog(null);
            performMove(dialog.id, dialog.newParentId, dialog.index, moveChain(docRef.current!, dialog.id, dialog.newParentId));
          }}
        />
      )}
      {dialog?.kind === "delete" && doc.blocks[dialog.id] && (
        <DeleteDialog
          doc={doc}
          id={dialog.id}
          onCancel={() => setDialog(null)}
          onConfirm={(o) => {
            setDialog(null);
            performDelete(dialog.id, o);
          }}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveDialog
          doc={doc}
          id={dialog.id}
          onCancel={() => setDialog(null)}
          onPick={(pid) => {
            setDialog(null);
            tryMove(dialog.id, pid);
          }}
        />
      )}
      {dialog?.kind === "relate" && (
        <RelateDialog
          doc={doc}
          fromId={dialog.from}
          onCancel={() => setDialog(null)}
          onAsk={(other, q) => relateAsk(dialog.from, other, q)}
          onWrite={(other, title, body) => {
            const id = newId();
            if (apply((x) => createLink(x, dialog.from, other, { title, body }, { id }))) {
              setDialog(null);
              setPeek(id);
            }
          }}
        />
      )}
      {dialog?.kind === "version" && getContainer(doc, dialog.id) && (
        <VersionDialog
          doc={doc}
          id={dialog.id}
          onCancel={() => setDialog(null)}
          onUse={(draft: BlockDraft) => {
            setDialog(null);
            if (apply((x) => replaceWithVersion(x, dialog.id, draft))) {
              void api.invalidate(doc.id, [dialog.id]);
              toast({ text: "Replaced with the new version · only this block" });
            }
          }}
          onAddSeparate={
            doc.blocks[dialog.id]?.parentId
              ? (draft: BlockDraft) => {
                  setDialog(null);
                  const b = docRef.current!.blocks[dialog.id];
                  const parent = getContainer(docRef.current!, b.parentId!)!;
                  const id = newId();
                  if (apply((x) => addChild(x, b.parentId!, draft, { id, index: parent.childIds.indexOf(b.id) + 1 }))) markNew(id);
                }
              : null
          }
        />
      )}
      {dialog?.kind === "export" && <ExportDialog doc={doc} onClose={() => setDialog(null)} onDone={(m) => toast({ text: m })} />}
      {dialog?.kind === "cleanup" && (
        <CleanupDialog
          doc={doc}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            const before = docRef.current!;
            const removed = Object.values(before.blocks).filter((b) => b.lifecycle === "explored").map((b) => b.id);
            if (apply(cleanup)) {
              void api.invalidate(before.id, removed);
              setPeek(null);
              toast({ text: "Removed explored drafts", action: { label: "Undo", run: () => commit({ ...before, updatedAt: new Date().toISOString() }) } });
            }
          }}
        />
      )}
      {dialog?.kind === "deleteLink" && doc.links[dialog.linkId] && (
        <ConfirmDialog
          title="Delete this relation?"
          text={`Its notes${doc.links[dialog.linkId].childIds.length ? ` and ${doc.links[dialog.linkId].childIds.length} block(s) beneath it` : ""} will be removed. Both blocks it connects stay as they are.`}
          confirm="Delete relation"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const before = docRef.current!;
            setDialog(null);
            setPeek(null);
            if (apply((x) => deleteLink(x, dialog.linkId)))
              toast({ text: "Deleted the relation", action: { label: "Undo", run: () => commit({ ...before, updatedAt: new Date().toISOString() }) } });
          }}
        />
      )}
      {dialog?.kind === "deleteDoc" && (
        <ConfirmDialog
          title={`Delete “${root.title}”?`}
          text="The whole topic, including inked notes, will be deleted from this device. Export it first if you want a copy."
          confirm="Delete topic"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setDialog(null);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            unsaved.current = null;
            await api.deleteDoc(doc.id).catch(() => {});
            refreshDocs();
            navigate("#/");
          }}
        />
      )}
    </DocViewCtx.Provider>
  );
}
