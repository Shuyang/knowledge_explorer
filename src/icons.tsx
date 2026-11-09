import type { CSSProperties } from "react";

type P = { style?: CSSProperties; className?: string };

export const Check = (p: P) => (
  <svg className={`i ${p.className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true" style={p.style}>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12.5 2.5 2.5 5.5-5.5" />
  </svg>
);
export const Plus = (p: P) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={p.style}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);
export const Rel = (p: P) => (
  <svg className={`i ${p.className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true" style={p.style}>
    <path d="M8 3 4 7l4 4" />
    <path d="M4 7h16" />
    <path d="m16 21 4-4-4-4" />
    <path d="M20 17H4" />
  </svg>
);
export const Dots = (p: P) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={p.style}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);
export const Grip = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="9" cy="5" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="9" cy="19" r="1.6" />
    <circle cx="15" cy="5" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="15" cy="19" r="1.6" />
  </svg>
);
export const Caret = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 12 12" aria-hidden="true" className="caret">
    {open ? <path d="M2 4l4 5 4-5z" /> : <path d="M4 2l5 4-5 4z" />}
  </svg>
);
export const Info = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);
export const X = (p: P) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={p.style}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
export const Close = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m13 17 5-5-5-5" />
    <path d="m6 17 5-5-5-5" />
  </svg>
);
export const File = (p: P) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={p.style}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);
export const LinkIco = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14 }}>
    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <path d="M8 12h8" />
  </svg>
);
