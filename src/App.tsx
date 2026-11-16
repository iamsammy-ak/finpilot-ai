import { useEffect, useRef, useState } from 'react';
import { Sidebar, Topbar } from './components/Layout';
import { toast, Toasts, useUi } from './components/ui';
import { useSnapshot, useStore } from './store/useStore';
import Advisor from './pages/Advisor';
import Analytics from './pages/Analytics';
import Budgets from './pages/Budgets';
import CashFlow from './pages/CashFlow';
import Forecast from './pages/Forecast';
import Overview from './pages/Overview';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';

export default function App() {
  const snap = useSnapshot();
  const page = useUi((s) => s.page);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const epoch = useStore((s) => s.epoch);
  const [navOpen, setNavOpen] = useState(false);
  const lastEpoch = useRef(epoch);
  // Alerts that already exist when the app opens are listed under the bell, not toasted.
  const handled = useRef<Set<string> | null>(null);
  if (handled.current === null) handled.current = new Set(snap.notifications.map((n) => n.id));

  // Raise a toast the moment a change pushes a budget past 80%, 90% or 100%.
  useEffect(() => {
    const seen = handled.current!;
    if (lastEpoch.current !== epoch) {
      // The whole dataset was replaced: start again quietly rather than announcing every alert.
      lastEpoch.current = epoch;
      handled.current = new Set(snap.notifications.map((n) => n.id));
      return;
    }
    const fresh = snap.notifications.filter((n) => !seen.has(n.id));
    for (const n of fresh) seen.add(n.id);
    for (const n of fresh.filter((x) => x.id.startsWith('budget:')).slice(0, 3)) toast(n.title, n.body, n.tone === 'bad' ? 'bad' : 'warn');
  }, [snap.notifications, epoch]);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <Topbar snap={snap} onMenu={() => setNavOpen(true)} />
        <main key={page}>
          {page === 'overview' && <Overview s={snap} />}
          {page === 'transactions' && <Transactions s={snap} />}
          {page === 'analytics' && <Analytics s={snap} />}
          {page === 'cashflow' && <CashFlow s={snap} />}
          {page === 'forecast' && <Forecast s={snap} />}
          {page === 'budgets' && <Budgets s={snap} />}
          {page === 'advisor' && <Advisor s={snap} />}
          {page === 'reports' && <Reports s={snap} />}
          {page === 'settings' && <Settings s={snap} />}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
