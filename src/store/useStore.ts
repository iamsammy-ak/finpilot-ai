import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Budgets,
  Category,
  ForecastAssumptions,
  RangeSelection,
  Settings,
  Transaction,
  TransactionDraft,
} from '../types';
import { buildDemoTransactions, DEMO_BUDGETS, DEMO_SETTINGS } from '../data/demo';
import { monthKey, todayISO } from '../lib/dates';
import { setCurrency, uid } from '../lib/format';
import type { Answer } from '../engine/advisor';
import { buildSnapshot, type Snapshot } from '../engine/snapshot';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: Answer;
  at: number;
}

export interface Backup {
  app: 'finpilot-ai';
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  budgets: Budgets;
  settings: Settings;
}

interface State {
  transactions: Transaction[];
  budgets: Budgets;
  settings: Settings;
  assumptions: ForecastAssumptions;
  range: RangeSelection;
  chat: ChatMessage[];
  readNotifications: string[];
  sidebarCollapsed: boolean;
  /** True while the dataset is still the untouched demo. */
  isDemo: boolean;
  /** Bumped whenever the whole dataset is replaced (reset, restore, delete all). */
  epoch: number;

  addTransaction: (draft: TransactionDraft) => Transaction;
  updateTransaction: (id: string, patch: Partial<TransactionDraft>) => void;
  deleteTransactions: (ids: string[]) => void;
  importTransactions: (drafts: TransactionDraft[]) => number;
  setBudget: (category: Category, amount: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setAssumptions: (patch: Partial<ForecastAssumptions>) => void;
  setRange: (range: RangeSelection) => void;
  pushChat: (msg: Omit<ChatMessage, 'id' | 'at'>) => void;
  clearChat: () => void;
  markRead: (ids: string[]) => void;
  toggleSidebar: () => void;
  resetDemo: () => void;
  clearAll: () => void;
  restore: (backup: Backup) => void;
}

export const TODAY = todayISO();

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = { income: null, expenses: null, savingsTarget: 500, unexpected: 50 };

/** Open on the current month if it has activity, otherwise on the latest month that does. */
const defaultRange = (txs: Transaction[]): RangeSelection => {
  const cur = monthKey(TODAY);
  if (!txs.length || txs.some((t) => monthKey(t.date) === cur)) return { preset: 'month', month: cur };
  const latest = txs.reduce((m, t) => (t.date > m ? t.date : m), txs[0].date);
  return { preset: 'month', month: monthKey(latest) };
};

const nextId = (txs: Transaction[], offset = 0) => {
  let max = 1000;
  for (const t of txs) {
    const m = /^TX-(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TX-${max + 1 + offset}`;
};

const sortTx = (txs: Transaction[]) => [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

const demoState = () => {
  const transactions = buildDemoTransactions(TODAY);
  return {
    transactions,
    budgets: { ...DEMO_BUDGETS },
    settings: { ...DEMO_SETTINGS },
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    range: defaultRange(transactions),
    chat: [] as ChatMessage[],
    readNotifications: [] as string[],
    isDemo: true,
  };
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...demoState(),
      sidebarCollapsed: false,
      epoch: 0,

      addTransaction: (draft) => {
        const tx: Transaction = { ...draft, id: nextId(get().transactions) };
        set((s) => ({ transactions: sortTx([...s.transactions, tx]), isDemo: false }));
        return tx;
      },
      updateTransaction: (id, patch) =>
        set((s) => ({
          transactions: sortTx(s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t))),
          isDemo: false,
        })),
      deleteTransactions: (ids) => {
        const kill = new Set(ids);
        set((s) => ({ transactions: s.transactions.filter((t) => !kill.has(t.id)), isDemo: false }));
      },
      importTransactions: (drafts) => {
        const base = get().transactions;
        const added = drafts.map((d, i) => ({ ...d, id: nextId(base, i) }));
        set({ transactions: sortTx([...base, ...added]), isDemo: false });
        return added.length;
      },
      setBudget: (category, amount) =>
        set((s) => {
          const budgets = { ...s.budgets };
          if (amount > 0) budgets[category] = Math.round(amount * 100) / 100;
          else delete budgets[category];
          return { budgets };
        }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setAssumptions: (patch) => set((s) => ({ assumptions: { ...s.assumptions, ...patch } })),
      setRange: (range) => set({ range }),
      pushChat: (msg) => set((s) => ({ chat: [...s.chat, { ...msg, id: uid(), at: Date.now() }].slice(-60) })),
      clearChat: () => set({ chat: [] }),
      markRead: (ids) => set((s) => ({ readNotifications: [...new Set([...s.readNotifications, ...ids])].slice(-300) })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      resetDemo: () => set((s) => ({ ...demoState(), epoch: s.epoch + 1 })),
      clearAll: () =>
        set((s) => ({
          transactions: [],
          budgets: {},
          settings: { ...s.settings, openingBalance: 0, monthlyBudget: 0 },
          assumptions: { ...DEFAULT_ASSUMPTIONS },
          range: { preset: 'month', month: monthKey(TODAY) },
          chat: [],
          readNotifications: [],
          isDemo: false,
          epoch: s.epoch + 1,
        })),
      restore: (backup) =>
        set((s) => ({
          epoch: s.epoch + 1,
          transactions: sortTx(backup.transactions),
          budgets: backup.budgets,
          settings: backup.settings,
          range: defaultRange(backup.transactions),
          chat: [],
          readNotifications: [],
          isDemo: false,
        })),
    }),
    {
      name: 'finpilot-ai:v1',
      version: 1,
      // The viewed date range is deliberately not persisted: the app always opens on the current month.
      partialize: (s) => ({
        transactions: s.transactions,
        budgets: s.budgets,
        settings: s.settings,
        assumptions: s.assumptions,
        chat: s.chat,
        readNotifications: s.readNotifications,
        sidebarCollapsed: s.sidebarCollapsed,
        isDemo: s.isDemo,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const merged = { ...current, ...p };
        // An untouched demo is regenerated so it always ends on today's date.
        const transactions = merged.isDemo ? buildDemoTransactions(TODAY) : merged.transactions;
        return { ...merged, transactions, range: defaultRange(transactions) };
      },
    },
  ),
);

/** The single derived view of the data. Recomputed only when its inputs change. */
export function useSnapshot(): Snapshot {
  const transactions = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  const settings = useStore((s) => s.settings);
  const range = useStore((s) => s.range);
  const assumptions = useStore((s) => s.assumptions);
  return useMemo(() => {
    setCurrency(settings.currency);
    return buildSnapshot({ transactions, budgets, settings, range, assumptions, today: TODAY });
  }, [transactions, budgets, settings, range, assumptions]);
}

export const makeBackup = (): Backup => {
  const s = useStore.getState();
  return {
    app: 'finpilot-ai',
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: s.transactions,
    budgets: s.budgets,
    settings: s.settings,
  };
};
