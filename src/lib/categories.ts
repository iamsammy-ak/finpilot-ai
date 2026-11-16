import type { Category, Transaction, TxType } from '../types';
import { CATEGORIES } from '../types';

/**
 * Categorical chart colours. Eight hues, assigned to the eight everyday
 * spending categories in a fixed order (colour follows the category, never its
 * rank). Validated against the app's navy chart surface for colour-vision
 * deficiency separation and 3:1 contrast. Everything else folds into neutral.
 */
export const NEUTRAL_SERIES = '#6f7b9b';

export const CATEGORY_COLOR: Record<Category, string> = {
  Housing: '#3987e5',
  Groceries: '#199e70',
  Restaurants: '#d95926',
  Transportation: '#c98500',
  Shopping: '#d55181',
  Entertainment: '#9085e9',
  Utilities: '#0ca30c',
  Subscriptions: '#e66767',
  Education: NEUTRAL_SERIES,
  Healthcare: NEUTRAL_SERIES,
  Travel: NEUTRAL_SERIES,
  Other: NEUTRAL_SERIES,
  Salary: '#199e70',
  'Freelance Income': '#3987e5',
  Investments: '#c98500',
};

/** Series colours for money in / money out / a third reference series. */
export const SERIES = {
  income: '#199e70',
  expense: '#8b6cff',
  third: '#c98500',
  blue: '#3987e5',
  neutral: NEUTRAL_SERIES,
};

export const isCategory = (s: string): s is Category => (CATEGORIES as readonly string[]).includes(s);

export const categoriesFor = (type: TxType): Category[] =>
  type === 'income'
    ? ['Salary', 'Freelance Income', 'Investments', 'Other']
    : [
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
      ];

