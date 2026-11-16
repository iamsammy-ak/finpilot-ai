import type { Budgets, Category, PaymentMethod, Settings, Transaction } from '../types';
import { addMonths, dateInMonth, monthKey } from '../lib/dates';

/**
 * Demo dataset: a salaried professional in Berlin earning €2,200 net a month.
 *
 * It is generated relative to "today" so the app always opens on a live,
 * in-progress month with three complete months of history behind it. Amounts
 * are hand-written (not random), so every reset produces the same figures.
 *
 * Each row: day(s) of month, merchant, description, category, payment method,
 * and one amount per month — index 0 is three months ago, index 3 is the
 * current month. `null` means "did not happen that month".
 */
type N = number | null;
type Row = [number | number[], string, string | string[], Category, PaymentMethod, [N, N, N, N]];

const ROWS: Row[] = [
  // Income
  [1, 'Nordwind Software GmbH', 'Monthly salary', 'Salary', 'Bank transfer', [2200, 2200, 2200, 2200]],
  [18, 'Studio Kollektiv', 'Freelance — landing page design', 'Freelance Income', 'Bank transfer', [null, 180, null, null]],

  // Housing & fixed bills
  [2, 'Hausverwaltung Berger', 'Rent — flat share, Prenzlauer Berg', 'Housing', 'Bank transfer', [650, 650, 650, 650]],
  [5, 'Vattenfall', 'Electricity', 'Utilities', 'Direct debit', [48, 48, 48, 48]],
  [8, 'Vodafone', 'Home internet', 'Utilities', 'Direct debit', [29.99, 29.99, 29.99, 29.99]],
  [12, 'Aldi Talk', 'Mobile plan', 'Utilities', 'Direct debit', [12.99, 12.99, 12.99, 12.99]],
  [1, 'BVG', 'Monthly transit pass', 'Transportation', 'Direct debit', [49, 49, 49, 49]],

  // Subscriptions
  [3, 'Netflix', 'Standard plan', 'Subscriptions', 'Card', [13.99, 13.99, 13.99, 13.99]],
  [9, 'Spotify', 'Premium', 'Subscriptions', 'Card', [11.99, 11.99, 11.99, 11.99]],
  [15, 'Apple iCloud+', '50 GB storage', 'Subscriptions', 'Card', [2.99, 2.99, 2.99, 2.99]],
  [21, 'Disney+', 'Monthly plan', 'Subscriptions', 'Card', [5.99, 5.99, 5.99, 5.99]],

  // Groceries
  [3, 'REWE', 'Weekly shop', 'Groceries', 'Card', [42.35, 38.9, 44.15, 41.2]],
  [7, 'Lidl', 'Groceries', 'Groceries', 'Card', [31.8, 35.25, 29.95, 33.4]],
  [[11, 12, 10, 11], 'Edeka', 'Groceries', 'Groceries', 'Digital wallet', [27.45, 30.1, 33.6, 28.75]],
  [16, 'REWE', 'Weekly shop', 'Groceries', 'Card', [45.9, 41.75, 47.3, 39.85]],
  [[20, 22, 19, 20], 'Bio Company', 'Organic groceries', 'Groceries', 'Card', [22.6, 26.4, 24.9, 23.8]],
  [24, 'Lidl', 'Groceries', 'Groceries', 'Card', [34.15, 29.8, 36.45, 31.9]],
  [28, 'REWE', 'Top-up shop', 'Groceries', 'Digital wallet', [18.7, 21.35, 16.9, 19.4]],

  // Restaurants
  [[4, 5, 3, 6], 'Café Fleury', 'Brunch', 'Restaurants', 'Card', [18.5, 16.8, 21.4, 19.2]],
  [[6, 9, 8, 7], 'Lieferando', 'Dinner delivery', 'Restaurants', 'Digital wallet', [24.9, 27.4, 31.8, 26.5]],
  [[10, 12, 10, 11], 'Umami', 'Dinner with friends', 'Restaurants', 'Card', [36, 32.5, 44.5, 38]],
  [[13, 15, 14, 14], 'The Barn Coffee', 'Coffee & pastry', 'Restaurants', 'Digital wallet', [8.4, 9.2, 12.6, 7.8]],
  [[17, 19, 17, 18], 'Zola Pizza', 'Pizza night', 'Restaurants', 'Card', [22, 24.5, 28, 23.5]],
  [[22, 23, 21, 22], 'Lieferando', 'Dinner delivery', 'Restaurants', 'Digital wallet', [19.8, 23.9, 29.9, 21.6]],
  [[25, 19, 24, 26], "Mustafa's Gemüse Kebap", 'Lunch', 'Restaurants', 'Cash', [7.5, 9.5, 8.5, 8]],
  [[27, 28, 27, 28], 'Bar Tausend', 'Drinks', 'Restaurants', 'Card', [34, 38.5, 46, 32]],

  // Transportation
  [[14, 20, 13, 9], 'Nextbike', 'Bike share rides', 'Transportation', 'Digital wallet', [6, 5, 7.5, 4]],

  // Shopping
  [
    [9, 14, 6, 9],
    'Zalando',
    ['Clothing order', 'Clothing order', 'Winter jacket', 'Clothing order'],
    'Shopping',
    'Card',
    [64.9, 49.95, 189, 54.9],
  ],
  [[19, 21, 18, 23], 'Amazon', 'Household items', 'Shopping', 'Card', [32.49, 41.2, 27.99, 36.4]],
  [[26, 8, 25, 5], 'dm-drogerie markt', 'Drugstore', 'Shopping', 'Card', [21.35, 24.8, 19.6, 22.45]],

  // Entertainment
  [[8, 10, 7, 8], 'UCI Kino', 'Cinema tickets', 'Entertainment', 'Card', [24, 13.5, 26, 12.5]],
  [[16, 20, 15, 13], 'Eventim', 'Concert ticket', 'Entertainment', 'Card', [42, 38.5, 45, 39]],
  [[23, 27, 22, 26], 'Steam', 'Game purchase', 'Entertainment', 'Digital wallet', [19.99, 29.99, 14.99, 9.99]],

  // Everything else
  [[12, 6, 11, 27], 'Kiez Cut', 'Haircut', 'Other', 'Card', [32, null, 32, 32]],
  [[15, 11, 13, 12], 'Sparkasse ATM', 'Cash withdrawal', 'Other', 'Cash', [40, 60, 50, 40]],
  [[21, 2, 9, 4], 'Apotheke am Kollwitzplatz', 'Pharmacy', 'Healthcare', 'Card', [14.8, null, 22.4, 9.9]],
  [13, 'Udemy', 'Online course — SQL for analysts', 'Education', 'Card', [null, 14.99, null, null]],
  [25, 'Deutsche Bahn', 'Train to Hamburg', 'Travel', 'Card', [null, 47.9, null, null]],
  [26, 'Blumen Schmidt', 'Flowers — birthday gift', 'Other', 'Cash', [null, null, 24, null]],
];

