import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Doc, SideLink } from "../../shared/model.ts";
import { linksOf } from "../../shared/ops.ts";
import { renderMarkdown } from "../markdown.ts";
import { Check, Dots, Grip, Plus, Rel } from "../icons.tsx";
import { Editor } from "./Editor.tsx";

export interface Pending {
  subtopic: string;
  status: "writing" | "error";
  error?: string;
}

export type DropPos = "before" | "after" | "inside";

export interface DocActions {
  explore(parentId: string, subtopic: string): void;
  requestInk(id: string): void;
  startEdit(id: string): void;
  cancelEdit(): void;
  saveEdit(id: string, patch: { title: string; body: string }): void;
  relate(id: string): void;
  openLink(linkId: string): void;
  requestDelete(id: string): void;
  requestMove(id: string): void;
  moveStep(id: string, delta: -1 | 1): void;
  requestNewVersion(id: string): void;
  toggleCollapse(id: string): void;
  drop(dragId: string, targetId: string, pos: DropPos): void;
}

export interface DocView {
  doc: Doc;
  hideExplored: boolean;
  editingId: string | null;
  pending: Record<string, Pending>;
  newIds: Set<string>;
  latestId: string | null;
  highlight: Set<string>;
  flashId: string | null;
  actions: DocActions;
}

export const DocViewCtx = createContext<DocView>(null as unknown as DocView);
const useView = () => useContext(DocViewCtx);

let dragId: string | null = null;

export function Body({ text }: { text: string }) {
  if (!text) return null;
  return <div className="body" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

function Heading({ depth, children, id }: { depth: number; children: React.ReactNode; id: string }) {
  const level = Math.min(6, depth + 1);
  const Tag = `h${level}` as "h1";
  return (
    <Tag className="ttl" id={`h-${id}`}>
      {children}
    </Tag>
  );
}

export function SubtopicRow({ containerId, title, show }: { containerId: string; title: string; show: boolean }) {
  const { doc, pending, actions } = useView();
  const c = doc.blocks[containerId] ?? doc.links[containerId];
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const busy = pending[containerId]?.status === "writing";
  if (!c) return null;
  const submit = () => {
    const t = text.trim();
    if (t) actions.explore(containerId, t);
    setText("");
    setAdding(false);
  };
  return (
    <div className={`subrow ${show || adding ? "show" : ""}`} role="group" aria-label={`Subtopics to explore under ${title}`}>
      <span className="lead">Explore</span>
      {c.suggestions.map((s) => (
        <button key={s} className="sub" disabled={busy} onClick={() => actions.explore(containerId, s)}>
          {s}
        </button>
      ))}
      {adding ? (
        <input
          className="sub-input"
          autoFocus
          placeholder="Name your own subtopic or ask a question…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setAdding(false);
              setText("");
            }
          }}
          onBlur={() => !text.trim() && setAdding(false)}
          maxLength={300}
        />
      ) : (
        <button className="sub" disabled={busy} aria-label={`Name your own subtopic under ${title}`} onClick={() => setAdding(true)} style={{ padding: "0 8px" }}>
          <Plus style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );
}

export function PendingRow({ containerId }: { containerId: string }) {
  const { pending, actions } = useView();
  const p = pending[containerId];
  if (!p) return null;
  if (p.status === "writing")
    return (
      <div className="writing" aria-live="polite">
        <span className="n">Writing… · {p.subtopic}</span>
        <span className="skel" style={{ width: "60%" }} aria-hidden="true" />
        <span className="skel" style={{ width: "85%" }} aria-hidden="true" />
      </div>
    );
  return (
    <p className="fail" role="alert">
      Couldn't add a block. Your page is unchanged.{p.error ? ` (${p.error})` : ""}{" "}
      <button onClick={() => actions.explore(containerId, p.subtopic)}>Try again</button>
    </p>
  );
}

function Mentions({ links, selfId }: { links: SideLink[]; selfId: string }) {
  const { doc, actions } = useView();
  if (!links.length) return null;
  return (
    <div className="mentions">
      {links.map((l) => {
        const other = doc.blocks[l.endpoints.find((e) => e !== selfId) ?? ""];
        return (
          <button key={l.id} className="ment" onClick={() => actions.openLink(l.id)} title={l.title}>
            <Rel />
            {other?.title ?? "Relation"}
          </button>
        );
      })}
    </div>
  );
}

function BlockMenu({ id, isRoot, onClose }: { id: string; isRoot: boolean; onClose: () => void }) {
  const { actions, doc } = useView();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const b = doc.blocks[id];
  const siblings = b?.parentId ? (doc.blocks[b.parentId] ?? doc.links[b.parentId])?.childIds ?? [] : [];
  const idx = siblings.indexOf(id);
  return (
    <div className="menu" ref={ref} role="menu" style={{ left: -30, top: 32 }}>
      {!isRoot && (
        <>
          <button className="b" role="menuitem" onClick={run(() => actions.requestMove(id))}>
            Move to…
          </button>
          {idx > 0 && (
            <button className="b" role="menuitem" onClick={run(() => actions.moveStep(id, -1))}>
              Move up
            </button>
          )}
          {idx >= 0 && idx < siblings.length - 1 && (
            <button className="b" role="menuitem" onClick={run(() => actions.moveStep(id, 1))}>
              Move down
            </button>
          )}
        </>
      )}
      <button className="b" role="menuitem" onClick={run(() => actions.requestNewVersion(id))}>
        Ask for a new version
      </button>
      {!isRoot && (
        <>
          <hr />
          <button className="b del" role="menuitem" onClick={run(() => actions.requestDelete(id))}>
            Delete
          </button>
        </>
      )}
    </div>
  );
}

