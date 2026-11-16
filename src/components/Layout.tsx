import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  Download,
  FileText,
  Info,
  LayoutDashboard,
  Menu,
  PieChart,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import type { PageId, RangeSelection } from '../types';
import { fmtDayMonth, monthKey, monthLabel } from '../lib/dates';
import { downloadFile } from '../lib/export';
import { money, moneySigned } from '../lib/format';
import type { Snapshot } from '../engine/snapshot';
import { makeBackup, TODAY, useStore } from '../store/useStore';
import { Confirm, toast, usePopover, useUi } from './ui';

export const NAV: { id: PageId; label: string; icon: typeof Activity; group?: string; badge?: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Money' },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'analytics', label: 'Spending Analytics', icon: PieChart },
  { id: 'cashflow', label: 'Cash Flow', icon: Activity },
  { id: 'forecast', label: 'Financial Forecast', icon: TrendingUp, group: 'Planning' },
  { id: 'budgets', label: 'Budgets', icon: Target },
  { id: 'advisor', label: 'AI Financial Advisor', icon: Sparkles, badge: 'AI' },
  { id: 'reports', label: 'Reports', icon: FileText, group: 'Records' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

function Logo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
        <path d="M6 22.5 13 14l4.5 4.5L26 7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="26" cy="7" r="2.6" fill="#fff" />
      </svg>
    </span>
  );
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const page = useUi((s) => s.page);
  const navigate = useUi((s) => s.navigate);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggle = useStore((s) => s.toggleSidebar);
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <div className="brand-text">
          <div className="brand-name">
            FinPilot <span>AI</span>
          </div>
          <div className="brand-tag">
            Your Money. Your Strategy.
            <br />
            Your AI CFO.
          </div>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <div key={n.id} style={{ display: 'contents' }}>
            {n.group && <div className="nav-group">{n.group}</div>}
            <button
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              aria-current={page === n.id ? 'page' : undefined}
              title={collapsed ? n.label : undefined}
              onClick={() => {
                navigate(n.id);
                onNavigate();
              }}
            >
              <n.icon />
              <span className="nav-label">{n.label}</span>
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </button>
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
        <span className="side-foot-text">Data stays in this browser</span>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */

function GlobalSearch({ snap }: { snap: Snapshot }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const { open, setOpen, ref } = usePopover();
  const input = useRef<HTMLInputElement>(null);
  const navigate = useUi((s) => s.navigate);
  const setTxQuery = useUi((s) => s.setTxQuery);
  const ask = useUi((s) => s.ask);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: { key: string; icon: ReactNode; label: string; meta?: string; run: () => void }[] = [];
    for (const n of NAV) {
      if (n.label.toLowerCase().includes(s)) out.push({ key: `p-${n.id}`, icon: <n.icon />, label: n.label, meta: 'Page', run: () => navigate(n.id) });
    }
    const hits = snap.txs.filter((t) => `${t.merchant} ${t.description} ${t.category} ${t.id} ${t.method}`.toLowerCase().includes(s));
    if (hits.length) {
      out.push({
        key: 'all',
        icon: <ArrowLeftRight />,
        label: `Show all ${hits.length} matching transactions`,
        meta: moneySigned(hits.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0)),
        run: () => {
          setTxQuery(q.trim());
          navigate('transactions');
        },
      });
      for (const t of hits.slice(-5).reverse()) {
        out.push({
          key: t.id,
          icon: <span className="swatch" style={{ background: t.type === 'income' ? 'var(--good)' : 'var(--violet)' }} />,
          label: `${t.merchant} · ${fmtDayMonth(t.date)}`,
          meta: `${t.type === 'income' ? '+' : '−'}${money(t.amount)}`,
          run: () => {
            setTxQuery(t.id);
            navigate('transactions');
          },
        });
      }
    }
    out.push({ key: 'ask', icon: <Sparkles />, label: `Ask the advisor: “${q.trim()}”`, run: () => ask(q.trim()) });
    return out;
  }, [q, snap.txs, navigate, setTxQuery, ask]);

  const run = (i: number) => {
    const r = results[i];
    if (!r) return;
    r.run();
    setOpen(false);
    setQ('');
    input.current?.blur();
  };

  return (
    <div className="search" ref={ref}>
      <Search />
      <input
        ref={input}
        value={q}
        placeholder="Search transactions, pages, or ask a question"
        aria-label="Search"
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(results.length - 1, c + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          } else if (e.key === 'Enter') run(cursor);
          else if (e.key === 'Escape') input.current?.blur();
        }}
      />
      <span className="kbd">/</span>
      {open && results.length > 0 && (
        <div className="popover wide" style={{ left: 0, right: 0 }}>
          {results.map((r, i) => (
            <button key={r.key} className={`menu-row ${i === cursor ? 'cursor' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => run(i)}>
              {r.icon}
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </span>
              {r.meta && <span className="muted num">{r.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RangePicker({ snap }: { snap: Snapshot }) {
  const { open, setOpen, ref } = usePopover();
  const sel = useStore((s) => s.range);
  const setRange = useStore((s) => s.setRange);
  const [from, setFrom] = useState(snap.range.from);
  const [to, setTo] = useState(snap.range.to > TODAY ? TODAY : snap.range.to);
  const months = [...snap.monthly].reverse().filter((m) => m.count > 0 || m.month === monthKey(TODAY));
  const pick = (r: RangeSelection) => {
    setRange(r);
    setOpen(false);
  };
  const isOn = (r: RangeSelection) => sel.preset === r.preset && (r.preset !== 'month' || sel.month === r.month);
  const Row = ({ r, label, meta }: { r: RangeSelection; label: string; meta?: string }) => (
    <button className={`menu-row ${isOn(r) ? 'selected' : ''}`} onClick={() => pick(r)}>
      <span className="grow">{label}</span>
      {meta && <span className="muted">{meta}</span>}
      {isOn(r) && <Check className="good" />}
    </button>
  );
  return (
    <div className="rel" ref={ref}>
      <button className="range-btn" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open} aria-label={`Date range: ${snap.range.label}`}>
        <CalendarDays />
        <span className="range-label">{snap.range.label}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="popover wide" style={{ right: 0, width: 290 }}>
          <div className="popover-title">Month</div>
          <div style={{ maxHeight: 190, overflowY: 'auto' }}>
            {months.map((m) => (
              <Row key={m.month} r={{ preset: 'month', month: m.month }} label={monthLabel(m.month)} meta={m.inProgress ? 'in progress' : undefined} />
            ))}
          </div>
          <div className="menu-sep" />
          <div className="popover-title" style={{ paddingTop: 4 }}>
            Period
          </div>
          <Row r={{ preset: 'last3' }} label="Last 3 months" />
          <Row r={{ preset: 'last6' }} label="Last 6 months" />
          <Row r={{ preset: 'ytd' }} label="Year to date" />
          <Row r={{ preset: 'all' }} label="All time" />
          <div className="menu-sep" />
          <div style={{ padding: '6px 14px 14px' }}>
            <div className="popover-title" style={{ padding: '0 0 8px' }}>
              Custom range
            </div>
            <div className="row">
              <input type="date" className="input sm" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" className="input sm" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="btn sm primary" style={{ width: '100%', marginTop: 8 }} disabled={!from || !to} onClick={() => pick({ preset: 'custom', from, to })}>
              Apply range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Notifications({ snap }: { snap: Snapshot }) {
  const { open, setOpen, ref } = usePopover();
  const read = useStore((s) => s.readNotifications);
  const markRead = useStore((s) => s.markRead);
  const navigate = useUi((s) => s.navigate);
  const [fresh, setFresh] = useState<string[]>([]);
  const unread = snap.notifications.filter((n) => !read.includes(n.id));
  const toggle = () => {
    if (!open) {
      setFresh(unread.map((n) => n.id));
      markRead(unread.map((n) => n.id));
    }
    setOpen(!open);
  };
  const Icon = { warn: TriangleAlert, bad: CircleAlert, info: Info };
  return (
    <div className="rel" ref={ref}>
      <button className="icon-btn" onClick={toggle} aria-label={`Notifications, ${unread.length} unread`}>
        <Bell />
        {unread.length > 0 && <span className="dot">{unread.length}</span>}
      </button>
      {open && (
        <div className="popover wide" style={{ right: 0, width: 360 }}>
          <div className="popover-title">Notifications · {monthLabel(monthKey(TODAY))}</div>
          {snap.notifications.length === 0 && (
            <div className="empty" style={{ padding: '22px 16px 26px' }}>
              <b>You are all caught up</b>
              Budget alerts at 80%, 90% and 100%, unusual purchases and payments due soon appear here.
            </div>
          )}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {snap.notifications.map((n) => {
              const I = Icon[n.tone];
              return (
                <button
                  key={n.id}
                  className="insight"
                  onClick={() => {
                    navigate(n.page);
                    setOpen(false);
                  }}
                >
                  <span className={`insight-ico ${n.tone}`}>
                    <I className={n.tone === 'info' ? '' : n.tone} />
                  </span>
                  <span className="grow">
                    <span className="insight-title" style={{ display: 'block' }}>
                      {n.title}
                    </span>
                    <span className="insight-body">{n.body}</span>
                  </span>
                  {fresh.includes(n.id) && <span className="pill violet">New</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ snap }: { snap: Snapshot }) {
  const { open, setOpen, ref } = usePopover();
  const navigate = useUi((s) => s.navigate);
  const resetDemo = useStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  const name = snap.settings.name.trim() || 'You';
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="rel" ref={ref}>
      <button className="avatar" onClick={() => setOpen(!open)} aria-label="Profile menu" aria-haspopup="true" aria-expanded={open}>
        {initials}
      </button>
      {open && (
        <div className="popover wide" style={{ right: 0, width: 250 }}>
          <div style={{ padding: '14px 14px 10px' }}>
            <b>{name}</b>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {snap.settings.email || 'No email set'}
            </div>
          </div>
          <div className="menu-sep" style={{ marginTop: 0 }} />
          <button
            className="menu-row"
            onClick={() => {
              navigate('settings');
              setOpen(false);
            }}
          >
            <SettingsIcon /> Settings
          </button>
          <button
            className="menu-row"
            onClick={() => {
              downloadFile(`finpilot-backup-${TODAY}.json`, JSON.stringify(makeBackup(), null, 2), 'application/json');
              toast('Backup downloaded', 'Transactions, budgets and settings saved as JSON.');
              setOpen(false);
            }}
          >
            <Download /> Download backup
          </button>
          <button
            className="menu-row"
            onClick={() => {
              setConfirm(true);
              setOpen(false);
            }}
          >
            <RotateCcw /> Reset demo data
          </button>
          <div style={{ height: 6 }} />
        </div>
      )}
      {confirm && (
        <Confirm
          title="Reset demo data?"
          body="This replaces all current transactions, budgets and settings with the built-in demo dataset. Download a backup first if you want to keep your data."
          confirmLabel="Reset demo data"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            resetDemo();
            toast('Demo data restored', 'Transactions, budgets and settings are back to the sample dataset.');
          }}
        />
      )}
    </div>
  );
}

export function Topbar({ snap, onMenu }: { snap: Snapshot; onMenu: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open navigation">
        <Menu />
      </button>
      <GlobalSearch snap={snap} />
      <div className="top-actions">
        <RangePicker snap={snap} />
        <Notifications snap={snap} />
        <ProfileMenu snap={snap} />
      </div>
    </header>
  );
}
