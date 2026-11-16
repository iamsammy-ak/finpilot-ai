export type TxType = 'income' | 'expense';

export const EXPENSE_CATEGORIES = [
  'Housing',
  'Groceries',
  'Restaurants',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Education',
  'Healthcare',
  'Utilities',
  'Travel',
  'Subscriptions',
  'Other',
] as const;

export const INCOME_CATEGORIES = ['Salary', 'Freelance Income', 'Investments', 'Other'] as const;

export const CATEGORIES = [
  'Housing',
  'Groceries',
  'Restaurants',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Education',
  'Healthcare',
  'Utilities',
  'Travel',
  'Subscriptions',
  'Salary',
  'Freelance Income',
  'Investments',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = ['Card', 'Bank transfer', 'Direct debit', 'Cash', 'Digital wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Transaction {
  id: string;
  /** ISO calendar date, YYYY-MM-DD (no time zone — a bank booking date). */
  date: string;
  merchant: string;
  description: string;
  category: Category;
  /** Always positive; direction is carried by `type`. */
  amount: number;
  type: TxType;
  method: PaymentMethod;
}

export type TransactionDraft = Omit<Transaction, 'id'>;

export type Budgets = Partial<Record<Category, number>>;

export interface Settings {
  name: string;
  email: string;
  currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
  /** Account balance before the first recorded transaction. */
  openingBalance: number;
  /** Overall monthly spending limit. */
  monthlyBudget: number;
  /** Target savings rate, 0–1. */
  savingsRateTarget: number;
}

export interface ForecastAssumptions {
  /** null = use the model's estimate. */
  income: number | null;
  expenses: number | null;
  savingsTarget: number;
  unexpected: number;
}

export type RangePreset = 'month' | 'last3' | 'last6' | 'ytd' | 'all' | 'custom';

export interface RangeSelection {
  preset: RangePreset;
  /** For preset 'month': YYYY-MM. */
  month?: string;
  from?: string;
  to?: string;
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export type PageId =
  | 'overview'
  | 'transactions'
  | 'analytics'
  | 'cashflow'
  | 'forecast'
  | 'budgets'
  | 'advisor'
  | 'reports'
  | 'settings';
