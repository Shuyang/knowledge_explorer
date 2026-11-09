import { useEffect, useLayoutEffect, useRef, useState } from "react";

const MAX_IMAGE = 8 * 1024 * 1024;

function readAsDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/**
 * In-place editor for one block: title + Markdown body (with $math$ and images). No buttons:
 * it saves when focus leaves it (or on ⌘↵) and Esc cancels. Paste or drop an image to insert it.
 */
export function Editor({
  initial,
  onSave,
  onCancel,
  titleLabel = "Title",
  focus = "body",
}: {
  initial: { title: string; body: string };
  onSave: (v: { title: string; body: string }) => boolean | void;
  onCancel: () => void;
  titleLabel?: string;
  focus?: "title" | "body";
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const ti = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [body]);

  useEffect(() => {
    const el = focus === "title" ? ti.current : ta.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [focus]);

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

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    // An empty title keeps the old one rather than blocking the user from leaving.
    if (!save) return onCancel();
    if (onSave({ title: title.trim() ? title : initial.title, body }) === false) done.current = false;
  };

  return (
    <div
      className="editor"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) finish(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          finish(true);
        }
      }}
    >
      <label className="sr-only" htmlFor="ed-title">
        {titleLabel}
      </label>
      <input
        id="ed-title"
        ref={ti}
        className="title ttl"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            ta.current?.focus();
          }
        }}
        placeholder={titleLabel}
        maxLength={200}
      />
      <label className="sr-only" htmlFor="ed-body">
        Text
      </label>
      <textarea
        id="ed-body"
        ref={ta}
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a paragraph, a formula ($$ … $$), or paste an image"
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
      {err && <p className="err">{err}</p>}
      <span className="hint" aria-hidden="true">
        Markdown · $math$ · paste or drop images · click outside to save · Esc to cancel
      </span>
    </div>
  );
}