/** Keyword rules, checked in order. First match wins. */
const RULES: [Category, RegExp][] = [
  ['Salary', /\b(salary|payroll|wages?|gehalt|lohn|stipendio|salaire|n[oó]mina|paycheck)\b/i],
  ['Freelance Income', /\b(freelance|invoice|honorar|consulting fee|client payment|upwork|fiverr|malt)\b/i],
  ['Investments', /\b(dividend|interest|zinsen|trade republic|scalable|degiro|etoro|broker|etf|coupon|capital gain)\b/i],
  [
    'Subscriptions',
    /\b(netflix|spotify|disney|icloud|apple\.com\/bill|youtube premium|prime video|amazon prime|hbo|dazn|audible|adobe|notion|chatgpt|openai|claude|dropbox|google one|nintendo online|playstation plus|xbox game pass|duolingo|headspace|patreon|subscription|abo)\b/i,
  ],
  ['Housing', /\b(rent|miete|affitto|loyer|alquiler|landlord|hausverwaltung|mortgage|hypothek|property management|housing)\b/i],
  [
    'Utilities',
    /\b(vattenfall|e\.on|eon|enel|edf|iberdrola|electric|strom|gas bill|water|wasser|internet|broadband|vodafone|telekom|o2|orange|tim\b|iliad|fastweb|mobile plan|phone bill|utility|utilities|heating|rundfunk)\b/i,
  ],
  [
    'Groceries',
    /\b(rewe|lidl|aldi|edeka|penny|netto|kaufland|carrefour|esselunga|coop|conad|mercadona|tesco|sainsbury|albert heijn|jumbo|spar|monoprix|auchan|leclerc|intermarch[eé]|bio company|denn'?s|supermarket|supermarkt|grocer(y|ies)|market)\b/i,
  ],
  [
    'Restaurants',
    /\b(restaurant|ristorante|trattoria|osteria|pizzeria|pizza|bistro|brasserie|caf[eé]|coffee|espresso|starbucks|mcdonald|burger|kebab|d[oö]ner|sushi|ramen|bar\b|pub\b|lieferando|wolt|uber eats|deliveroo|just eat|glovo|bakery|b[aä]ckerei|brunch|diner|takeaway|canteen|mensa)\b/i,
  ],
  [
    'Travel',
    /\b(ryanair|easyjet|lufthansa|air france|klm|vueling|wizz|airbnb|booking\.com|hotel|hostel|flixbus|deutsche bahn|db fernverkehr|trenitalia|italo|sncf|eurostar|renfe|flight|airline|expedia)\b/i,
  ],
  [
    'Transportation',
    /\b(bvg|mvg|hvv|atm milano|ratp|tfl|metro|tram|bus ticket|deutschlandticket|public transport|uber|bolt|free ?now|taxi|nextbike|lime|tier|voi|scooter|shell|aral|esso|total ?energies|q8|eni|fuel|petrol|benzin|parking|parkhaus|toll|car ?sharing|share now|miles)\b/i,
  ],
  [
    'Healthcare',
    /\b(pharmac(y|ie)|apotheke|farmacia|doctor|arzt|dentist|zahnarzt|clinic|hospital|optician|physio|health|krankenkasse|medic)\b/i,
  ],
  [
    'Education',
    /\b(udemy|coursera|edx|skillshare|tuition|university|universit[aà]|hochschule|semesterbeitrag|course|bookshop|buchhandlung|thalia|textbook|language school|school)\b/i,
  ],
  [
    'Entertainment',
    /\b(cinema|kino|cinestar|uci|path[eé]|theat(er|re)|concert|eventim|ticketmaster|museum|steam|playstation|nintendo|xbox|epic games|bowling|club|festival|zoo|gig|escape room)\b/i,
  ],
  [
    'Shopping',
    /\b(amazon|zalando|h&m|zara|uniqlo|ikea|mediamarkt|saturn|decathlon|about you|asos|primark|dm\b|rossmann|m[uü]ller|douglas|sephora|apple store|ebay|etsy|vinted|shop|store|boutique)\b/i,
  ],
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Stable key for "the same merchant" across slightly different statement spellings. */
export const merchantKey = (merchant: string) =>
  norm(merchant)
    .replace(/[*#]\s*\w+$/g, '')
    .replace(/\b\d{3,}\b/g, '')
    .replace(/[^\p{L}\p{N}&+ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Pick a category for a transaction.
 * 1. If you have categorised this merchant before, reuse your choice.
 * 2. Otherwise match merchant + description against keyword rules.
 * 3. Fall back to Other.
 */
export function categorize(
  merchant: string,
  description: string,
  type: TxType,
  history: Transaction[] = [],
): { category: Category; source: 'history' | 'rule' | 'fallback' } {
  const key = merchantKey(merchant);
  if (key) {
    const counts = new Map<Category, number>();
    for (const t of history) {
      if (t.type === type && merchantKey(t.merchant) === key) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    if (counts.size) {
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { category: best, source: 'history' };
    }
  }
  const text = `${merchant} ${description}`;
  const allowed = categoriesFor(type);
  for (const [cat, re] of RULES) {
    if (allowed.includes(cat) && re.test(text)) return { category: cat, source: 'rule' };
  }
  return { category: 'Other', source: 'fallback' };
}

/** Coerce a free-text category from a CSV into one of ours, if it is recognisable. */
export function matchCategoryName(raw: string): Category | null {
  const s = norm(raw);
  if (!s) return null;
  const direct = CATEGORIES.find((c) => c.toLowerCase() === s);
  if (direct) return direct;
  const alias: [RegExp, Category][] = [
    [/rent|housing|mortgage|home/, 'Housing'],
    [/grocer|supermarket|food shop/, 'Groceries'],
    [/restaurant|dining|eating out|food|caf|bar/, 'Restaurants'],
    [/transport|transit|fuel|car|commut/, 'Transportation'],
    [/shop|retail|cloth/, 'Shopping'],
    [/entertain|leisure|fun|hobby/, 'Entertainment'],
    [/educat|study|course|book/, 'Education'],
    [/health|medic|pharma|doctor/, 'Healthcare'],
    [/utilit|bill|energy|phone|internet/, 'Utilities'],
    [/travel|holiday|vacation|flight|hotel/, 'Travel'],
    [/subscri|streaming|membership/, 'Subscriptions'],
    [/salary|wage|payroll|income/, 'Salary'],
    [/freelanc|side|gig/, 'Freelance Income'],
    [/invest|dividend|interest/, 'Investments'],
  ];
  for (const [re, cat] of alias) if (re.test(s)) return cat;
  return null;
}
