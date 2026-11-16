import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Info, Minus, TriangleAlert, X } from 'lucide-react';
import { create } from 'zustand';
import type { Category, PageId } from '../types';
import { CATEGORY_COLOR } from '../lib/categories';
import { pct } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Routing (hash based — works from any static host)                   */
/* ------------------------------------------------------------------ */

const PAGES: PageId[] = ['overview', 'transactions', 'analytics', 'cashflow', 'forecast', 'budgets', 'advisor', 'reports', 'settings'];

const readHash = (): PageId => {
  const h = window.location.hash.replace(/^#\/?/, '') as PageId;
  return PAGES.includes(h) ? h : 'overview';
};

interface UiState {
  page: PageId;
  /** Search text handed to the Transactions page (from global search or a drill-down). */
  txQuery: string;
  /** A question handed to the advisor from elsewhere in the app. */
  pendingQuestion: string | null;
  navigate: (page: PageId) => void;
  setTxQuery: (q: string) => void;
  ask: (q: string) => void;
  takeQuestion: () => string | null;
}

export const useUi = create<UiState>((set, get) => ({
  page: readHash(),
  txQuery: '',
  pendingQuestion: null,
  navigate: (page) => {
    if (window.location.hash !== `#/${page}`) window.location.hash = `/${page}`;
    set({ page });
    window.scrollTo({ top: 0 });
  },
  setTxQuery: (txQuery) => set({ txQuery }),
  ask: (q) => {
    set({ pendingQuestion: q });
    get().navigate('advisor');
  },
  takeQuestion: () => {
    const q = get().pendingQuestion;
    if (q) set({ pendingQuestion: null });
    return q;
  },
}));

window.addEventListener('hashchange', () => useUi.setState({ page: readHash() }));

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export type ToastTone = 'good' | 'warn' | 'bad' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

let toastId = 0;
export const useToasts = create<{ toasts: Toast[]; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(title: string, body?: string, tone: ToastTone = 'good') {
  const id = ++toastId;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, tone, title, body }].slice(-4) }));
  setTimeout(() => useToasts.getState().dismiss(id), tone === 'good' ? 3600 : 6500);
}

const TONE_ICON = { good: CircleCheck, warn: TriangleAlert, bad: CircleAlert, info: Info };

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = TONE_ICON[t.tone];
        return (
          <div key={t.id} className="toast">
            <Icon className={t.tone === 'info' ? 'soft' : t.tone} />
            <div className="grow">
              <b>{t.title}</b>
              {t.body && <p>{t.body}</p>}
            </div>
            <button className="icon-btn bare" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  sub,
  action,
  children,
  className = '',
  flush,
  foot,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  foot?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div className="grow">
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
      {foot && <footer className="card-foot">{foot}</footer>}
    </section>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="head-actions">{children}</div>}
    </div>
  );
}

/** Change indicator. `upIsGood` decides the colour; `points` shows percentage points. */
export function Delta({ value, upIsGood = true, points }: { value: number | null; upIsGood?: boolean; points?: boolean }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="delta flat">
        <Minus /> n/a
      </span>
    );
  }
  const flat = Math.abs(value) < 0.0005;
  const up = value > 0;
  const good = flat ? null : up === upIsGood;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const text = points ? `${Math.abs(value * 100).toFixed(1)} pts` : pct(Math.abs(value));
  return (
    <span className={`delta ${good === null ? 'flat' : good ? 'good' : 'bad'}`}>
      <Icon />
      {text}
    </span>
  );
}

export function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="cat">
      <i className="swatch" style={{ background: CATEGORY_COLOR[category] }} />
      {category}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  sub,
  onClose,
  children,
  foot,
  wide,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button.primary')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          <button className="icon-btn bare" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="soft">{body}</p>
    </Modal>
  );
}

/** Closes a popover when clicking outside it or pressing Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Number input that keeps the user's text while typing and commits a parsed value. */
export function MoneyInput({
  value,
  onCommit,
  placeholder,
  small,
  ariaLabel,
  symbol = '€',
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  placeholder?: string;
  small?: boolean;
  ariaLabel?: string;
  symbol?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value));
  }, [value]);
  const commit = (raw: string) => {
    const t = raw.trim().replace(',', '.');
    if (t === '') return onCommit(null);
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) onCommit(Math.round(n * 100) / 100);
  };
  return (
    <div className={`input-prefix ${small ? 'sm' : ''}`}>
      <i>{symbol}</i>
      <input
        className={`input num ${small ? 'sm' : ''}`}
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          focused.current = false;
          setText(value === null ? '' : String(value));
        }}
      />
    </div>
  );
}