export function BlockView({ id, depth, parentExplored = false, afterBody }: { id: string; depth: number; parentExplored?: boolean; afterBody?: React.ReactNode }) {
  const view = useView();
  const { doc, hideExplored, editingId, newIds, latestId, highlight, flashId, actions } = view;
  const b = doc.blocks[id];
  const [menuOpen, setMenuOpen] = useState(false);
  const [drop, setDrop] = useState<DropPos | null>(null);
  if (!b) return null;
  const explored = b.lifecycle === "explored";
  if (hideExplored && explored) return null;
  const isRoot = id === doc.rootId;
  const collapsed = doc.ui.collapsed.includes(id);
  const hasKids = b.childIds.length > 0;
  const editing = editingId === id;
  const links = isRoot ? [] : linksOf(doc, id);
  const titleText = b.title || "Untitled";
  const showSubs = latestId === id;

  const cls = [
    "block",
    `d${Math.min(depth, 6)}`,
    explored ? "explored" : "inked",
    parentExplored && explored ? "in-draft" : "",
    isRoot ? "root" : "",
    highlight.has(id) ? "endpoint" : "",
    flashId === id ? "flash" : "",
    drop ? `drop-${drop}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const onDragOver = (e: React.DragEvent) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setDrop(isRoot ? "inside" : y < 0.3 ? "before" : y > 0.7 ? "after" : "inside");
  };

  return (
    <section className={cls} data-block-id={id} aria-label={`${titleText}${explored ? " (explored draft)" : ""}`}>
      <div
        className="self"
        tabIndex={-1}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = drop;
          setDrop(null);
          if (dragId && pos && dragId !== id) actions.drop(dragId, id, pos);
          dragId = null;
        }}
      >
        {!isRoot && !editing && (
          <button
            className="grip"
            draggable
            aria-label={`Drag to move, click for actions: ${titleText}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onDragStart={(e) => {
              dragId = id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", titleText);
              const sec = (e.currentTarget as HTMLElement).closest("section");
              if (sec) e.dataTransfer.setDragImage(sec, 20, 20);
            }}
            onDragEnd={() => (dragId = null)}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Grip />
          </button>
        )}
        {menuOpen && <BlockMenu id={id} isRoot={isRoot} onClose={() => setMenuOpen(false)} />}

        {!editing && (
          <div className="toolbar" role="toolbar" aria-label={`Actions for ${titleText}`}>
            {!isRoot && (
              <button className="b sm" onClick={() => actions.relate(id)}>
                Relate
              </button>
            )}
            <button className="b sm" onClick={() => actions.startEdit(id)}>
              Edit
            </button>
            {isRoot && (
              <button className="b sm" onClick={() => actions.requestNewVersion(id)}>
                New version
              </button>
            )}
            {!isRoot && (
              <button className="b sm icon" aria-label={`More actions for ${titleText}`} onClick={() => setMenuOpen(true)}>
                <Dots style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>
        )}

        {editing ? (
          <Editor
            initial={{ title: b.title, body: b.body }}
            titleLabel={isRoot ? "Topic title" : "Title"}
            onSave={(p) => actions.saveEdit(id, p)}
            onCancel={actions.cancelEdit}
          />
        ) : (
          <>
            <div className="head">
              {hasKids && !isRoot && (
                <button
                  className={`toggle ${collapsed ? "closed" : ""}`}
                  aria-expanded={!collapsed}
                  aria-label={`${collapsed ? "Expand" : "Collapse"} ${titleText}`}
                  onClick={() => actions.toggleCollapse(id)}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    {collapsed ? <path d="M4 2l5 4-5 4z" /> : <path d="M2 4l4 5 4-5z" />}
                  </svg>
                </button>
              )}
              <Heading depth={depth} id={id}>
                {titleText}
              </Heading>
              {newIds.has(id) && <span className="pill new">New</span>}
              {b.edited && <span className="pill edited">Edited</span>}
              {collapsed && <span className="pill edited">{b.childIds.length} hidden</span>}
              <span className="end">
                {explored && (
                  <button className="ck" aria-label={`Ink ${titleText}`} title="Ink: keep this block in your notes" onClick={() => actions.requestInk(id)}>
                    <Check />
                  </button>
                )}
              </span>
            </div>
            <Body text={b.body} />
            <Mentions links={links} selfId={id} />
          </>
        )}
        {afterBody}
        {!editing && <SubtopicRow containerId={id} title={titleText} show={showSubs} />}
      </div>
      {(!collapsed || isRoot) && (
        <div className="children">
          {b.childIds.map((c) => (
            <BlockView key={c} id={c} depth={depth + 1} parentExplored={explored} />
          ))}
          <PendingRow containerId={id} />
        </div>
      )}
    </section>
  );
}
