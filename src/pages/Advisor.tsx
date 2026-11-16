import { useEffect, useRef, useState } from 'react';
import { Cpu, Eye, Hash, Lightbulb, ListChecks, Lock, Send, Sparkles, Trash2, TriangleAlert, TrendingUp } from 'lucide-react';
import { Card, PageHead, useUi } from '../components/ui';
import { monthLabel } from '../lib/dates';
import { money, plural } from '../lib/format';
import { answerQuestion, SUGGESTED_QUESTIONS, type Answer } from '../engine/advisor';
import type { Snapshot } from '../engine/snapshot';
import { useStore } from '../store/useStore';

function AnswerCard({ a, onAsk }: { a: Answer; onAsk: (q: string) => void }) {
  return (
    <div className="answer">
      <div className="answer-basis">Based on: {a.basis}</div>
      <div className="answer-headline">{a.headline}</div>
      <div className="answer-grid">
        <div className="stack" style={{ gap: 14 }}>
          {a.observations.length > 0 && (
            <div className="answer-block">
              <h4>
                <Eye /> Observations
              </h4>
              <ul>
                {a.observations.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {a.patterns.length > 0 && (
            <div className="answer-block">
              <h4>
                <TrendingUp /> Patterns
              </h4>
              <ul>
                {a.patterns.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {a.problems.length > 0 && (
            <div className="answer-block">
              <h4>
                <TriangleAlert /> Potential problems
              </h4>
              <ul>
                {a.problems.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 14 }}>
          {a.numbers.length > 0 && (
            <div className="answer-block">
              <h4>
                <Hash /> Supporting numbers
              </h4>
              {a.numbers.map((n, i) => (
                <div className="num-row" key={i}>
                  <span>{n.label}</span>
                  <b className={`num ${n.tone ?? ''}`}>{n.value}</b>
                </div>
              ))}
            </div>
          )}
          {a.actions.length > 0 && (
            <div className="answer-block act">
              <h4>
                <ListChecks /> Recommended actions
              </h4>
              <ul>
                {a.actions.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {a.followUps.length > 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          {a.followUps.map((q) => (
            <button key={q} className="chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Advisor({ s }: { s: Snapshot }) {
  const chat = useStore((x) => x.chat);
  const pushChat = useStore((x) => x.pushChat);
  const clearChat = useStore((x) => x.clearChat);
  const takeQuestion = useUi((x) => x.takeQuestion);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const snap = useRef(s);
  snap.current = s;
  const timer = useRef<number | undefined>(undefined);

  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q || thinking) return;
    pushChat({ role: 'user', text: q });
    setText('');
    setThinking(true);
    // The analysis itself is instant; the short pause only keeps the conversation readable.
    timer.current = window.setTimeout(() => {
      pushChat({ role: 'assistant', answer: answerQuestion(q, snap.current) });
      setThinking(false);
    }, 420);
  };

  useEffect(() => {
    // A question handed over from global search is asked as soon as the page opens.
    const q = takeQuestion();
    if (q) ask(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length, thinking]);

  return (
    <div className="page">
      <PageHead title="AI financial advisor" sub="Ask about your money in plain language. Every answer is calculated from your transactions, budgets and history.">
        <span className="pill violet">
          <Cpu /> Runs on this device
        </span>
        {chat.length > 0 && (
          <button className="btn" onClick={clearChat}>
            <Trash2 /> Clear conversation
          </button>
        )}
      </PageHead>

      <div className="advisor">
        <section className="card chat">
          <div className="chat-scroll" ref={scroller}>
            {chat.length === 0 && (
              <div className="msg-ai">
                <span className="ai-mark">
                  <Sparkles />
                </span>
                <div className="answer">
                  <div className="answer-headline">
                    I have read {plural(s.txs.length, 'transaction')} and I am looking at {s.range.label}. What would you like to know?
                  </div>
                  <p className="soft" style={{ marginBottom: 14, maxWidth: '62ch' }}>
                    I answer with observations, the numbers behind them, patterns, potential problems and what to do next. Pick a question or type your own.
                  </p>
                  <div className="chips">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button key={q} className="chip" onClick={() => ask(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chat.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="msg-user">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="msg-ai">
                  <span className="ai-mark">
                    <Sparkles />
                  </span>
                  {m.answer && <AnswerCard a={m.answer} onAsk={ask} />}
                </div>
              ),
            )}
            {thinking && (
              <div className="msg-ai" aria-live="polite">
                <span className="ai-mark">
                  <Sparkles />
                </span>
                <span className="typing" aria-label="Calculating">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
          {chat.length > 0 && (
            <div className="chips" style={{ padding: '10px 18px 0', flexWrap: 'nowrap', overflowX: 'auto' }}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <button key={q} className="chip" style={{ flex: 'none' }} onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
          >
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about spending, savings, budgets, subscriptions, cash flow…" aria-label="Your question" />
            <button className="btn primary" type="submit" disabled={!text.trim() || thinking}>
              <Send /> Ask
            </button>
          </form>
        </section>

        <div className="stack">
          <Card title="What I am looking at" sub="Updates when your data or the date range changes">
            <div className="num-row">
              <span>Period</span>
              <b>{s.range.label}</b>
            </div>
            <div className="num-row">
              <span>Transactions</span>
              <b className="num">
                {s.rangeTx.length} of {s.txs.length}
              </b>
            </div>
            <div className="num-row">
              <span>Balance</span>
              <b className="num">{money(s.balanceNow)}</b>
            </div>
            <div className="num-row">
              <span>Spending</span>
              <b className="num">{money(s.totals.expenses)}</b>
            </div>
            <div className="num-row">
              <span>Health score · {monthLabel(s.health.month).split(' ')[0]}</span>
              <b className="num">{s.health.score} / 100</b>
            </div>
          </Card>
          <Card title="How answers are made">
            <div className="stack" style={{ gap: 12, fontSize: 13 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Cpu size={16} className="soft" style={{ flex: 'none', marginTop: 2 }} />
                <span className="soft">
                  This analyst is a rule-based engine, not a language model. It matches your question to an analysis and fills every sentence with figures calculated from your data.
                </span>
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Lock size={16} className="soft" style={{ flex: 'none', marginTop: 2 }} />
                <span className="soft">No question or transaction leaves your browser. No external AI service is called.</span>
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Lightbulb size={16} className="soft" style={{ flex: 'none', marginTop: 2 }} />
                <span className="soft">It understands categories, merchants, periods, savings, subscriptions, budgets, cash flow, forecasts and your health score. If it cannot match a question it says so.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
