import DOMPurify from "dompurify";
import katex from "katex";
import { Marked } from "marked";

const marked = new Marked({ gfm: true, breaks: false });
const cache = new Map<string, string>();

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml" });
  } catch {
    return `<code>${tex.replace(/[<&>]/g, (c) => `&#${c.charCodeAt(0)};`)}</code>`;
  }
}

/** Markdown + $…$ / $$…$$ math → sanitised HTML. */
export function renderMarkdown(src: string): string {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const math: string[] = [];
  const stash = (html: string) => `\u0000M${math.push(html) - 1}\u0000`;
  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => `\n\n${stash(renderMath(tex.trim(), true))}\n\n`);
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => `\n\n${stash(renderMath(tex.trim(), true))}\n\n`);
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => stash(renderMath(tex.trim(), false)));
  text = text.replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g, (_m, pre: string, tex: string) => pre + stash(renderMath(tex, false)));
  let html = marked.parse(text, { async: false }) as string;
  html = html.replace(/<p>\s*\u0000M(\d+)\u0000\s*<\/p>/g, (_m, i: string) => `<div class="math-display">${math[+i]}</div>`);
  html = html.replace(/\u0000M(\d+)\u0000/g, (_m, i: string) => math[+i]);
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  if (cache.size > 2000) cache.clear();
  cache.set(src, clean);
  return clean;
}
