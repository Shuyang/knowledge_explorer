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
  /** Returns false when the edit was rejected, so the editor stays open. */
  saveEdit(id: string, patch: { title: string; body: string }): boolean;
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
  highlight: Set<string>;
  flashId: string | null;
  actions: DocActions;
}

export const DocViewCtx = createContext<DocView>(null as unknown as DocView);
const useView = () => useContext(DocViewCtx);

let dragId: string | null = null;

export function Body({ text, onClick }: { text: string; onClick?: (e: React.MouseEvent) => void }) {
  if (!text) return null;
  return <div className={`body${onClick ? " editable" : ""}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

/** Click on a title or body to edit it in place — but not when following a link or selecting text. */
export function editOnClick(start: () => void) {
  return (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
    if (window.getSelection()?.toString()) return;
    start();
  };
}

function Heading({ depth, children, id, num, onClick }: { depth: number; children: React.ReactNode; id: string; num?: string; onClick?: (e: React.MouseEvent) => void }) {
  const level = Math.min(6, depth + 1);
  const Tag = `h${level}` as "h1";
  return (
    <Tag className="ttl editable" id={`h-${id}`} onClick={onClick}>
      {num && <span className="num">{num}</span>}
      {children}
    </Tag>
  );
}

export function SubtopicRow({ containerId, title }: { containerId: string; title: string }) {
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
    <div className={`subrow ${adding ? "open" : ""}`} role="group" aria-label={`Subtopics to explore under ${title}`}>
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
        <button className="sub add" disabled={busy} aria-label={`Name your own subtopic under ${title}`} title="Name your own subtopic" onClick={() => setAdding(true)}>
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
      <div className="writing" aria-live="polite" data-pending-for={containerId}>
        <span className="n">
          <span className="spin" aria-hidden="true" />
          Writing… · {p.subtopic}
        </span>
        <span className="skel" style={{ width: "60%" }} aria-hidden="true" />
        <span className="skel" style={{ width: "85%" }} aria-hidden="true" />
      </div>
    );
  return (
    <p className="fail" role="alert" data-pending-for={containerId}>
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

function BlockMenu({ id, isRoot, at, onClose }: { id: string; isRoot: boolean; at: "grip" | "dots"; onClose: () => void }) {
  const { actions, doc } = useView();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current || ref.current.contains(t)) return;
      // A click on this block's own trigger (⋯ or grip) toggles the menu itself.
      if (ref.current.parentElement?.contains(t) && t.closest(".dots, .grip")) return;
      onClose();
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
    <div className="menu" ref={ref} role="menu" style={at === "grip" ? { left: -30, top: 32 } : { right: 0, top: 34 }}>
      <button className="b" role="menuitem" onClick={run(() => actions.startEdit(id))}>
        Edit
      </button>
      {!isRoot && (
        <button className="b" role="menuitem" onClick={run(() => actions.relate(id))}>
          Relate…
        </button>
      )}
      <hr />
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

/** Outline number ("1", "1.2", "1.2.2"): top-level sections count from 1 under the root; blocks
 *  without a number (e.g. under a side link) number nothing below them. Hidden blocks are skipped. */
export function BlockView({
  id,
  depth,
  parentExplored = false,
  afterBody,
  num,
}: {
  id: string;
  depth: number;
  parentExplored?: boolean;
  afterBody?: React.ReactNode;
  num?: string;
}) {
  const view = useView();
  const { doc, hideExplored, editingId, newIds, highlight, flashId, actions } = view;
  const b = doc.blocks[id];
  const [menu, setMenu] = useState<"grip" | "dots" | null>(null);
  const [editFocus, setEditFocus] = useState<"title" | "body">("body");
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
  const visibleKids = b.childIds.filter((c) => doc.blocks[c] && !(hideExplored && doc.blocks[c].lifecycle === "explored"));
  const kidNum = (i: number) => (isRoot ? `${i + 1}` : num ? `${num}.${i + 1}` : undefined);
  const editFrom = (field: "title" | "body") =>
    editOnClick(() => {
      setEditFocus(field);
      actions.startEdit(id);
    });

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
    <section className={cls} data-block-id={id} aria-label={`${titleText}${explored ? " (draft)" : ""}`}>
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
            aria-expanded={menu === "grip"}
            onDragStart={(e) => {
              dragId = id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", titleText);
              const sec = (e.currentTarget as HTMLElement).closest("section");
              if (sec) e.dataTransfer.setDragImage(sec, 20, 20);
            }}
            onDragEnd={() => (dragId = null)}
            onClick={() => setMenu((m) => (m === "grip" ? null : "grip"))}
          >
            <Grip />
          </button>
        )}
        {menu && <BlockMenu id={id} isRoot={isRoot} at={menu} onClose={() => setMenu(null)} />}

        {editing ? (
          <Editor
            initial={{ title: b.title, body: b.body }}
            titleLabel={isRoot ? "Topic title" : "Title"}
            focus={editFocus}
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
              <Heading depth={depth} id={id} num={num} onClick={editFrom("title")}>
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
                <button
                  className={`dots ${menu === "dots" ? "open" : ""}`}
                  aria-label={`Actions for ${titleText}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === "dots"}
                  title="Edit, relate, move, new version, delete"
                  onClick={() => setMenu((m) => (m === "dots" ? null : "dots"))}
                >
                  <Dots style={{ width: 16, height: 16 }} />
                </button>
              </span>
            </div>
            <Body text={b.body} onClick={editFrom("body")} />
            <Mentions links={links} selfId={id} />
          </>
        )}
        {afterBody}
        {!editing && <SubtopicRow containerId={id} title={titleText} />}
      </div>
      {(!collapsed || isRoot) && (
        <div className="children">
          {visibleKids.map((c, i) => (
            <BlockView key={c} id={c} depth={depth + 1} parentExplored={explored} num={kidNum(i)} />
          ))}
          <PendingRow containerId={id} />
        </div>
      )}
    </section>
  );
}
