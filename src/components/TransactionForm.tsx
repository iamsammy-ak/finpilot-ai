import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Category, PaymentMethod, Transaction, TransactionDraft, TxType } from '../types';
import { PAYMENT_METHODS } from '../types';
import { categoriesFor, categorize } from '../lib/categories';
import { isValidISO } from '../lib/dates';
import { currencySymbol } from '../lib/format';
import { TODAY, useStore } from '../store/useStore';
import { Modal, Segmented, toast } from './ui';

export function TransactionForm({ editing, onClose }: { editing?: Transaction; onClose: () => void }) {
  const transactions = useStore((s) => s.transactions);
  const add = useStore((s) => s.addTransaction);
  const update = useStore((s) => s.updateTransaction);

  const [type, setType] = useState<TxType>(editing?.type ?? 'expense');
  const [date, setDate] = useState(editing?.date ?? TODAY);
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [merchant, setMerchant] = useState(editing?.merchant ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [method, setMethod] = useState<PaymentMethod>(editing?.method ?? 'Card');
  // Once the user picks a category by hand, automatic categorisation stops overriding it.
  const [manual, setManual] = useState<Category | null>(editing?.category ?? null);
  const [touched, setTouched] = useState(false);

  const auto = useMemo(
    () => categorize(merchant, description, type, editing ? transactions.filter((t) => t.id !== editing.id) : transactions),
    [merchant, description, type, transactions, editing],
  );
  const options = categoriesFor(type);
  const category = manual && options.includes(manual) ? manual : auto.category;
  const isAuto = !(manual && options.includes(manual));

  const value = Number(amount.replace(',', '.'));
  const errors = {
    merchant: merchant.trim() ? '' : 'Enter who the payment was to or from.',
    amount: Number.isFinite(value) && value > 0 ? '' : 'Enter an amount greater than zero.',
    date: isValidISO(date) ? '' : 'Pick a valid date.',
  };
  const valid = !errors.merchant && !errors.amount && !errors.date;

  const save = () => {
    setTouched(true);
    if (!valid) return;
    const draft: TransactionDraft = {
      date,
      merchant: merchant.trim(),
      description: description.trim(),
      category,
      amount: Math.round(value * 100) / 100,
      type,
      method,
    };
    if (editing) {
      update(editing.id, draft);
      toast('Transaction updated', `${draft.merchant} · every chart and insight has been recalculated.`);
    } else {
      const tx = add(draft);
      toast('Transaction added', `${tx.id} · ${draft.merchant} filed under ${draft.category}.`);
    }
    onClose();
  };

  return (
    <Modal
      title={editing ? 'Edit transaction' : 'Add transaction'}
      sub={editing ? `Transaction ${editing.id}` : 'Balances, budgets, forecasts and insights update as soon as you save.'}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            {editing ? 'Save changes' : 'Add transaction'}
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="full">
          <Segmented
            label="Transaction type"
            value={type}
            onChange={(v) => {
              setType(v);
              if (v === 'income' && method === 'Card') setMethod('Bank transfer');
            }}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
          />
        </div>
        <label className="field full">
          <span>Merchant</span>
          <input
            className={`input ${touched && errors.merchant ? 'invalid' : ''}`}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder={type === 'income' ? 'Employer or payer' : 'REWE, Netflix, landlord…'}
            list="merchant-suggestions"
          />
          <datalist id="merchant-suggestions">
            {[...new Set(transactions.map((t) => t.merchant))].slice(0, 80).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {touched && errors.merchant && <span className="hint bad">{errors.merchant}</span>}
        </label>
        <label className="field">
          <span>Amount</span>
          <div className="input-prefix">
            <i>{currencySymbol()}</i>
            <input className={`input num ${touched && errors.amount ? 'invalid' : ''}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          {touched && errors.amount && <span className="hint bad">{errors.amount}</span>}
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" className={`input ${touched && errors.date ? 'invalid' : ''}`} value={date} onChange={(e) => setDate(e.target.value)} />
          {touched && errors.date && <span className="hint bad">{errors.date}</span>}
        </label>
        <label className="field full">
          <span>Description</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note or bank reference" />
        </label>
        <label className="field">
          <span>Category</span>
          <select className="select" value={category} onChange={(e) => setManual(e.target.value as Category)}>
            {options.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isAuto ? (
              <>
                <Sparkles size={12} className="soft" />
                {auto.source === 'history'
                  ? 'Chosen automatically — same as your earlier entries for this merchant.'
                  : auto.source === 'rule'
                    ? 'Chosen automatically from the merchant name.'
                    : 'No match found, filed under Other. Pick a category if you know it.'}
              </>
            ) : (
              <>
                Set by you.{' '}
                <button type="button" className="link" onClick={() => setManual(null)}>
                  Use automatic
                </button>
              </>
            )}
          </span>
        </label>
        <label className="field">
          <span>Payment method</span>
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="sr-only" tabIndex={-1}>
          Save
        </button>
      </form>
    </Modal>
  );
}
