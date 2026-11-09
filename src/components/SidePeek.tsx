import { useContext, useEffect, useRef, useState } from "react";
import { Close, Check, LinkIco, Rel } from "../icons.tsx";
import { Body, BlockView, DocViewCtx, PendingRow, SubtopicRow, editOnClick } from "./Block.tsx";
import { Editor } from "./Editor.tsx";

/** A side link opens here, never inline, so the page's narrative stays intact. */
export function SidePeek({ linkId, onClose, onDelete, onGoto }: { linkId: string; onClose: () => void; onDelete: () => void; onGoto: (id: string) => void }) {
  const view = useContext(DocViewCtx);
  const { doc, editingId, actions, newIds, hideExplored } = view;
  const l = doc.links[linkId];
  const [editFocus, setEditFocus] = useState<"title" | "body">("body");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".overlay") && editingId !== linkId) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, editingId, linkId]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
  }, [linkId]);

  if (!l) return null;
  const [a, b] = l.endpoints.map((e) => doc.blocks[e]);
  const explored = l.lifecycle === "explored";
  const bothInked = a?.lifecycle === "inked" && b?.lifecycle === "inked";
  const editing = editingId === linkId;

  return (
    <aside className="peek" aria-label={`Relation: ${a?.title} and ${b?.title}`} ref={ref}>
      <div className="peek-bar">
        <button className="b icon muted" aria-label="Close relation" onClick={onClose}>
          <Close />
        </button>
        <div style={{ display: "flex", gap: 2 }}>
          {!editing && (
            <button className="b sm" onClick={() => actions.requestNewVersion(linkId)}>
              New version
            </button>
          )}
          <button className="b sm" style={{ color: "#C4362F" }} onClick={onDelete}>
            Delete relation
          </button>
        </div>
      </div>
      <div className="peek-body">
        <Rel className="peek-icon" style={{ width: 32, height: 32 }} />
        {editing ? (
          <Editor initial={{ title: l.title, body: l.body }} focus={editFocus} onSave={(p) => actions.saveEdit(linkId, p)} onCancel={actions.cancelEdit} />
        ) : (
          <h1
            className="editable"
            onClick={editOnClick(() => {
              setEditFocus("title");
              actions.startEdit(linkId);
            })}
            style={{ margin: 0, fontSize: 30, fontWeight: 700, lineHeight: 1.25, color: explored ? "#37352F" : "#141413", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {l.title || "Relation"}
            {newIds.has(linkId) && <span className="pill new">New</span>}
            {l.edited && <span className="pill edited">Edited</span>}
          </h1>
        )}
        <div className="props">
          <div className="prop">
            <span className="k">
              <LinkIco />
              Connects
            </span>
            <span className="v">
              <button className="ment" onClick={() => onGoto(a.id)}>
                {a?.title}
              </button>
              <span style={{ color: "#9B9A97" }}>↔</span>
              <button className="ment" onClick={() => onGoto(b.id)}>
                {b?.title}
              </button>
            </span>
          </div>
          <div className="prop">
            <span className="k">
              <Check style={{ width: 14, height: 14 }} />
              Notes
            </span>
            <span className="v">
              {explored ? (
                <>
                  <span className="pill draft">Draft</span>
                  <button className="b sm outline" onClick={() => actions.requestInk(linkId)} aria-label="Ink this relation">
                    <Check style={{ width: 14, height: 14 }} /> Ink
                  </button>
                  <span style={{ fontSize: 12, color: "#73726E" }}>{bothInked ? "both ends inked" : "ends will be inked with it"}</span>
                </>
              ) : (
                <>
                  <span className="pill" style={{ background: "#EDEDEC", color: "#141413" }}>
                    Inked
                  </span>
                  <span style={{ fontSize: 12, color: "#73726E" }}>both ends inked</span>
                </>
              )}
            </span>
          </div>
        </div>
        {!editing && (
          <div className={explored ? "block explored" : "block inked"} style={explored ? { margin: 0 } : undefined}>
            <div className="self">
              <Body
                text={l.body}
                onClick={editOnClick(() => {
                  setEditFocus("body");
                  actions.startEdit(linkId);
                })}
              />
              <SubtopicRow containerId={linkId} title={l.title} />
            </div>
          </div>
        )}
        <div className="children">
          {l.childIds.map((c) => (
            <BlockView key={c} id={c} depth={1} parentExplored={false} />
          ))}
          <PendingRow containerId={linkId} />
        </div>
        {hideExplored && l.childIds.some((c) => doc.blocks[c]?.lifecycle === "explored") && (
          <p style={{ fontSize: 13, color: "#73726E" }}>Some drafts are hidden.</p>
        )}
      </div>
    </aside>
  );
}