const INCOME: Category[] = ['Salary', 'Freelance Income', 'Investments'];

export function buildDemoTransactions(today: string): Transaction[] {
  const current = monthKey(today);
  const months = [-3, -2, -1, 0].map((n) => addMonths(current, n));
  const out: Transaction[] = [];
  months.forEach((mk, i) => {
    for (const [day, merchant, description, category, method, amounts] of ROWS) {
      const amount = amounts[i];
      if (amount == null) continue;
      const date = dateInMonth(mk, Array.isArray(day) ? day[i] : day);
      if (date > today) continue; // the current month only runs up to today
      out.push({
        id: '',
        date,
        merchant,
        description: Array.isArray(description) ? description[i] : description,
        category,
        amount,
        type: INCOME.includes(category) ? 'income' : 'expense',
        method,
      });
    }
  });
  out.sort((a, b) => a.date.localeCompare(b.date));
  out.forEach((t, i) => (t.id = `TX-${String(1001 + i)}`));
  return out;
}

export const DEMO_BUDGETS: Budgets = {
  Housing: 650,
  Groceries: 240,
  Restaurants: 180,
  Transportation: 60,
  Utilities: 95,
  Shopping: 120,
  Entertainment: 90,
  Subscriptions: 35,
  Healthcare: 20,
  Education: 20,
  Travel: 50,
  Other: 60,
};

export const DEMO_SETTINGS: Settings = {
  name: 'Lena Fischer',
  email: 'lena.fischer@example.com',
  currency: 'EUR',
  openingBalance: 3250,
  monthlyBudget: 1650,
  savingsRateTarget: 0.25,
};
