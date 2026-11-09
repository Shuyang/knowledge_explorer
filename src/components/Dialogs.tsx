import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockDraft, Doc } from "../../shared/model.ts";
import { getContainer } from "../../shared/model.ts";
import { canMove, cleanupPreview, deleteImpact, descendants, depth, isInsideLink, treeOrder, type DeleteOptions } from "../../shared/ops.ts";
import { exportFileName, toJSON, toMarkdown, type ExportScope } from "../../shared/export.ts";
import { contextFor } from "../../shared/context.ts";
import { api } from "../api.ts";
import { Check } from "../icons.tsx";
import { Body } from "./Block.tsx";

export function Modal({
  label,
  onClose,
  children,
  className = "",
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button.primary, button.danger, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && el) {
        const items = [...el.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")].filter((x) => !x.hasAttribute("disabled"));
        if (!items.length) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={ref} role="dialog" aria-modal="true" aria-label={label} className={`dialog ${className}`}>
        {children}
      </section>
    </div>
  );
}

const titleOf = (doc: Doc, id: string) => {
  const c = getContainer(doc, id);
  if (!c) return "";
  if (doc.links[id]) return `${doc.links[id].endpoints.map((e) => doc.blocks[e]?.title).join(" ↔ ")}`;
  return c.title || "Untitled";
};

// ---------------------------------------------------------------------------
// Ink the chain
// ---------------------------------------------------------------------------

export function InkChainDialog({
  doc,
  chain,
  targetId,
  mode,
  onConfirm,
  onCancel,
}: {
  doc: Doc;
  chain: string[];
  targetId: string;
  mode: "ink" | "move";
  onConfirm: (always: boolean) => void;
  onCancel: () => void;
}) {
  const [always, setAlways] = useState(false);
  const isLink = !!doc.links[targetId];
  const others = chain.filter((c) => c !== targetId);
  const lead =
    mode === "move"
      ? `“${titleOf(doc, targetId)}” is inked, and inked blocks sit under inked parents. To move it there, its new parent chain will be inked too:`
      : isLink
        ? "A relation can be inked only when both ends are inked. These will be inked with it:"
        : `Inked blocks sit under inked parents. ${others.length === 1 ? `“${titleOf(doc, others[0])}” is` : "These are"} still a draft, so ${others.length === 1 ? "it" : "they"} will be inked with it:`;
  const list = mode === "move" ? chain : chain;
  return (
    <Modal label="Ink the chain?" onClose={onCancel}>
      <div className="stack" style={{ gap: 6 }}>
        <h2>{mode === "move" ? "Ink the new parent chain?" : "Ink the chain?"}</h2>
        <p className="sub-t">{lead}</p>
      </div>
      <ol className="chain">
        {list.map((id) => (
          <li key={id} className={id === targetId ? "target" : ""} style={{ paddingLeft: doc.blocks[id] ? Math.max(0, depth(doc, id) - 1) * 14 : 0 }}>
            <Check />
            {titleOf(doc, id)}
            {doc.links[id] && <span className="pill edited">relation</span>}
          </li>
        ))}
      </ol>
      <label className="check">
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
        {mode === "move" ? "Always ink the new parent chain" : "Always ink the whole chain"}
      </label>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="b primary" onClick={() => onConfirm(always)}>
          {mode === "move" ? `Ink ${list.length} and move` : `Ink ${list.length} blocks`}
        </button>
        <button className="b outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function DeleteDialog({
  doc,
  id,
  onConfirm,
  onCancel,
}: {
  doc: Doc;
  id: string;
  onConfirm: (o: DeleteOptions) => void;
  onCancel: () => void;
}) {
  const impact = deleteImpact(doc, id);
  const [children, setChildren] = useState<DeleteOptions["children"]>("moveUp");
  const [links, setLinks] = useState<DeleteOptions["links"]>("keepAsBlock");
  const b = doc.blocks[id];
  const parentTitle = titleOf(doc, b.parentId!);
  const affected = children === "delete" ? [...impact.directLinks, ...impact.descendantLinks] : impact.directLinks;
  const inkedLinks = affected.filter((l) => l.inked).length;
  const parts: string[] = [];
  if (impact.childCount) parts.push(`${impact.childCount} block${impact.childCount > 1 ? "s" : ""} beneath it${impact.inkedChildCount ? ` (${impact.inkedChildCount} inked)` : ""}`);
  const relCount = impact.directLinks.length + impact.descendantLinks.length;
  if (relCount) parts.push(`${relCount} relation${relCount > 1 ? "s" : ""}`);
  const otherNames = [...new Set(affected.map((l) => titleOf(doc, l.otherId)).filter(Boolean))];
  return (
    <Modal label={`Delete ${b.title}?`} onClose={onCancel}>
      <div className="stack" style={{ gap: 6, padding: "0 8px" }}>
        <h2>Delete “{b.title}”?</h2>
        <p className="sub-t">
          {parts.length ? `It has ${parts.join(" and ")}.` : "This block will be removed."}
          {b.lifecycle === "inked" ? " It's part of your inked notes." : ""}
        </p>
      </div>
      {impact.childCount > 0 && (
        <fieldset>
          <legend>Blocks beneath it</legend>
          <label className="radio">
            <input type="radio" name="c" checked={children === "moveUp"} onChange={() => setChildren("moveUp")} />
            <span>Move them up to “{parentTitle}”</span>
          </label>
          <label className="radio">
            <input type="radio" name="c" checked={children === "delete"} onChange={() => setChildren("delete")} />
            <span>
              Delete them too{impact.inkedChildCount ? <span style={{ color: "#73726E" }}> · includes {impact.inkedChildCount} inked</span> : null}
            </span>
          </label>
        </fieldset>
      )}
      {affected.length > 0 && (
        <fieldset>
          <legend>
            {affected.length === 1 ? `Relation with ${otherNames[0] ?? "another block"}` : `${affected.length} relations`}
            {inkedLinks ? ` · ${inkedLinks} inked` : ""}
          </legend>
          <label className="radio">
            <input type="radio" name="l" checked={links === "keepAsBlock"} onChange={() => setLinks("keepAsBlock")} />
            <span>
              Keep {affected.length === 1 ? "its" : "their"} notes as a block under {otherNames.length === 1 ? `“${otherNames[0]}”` : "the other end"}
            </span>
          </label>
          <label className="radio">
            <input type="radio" name="l" checked={links === "delete"} onChange={() => setLinks("delete")} />
            <span>Delete the relation{affected.length > 1 ? "s" : ""}</span>
          </label>
        </fieldset>
      )}
      <div className="stack">
        <button className="b danger" onClick={() => onConfirm({ children, links })}>
          Delete
        </button>
        <button className="b outline" onClick={onCancel}>
          Cancel
        </button>
        <span style={{ fontSize: 12, color: "#73726E", textAlign: "center", paddingTop: 4 }}>You can undo for 10 seconds.</span>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pick a block (Move to / Relate)
// ---------------------------------------------------------------------------

function BlockPicker({
  doc,
  candidates,
  onPick,
  disabledReason,
}: {
  doc: Doc;
  candidates: string[];
  onPick: (id: string) => void;
  disabledReason?: (id: string) => string | null;
}) {
  const [q, setQ] = useState("");
  const items = candidates.filter((id) => titleOf(doc, id).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <input className="search" placeholder="Search blocks…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search blocks" />
      <div className="pick" role="listbox">
        {items.length === 0 && <div className="empty">No matching blocks.</div>}
        {items.map((id) => {
          const reason = disabledReason?.(id) ?? null;
          const d = doc.blocks[id] ? depth(doc, id) : 0;
          return (
            <button
              key={id}
              role="option"
              aria-selected={false}
              disabled={!!reason}
              title={reason ?? undefined}
              onClick={() => onPick(id)}
              style={{ paddingLeft: 8 + (q ? 0 : d * 14), opacity: reason ? 0.45 : 1 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleOf(doc, id)}</span>
              {getContainer(doc, id)?.lifecycle === "explored" && <span className="lvl">draft</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function MoveDialog({ doc, id, onPick, onCancel }: { doc: Doc; id: string; onPick: (parentId: string) => void; onCancel: () => void }) {
  const sub = new Set([id, ...descendants(doc, id)]);
  const own = doc.blocks[id].parentId;
  const candidates = [...treeOrder(doc), ...Object.keys(doc.links).flatMap((l) => [l, ...descendants(doc, l)])].filter((c) => !sub.has(c));
  return (
    <Modal label="Move to" onClose={onCancel}>
      <div className="stack" style={{ gap: 6 }}>
        <h2>Move “{doc.blocks[id].title}” to…</h2>
        <p className="sub-t">It moves with everything beneath it and becomes the last block under the one you pick.</p>
      </div>
      <BlockPicker doc={doc} candidates={candidates} onPick={onPick} disabledReason={(c) => (c === own ? "Already here" : canMove(doc, id, c))} />
      <div className="actions">
        <button className="b outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Relate
// ---------------------------------------------------------------------------

export function RelateDialog({
  doc,
  fromId,
  onAsk,
  onWrite,
  onCancel,
}: {
  doc: Doc;
  fromId: string;
  onAsk: (otherId: string, question: string) => Promise<void>;
  onWrite: (otherId: string, title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [other, setOther] = useState<string | null>(null);
  const [mode, setMode] = useState<"ask" | "write">("ask");
  const [question, setQuestion] = useState("How are they different?");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const candidates = treeOrder(doc).filter((id) => id !== fromId && id !== doc.rootId && !isInsideLink(doc, id));
  const from = doc.blocks[fromId];

  const ask = async () => {
    if (!other || !question.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onAsk(other, question.trim());
    } catch (e) {
      setErr(`Couldn't write the relation. Nothing was added. ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Modal label="Relate" onClose={() => !busy && onCancel()}>
      <div className="stack" style={{ gap: 6 }}>
        <h2>Relate “{from.title}” to…</h2>
        <p className="sub-t">A relation is its own note about how two parts of your page connect. It doesn't move either block.</p>
      </div>
      {!other ? (
        <BlockPicker doc={doc} candidates={candidates} onPick={setOther} />
      ) : (
        <>
          <div className="prop">
            <span className="ment" style={{ cursor: "default" }}>{from.title}</span>
            <span style={{ color: "#9B9A97" }}>↔</span>
            <span className="ment" style={{ cursor: "default" }}>{doc.blocks[other].title}</span>
            <button className="b sm muted" onClick={() => setOther(null)} disabled={busy}>
              Change
            </button>
          </div>
          <div className="prop" role="tablist">
            <button className="b sm" role="tab" aria-selected={mode === "ask"} style={{ background: mode === "ask" ? "#EFEFED" : undefined }} onClick={() => setMode("ask")}>
              Ask
            </button>
            <button className="b sm" role="tab" aria-selected={mode === "write"} style={{ background: mode === "write" ? "#EFEFED" : undefined }} onClick={() => setMode("write")}>
              Write your own
            </button>
          </div>
          {mode === "ask" ? (
            <label className="field">
              Question
              <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} disabled={busy} autoFocus maxLength={300} />
            </label>
          ) : (
            <>
              <label className="field">
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How are they different?" autoFocus maxLength={200} />
              </label>
              <label className="field">
                Notes
                <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Markdown and $math$ supported" />
              </label>
            </>
          )}
          {busy && (
            <div className="writing" style={{ margin: 0 }}>
              <span className="n">Writing…</span>
              <span className="skel" style={{ width: "70%" }} />
              <span className="skel" style={{ width: "90%" }} />
            </div>
          )}
          {err && <p className="err">{err}</p>}
          <div className="actions">
            <button className="b outline" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            {mode === "ask" ? (
              <button className="b primary" onClick={ask} disabled={busy || !question.trim()}>
                Ask
              </button>
            ) : (
              <button className="b primary" onClick={() => onWrite(other, title.trim() || "Relation", body)} disabled={!title.trim() && !body.trim()}>
                Add relation
              </button>
            )}
          </div>
        </>
      )}
      {!other && (
        <div className="actions">
          <button className="b outline" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ask for a new version (side-by-side, never silent)
// ---------------------------------------------------------------------------

export function VersionDialog({
  doc,
  id,
  onUse,
  onAddSeparate,
  onCancel,
}: {
  doc: Doc;
  id: string;
  onUse: (d: BlockDraft) => void;
  onAddSeparate: ((d: BlockDraft) => void) | null;
  onCancel: () => void;
}) {
  const item = getContainer(doc, id)!;
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  // Snapshot of the request so later edits don't change what's being compared.
  const request = useMemo(() => ({ context: contextFor(doc, id), current: { title: item.title, body: item.body } }), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    setDraft(null);
    setErr(null);
    api.rewrite(doc.id, request).then(
      (r) => alive && setDraft(r.draft),
      (e) => alive && setErr((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [request, doc.id]);
  return (
    <Modal label="New version" onClose={onCancel} className="cmp-wide">
      <div className="stack" style={{ gap: 6 }}>
        <h2>New version of “{item.title}”</h2>
        <p className="sub-t">Nothing changes unless you choose to use the new version.</p>
      </div>
      <div className="cmp">
        <div>
          <span className="pill edited">{item.edited ? "Yours · edited" : "Current"}</span>
          <span className="ttl">{item.title}</span>
          <Body text={item.body} />
        </div>
        <div>
          <span className="pill" style={{ background: "#EDEDEC", color: "#141413" }}>
            New version
          </span>
          {draft ? (
            <>
              <span className="ttl">{draft.title}</span>
              <div style={{ color: "#5F5E5B" }}>
                <Body text={draft.body} />
              </div>
            </>
          ) : err ? (
            <p className="fail" role="alert">
              Couldn't write a new version. ({err}){" "}
              <button onClick={() => setN((x) => x + 1)}>Try again</button>
            </p>
          ) : (
            <div className="writing" style={{ margin: 0 }}>
              <span className="n">Writing…</span>
              <span className="skel" style={{ width: "70%" }} />
              <span className="skel" style={{ width: "90%" }} />
            </div>
          )}
        </div>
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="b primary" onClick={onCancel}>
          Keep mine
        </button>
        <button className="b outline" disabled={!draft} onClick={() => draft && onUse(draft)}>
          Use new
        </button>
        {onAddSeparate && (
          <button className="b outline" disabled={!draft} onClick={() => draft && onAddSeparate(draft)}>
            Add as separate block
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportDialog({ doc, onClose, onDone }: { doc: Doc; onClose: () => void; onDone: (msg: string) => void }) {
  const [scope, setScope] = useState<ExportScope>("inked");
  const [format, setFormat] = useState<"md" | "json">("md");
  const [relationsAtEnd, setRelationsAtEnd] = useState(true);
  const [latex, setLatex] = useState(true);
  const text = useMemo(
    () => (format === "md" ? toMarkdown(doc, { scope, relationsAtEnd, latex }) : JSON.stringify(toJSON(doc, scope), null, 2)),
    [doc, scope, format, relationsAtEnd, latex],
  );
  const name = exportFileName(doc, format);
  const blocks = Object.values(doc.blocks).filter((b) => scope === "all" || b.lifecycle === "inked").length;
  const rels = Object.values(doc.links).filter((l) => scope === "all" || l.lifecycle === "inked").length;
  return (
    <Modal label="Export" onClose={onClose} className="wide">
      <div className="exp-l">
        <h2 style={{ margin: "0 0 12px" }}>Export</h2>
        <div className="set">
          <label htmlFor="scope">Include</label>
          <select id="scope" value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
            <option value="inked">Inked only</option>
            <option value="all">Whole topic</option>
          </select>
        </div>
        <div className="set">
          <label htmlFor="fmt">Format</label>
          <select id="fmt" value={format} onChange={(e) => setFormat(e.target.value as "md" | "json")}>
            <option value="md">Markdown</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <div style={{ borderTop: "1px solid #EDEDEC", margin: "10px 0 6px" }} />
        <label className="check" style={{ minHeight: 30, opacity: format === "md" ? 1 : 0.5 }}>
          <input type="checkbox" checked={relationsAtEnd} disabled={format !== "md"} onChange={(e) => setRelationsAtEnd(e.target.checked)} />
          Relations at the end
        </label>
        <label className="check" style={{ minHeight: 30, opacity: format === "md" ? 1 : 0.5 }}>
          <input type="checkbox" checked={latex} disabled={format !== "md"} onChange={(e) => setLatex(e.target.checked)} />
          Formulas as LaTeX
        </label>
        <p className="exp-note">
          {blocks} {scope === "inked" ? "inked " : ""}block{blocks === 1 ? "" : "s"} and {rels} relation{rels === 1 ? "" : "s"}. Made on this device; no internet needed.
          {format === "json" ? " JSON keeps ids, hierarchy, relations and states for re-import." : ""}
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 20, flexWrap: "wrap" }}>
          <button
            className="b primary"
            onClick={() => {
              download(name, text, format === "md" ? "text/markdown" : "application/json");
              onDone(`Exported ${name}`);
            }}
          >
            Export
          </button>
          <button
            className="b outline"
            onClick={() =>
              navigator.clipboard.writeText(text).then(
                () => onDone("Copied to clipboard"),
                () => onDone("Couldn't copy"),
              )
            }
          >
            Copy
          </button>
          <button className="b muted" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
      <div className="exp-r">
        <span style={{ fontSize: 12, fontWeight: 500, color: "#73726E" }}>Preview · {name}</span>
        <pre tabIndex={0} aria-label="Export preview">
          {text}
        </pre>
        {scope === "inked" && <span style={{ fontSize: 12, color: "#73726E" }}>Inked blocks always sit under inked parents, so the notes read as a complete outline.</span>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Clean up / confirm
// ---------------------------------------------------------------------------

export function CleanupDialog({ doc, onConfirm, onCancel }: { doc: Doc; onConfirm: () => void; onCancel: () => void }) {
  const p = cleanupPreview(doc);
  const none = p.blocks + p.links === 0;
  return (
    <Modal label="Clean up drafts" onClose={onCancel}>
      <div className="stack" style={{ gap: 6 }}>
        <h2>Clean up drafts?</h2>
        <p className="sub-t">
          {none
            ? "There are no explored drafts on this page. Everything is inked."
            : `This removes ${p.blocks} explored block${p.blocks === 1 ? "" : "s"}${p.links ? ` and ${p.links} explored relation${p.links === 1 ? "" : "s"}` : ""}. Inked blocks are never touched.`}
        </p>
      </div>
      <div className="actions">
        <button className="b outline" onClick={onCancel}>
          {none ? "Close" : "Cancel"}
        </button>
        {!none && (
          <button className="b danger" onClick={onConfirm}>
            Remove drafts
          </button>
        )}
      </div>
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  text,
  confirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal label={title} onClose={onCancel}>
      <div className="stack" style={{ gap: 6 }}>
        <h2>{title}</h2>
        <p className="sub-t">{text}</p>
      </div>
      <div className="actions">
        <button className="b outline" onClick={onCancel}>
          Cancel
        </button>
        <button className="b danger" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </Modal>
  );
}
