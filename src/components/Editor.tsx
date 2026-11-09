import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Body } from "./Block.tsx";

const MAX_IMAGE = 8 * 1024 * 1024;

function readAsDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** Inline editor for one block: title + Markdown body (with $math$ and images). */
export function Editor({
  initial,
  onSave,
  onCancel,
  titleLabel = "Title",
}: {
  initial: { title: string; body: string };
  onSave: (v: { title: string; body: string }) => void;
  onCancel: () => void;
  titleLabel?: string;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 520)}px`;
  }, [body, preview]);

  useEffect(() => {
    ta.current?.focus();
  }, []);

  const insert = (text: string) => {
    const el = ta.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
  };

  const addImage = async (f: File) => {
    if (!f.type.startsWith("image/")) return setErr("Only images can be inserted");
    if (f.size > MAX_IMAGE) return setErr("Images must be under 8 MB");
    setErr(null);
    const url = await readAsDataURL(f);
    insert(`\n\n![${f.name.replace(/[[\]]/g, "")}](${url})\n\n`);
  };

  const save = () => {
    if (!title.trim()) return setErr("A block needs a title");
    onSave({ title, body });
  };

  return (
    <div
      className="editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <label className="sr-only" htmlFor="ed-title">
        {titleLabel}
      </label>
      <input id="ed-title" className="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titleLabel} maxLength={200} />
      <label className="sr-only" htmlFor="ed-body">
        Text
      </label>
      {preview ? (
        <div className="preview">
          <Body text={body || "_Nothing yet_"} />
        </div>
      ) : (
        <textarea
          id="ed-body"
          ref={ta}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a paragraph, a formula ($$ … $$) or add an image"
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
            if (f) {
              e.preventDefault();
              void addImage(f);
            }
          }}
          onDrop={(e) => {
            const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
            if (f) {
              e.preventDefault();
              void addImage(f);
            }
          }}
        />
      )}
      {err && <p className="err">{err}</p>}
      <div className="row">
        <span className="hint">Markdown · $inline$ and $$display$$ math · ⌘↵ to save</span>
        <button className="b sm" onClick={() => fileRef.current?.click()}>
          Add image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addImage(f);
            e.target.value = "";
          }}
        />
        <button className="b sm" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? "Write" : "Preview"}
        </button>
        <button className="b sm outline" onClick={onCancel}>
          Cancel
        </button>
        <button className="b sm primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
