import { storage } from "./storage.js";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell
} from "recharts";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Wallet, Target,
  TrendingUp, Settings, PiggyBank, Banknote
} from "lucide-react";

const INK = "#F7F5EF";
const SURFACE = "#FFFFFF";
const SURFACE_2 = "#F0EEE6";
const BORDER = "rgba(20,20,15,0.12)";
const GOLD = "#A87A1F";
const TEAL = "#2E8E7B";
const RUST = "#BD4A38";
const TEXT = "#1D1B17";
const TEXT_DIM = "#5C594F";
const TEXT_FAINT = "#8A8776";

const STORAGE_KEY = "finance-tracker-data-v1";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (isoDate) => isoDate.slice(0, 7);
const currentMonthKey = () => monthKeyOf(todayISO());

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthsBetween(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function fmt(n, opts = {}) {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(v);
}

function defaultData() {
  return {
    income: { base: 3000, bonuses: [] },
    fixedObligations: [
      { id: uid(), name: "Rent or mortgage", amount: 0 },
      { id: uid(), name: "Utilities", amount: 0 },
      { id: uid(), name: "Subscriptions", amount: 0 },
    ],
    categories: [
      { id: uid(), name: "Groceries", budget: 0 },
      { id: uid(), name: "Transport", budget: 0 },
      { id: uid(), name: "Dining out", budget: 0 },
      { id: uid(), name: "Entertainment", budget: 0 },
    ],
    expenses: [],
    targets: { netWorthTargets: [], manualMonthlySavings: 0 },
    netWorthHistory: [],
    bonusResults: [],
  };
}

function migrateTargets(targets) {
  if (targets && Array.isArray(targets.netWorthTargets)) return targets;
  // Migrate from the old single-target shape.
  const netWorthTargets = [];
  if (targets && Number(targets.netWorthTarget) > 0) {
    netWorthTargets.push({
      id: uid(),
      name: "Net worth target",
      amount: Number(targets.netWorthTarget),
      date: targets.netWorthTargetDate || "",
      isPrimary: true,
    });
  }
  return {
    netWorthTargets,
    manualMonthlySavings: Number((targets && targets.monthlySavings) || 0),
  };
}

function monthsRemainingTo(dateStr) {
  if (!dateStr) return null;
  const targetMonth = monthKeyOf(dateStr);
  const months = monthsBetween(currentMonthKey(), targetMonth);
  return months;
}

function computeTargetRequirement(target, currentNetWorth) {
  const amount = Number(target.amount || 0);
  const months = monthsRemainingTo(target.date);
  const overdue = months !== null && months < 0;
  const monthsLeft = months === null ? null : Math.max(1, months + 1);
  const gap = amount - currentNetWorth;
  const requiredMonthly = monthsLeft ? gap / monthsLeft : null;
  const progressPct = amount > 0 ? (currentNetWorth / amount) * 100 : 0;
  return { ...target, months, monthsLeft, overdue, gap, requiredMonthly, progressPct };
}

const BONUS_FULL = 900;
const BONUS_OVERAGE_RATE = 0.10;

function computeMonthBonus(target, actual) {
  const t = Number(target || 0);
  const a = Number(actual || 0);
  if (t <= 0) return { pct: 0, tierAmount: 0, overage: 0, total: 0 };
  const pct = (a / t) * 100;
  let tierAmount = 0;
  if (pct >= 100) tierAmount = BONUS_FULL;
  else if (pct >= 95) tierAmount = BONUS_FULL * 0.5;
  else if (pct >= 90) tierAmount = BONUS_FULL * 0.25;
  const overage = pct >= 100 ? (a - t) * BONUS_OVERAGE_RATE : 0;
  return { pct, tierAmount, overage, total: tierAmount + overage };
}

function quarterOfMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}
function monthsInQuarter(quarterKey) {
  const [y, q] = quarterKey.split("-Q").map(Number);
  const startMonth = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(startMonth + i).padStart(2, "0")}`);
}
function quarterLabel(quarterKey) {
  const [y, q] = quarterKey.split("-Q");
  return `Q${q} ${y}`;
}

function LedgerRule({ style }) {
  return (
    <svg width="100%" height="10" style={{ display: "block", ...style }} preserveAspectRatio="none">
      <line x1="0" y1="5" x2="100%" y2="5" stroke={BORDER} strokeWidth="1" />
      {Array.from({ length: 24 }).map((_, i) => (
        <line key={i} x1={`${(i / 23) * 100}%`} y1="2" x2={`${(i / 23) * 100}%`} y2="8" stroke={BORDER} strokeWidth="1" />
      ))}
    </svg>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );
}

function MetricCard({ label, value, sub, tone }) {
  const color = tone === "danger" ? RUST : tone === "good" ? TEAL : TEXT;
  return (
    <Card style={{ flex: "1 1 150px", minWidth: 150 }}>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: TEXT_FAINT, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TEXT_DIM, flex: "1 1 120px" }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  background: SURFACE_2,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: "7px 9px",
  color: TEXT,
  fontSize: 14,
  fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
};

const buttonStyle = {
  background: SURFACE_2,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: "7px 12px",
  color: TEXT,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const iconBtnStyle = {
  background: "transparent",
  border: "none",
  color: TEXT_FAINT,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  padding: 4,
};

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? SURFACE_2 : "transparent",
        border: `1px solid ${active ? BORDER : "transparent"}`,
        borderRadius: 7,
        padding: "8px 13px",
        color: active ? GOLD : TEXT_DIM,
        fontSize: 13,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

function RunwayBar({ pct, over }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = over ? RUST : pct > 85 ? GOLD : TEAL;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: "relative", height: 22, background: SURFACE_2, borderRadius: 5, overflow: "hidden", border: `1px solid ${BORDER}` }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${clamped}%`, background: color, transition: "width 0.3s" }} />
        {[25, 50, 75].map((t) => (
          <div key={t} style={{ position: "absolute", left: `${t}%`, top: 0, bottom: 0, width: 1, background: "rgba(0,0,0,0.25)" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TEXT_FAINT, marginTop: 4 }}>
        <span>0%</span><span>50%</span><span>{over ? "over budget" : "100%"}</span>
      </div>
    </div>
  );
}

export default function FinanceTracker() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("overview");
  const [viewMonth, setViewMonth] = useState(currentMonthKey());
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          parsed.targets = migrateTargets(parsed.targets);
          setData(parsed);
        } else {
          setData(defaultData());
        }
      } catch (e) {
        setData(defaultData());
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      storage.set(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  const update = (fn) => setData((prev) => {
    const next = structuredClone(prev);
    fn(next);
    return next;
  });

  const derived = useMemo(() => {
    if (!data) return null;
    const fixedTotal = data.fixedObligations.reduce((s, f) => s + Number(f.amount || 0), 0);
    const budgetTotal = data.categories.reduce((s, c) => s + Number(c.budget || 0), 0);

    const incomeForMonth = (mk) => {
      const bonus = data.income.bonuses.filter((b) => b.month === mk).reduce((s, b) => s + Number(b.amount || 0), 0);
      return Number(data.income.base || 0) + bonus;
    };
    const spentForMonth = (mk) => data.expenses.filter((e) => monthKeyOf(e.date) === mk).reduce((s, e) => s + Number(e.amount || 0), 0);
    const categorySpent = (catId, mk) => data.expenses.filter((e) => e.categoryId === catId && monthKeyOf(e.date) === mk).reduce((s, e) => s + Number(e.amount || 0), 0);

    const income = incomeForMonth(viewMonth);
    const spent = spentForMonth(viewMonth);

    const categoryRows = data.categories.map((c) => ({
      name: c.name,
      budget: Number(c.budget || 0),
      spent: categorySpent(c.id, viewMonth),
    }));

    const sortedHistory = [...data.netWorthHistory].sort((a, b) => a.date.localeCompare(b.date));
    const netWorthPoints = sortedHistory.map((h) => ({
      date: h.date,
      actual: Number(h.assets || 0) - Number(h.liabilities || 0),
    }));
    const rawNetWorth = netWorthPoints.length ? netWorthPoints[netWorthPoints.length - 1].actual : 0;
    const latestSnapshotMonth = sortedHistory.length ? monthKeyOf(sortedHistory[sortedHistory.length - 1].date) : null;

    const quartersSeen = Array.from(new Set(data.bonusResults.map((r) => quarterOfMonth(r.month))));
    let unclaimedBonus = 0;
    const completedQuarters = [];
    quartersSeen.forEach((q) => {
      const qMonths = monthsInQuarter(q);
      const complete = qMonths.every((mk) => {
        const entry = data.bonusResults.find((r) => r.month === mk);
        return entry && Number(entry.target) > 0;
      });
      if (!complete) return;
      const total = qMonths.reduce((s, mk) => {
        const entry = data.bonusResults.find((r) => r.month === mk);
        return s + computeMonthBonus(entry.target, entry.actual).total;
      }, 0);
      const endMonth = qMonths[qMonths.length - 1];
      const alreadyReflected = latestSnapshotMonth && monthsBetween(endMonth, latestSnapshotMonth) > 0;
      completedQuarters.push({ quarter: q, total, endMonth, alreadyReflected });
      if (!alreadyReflected) unclaimedBonus += total;
    });
    const latestNetWorth = rawNetWorth + unclaimedBonus;

    const targetsComputed = data.targets.netWorthTargets.map((t) => computeTargetRequirement(t, latestNetWorth));
    const primaryTarget = targetsComputed.find((t) => t.isPrimary) || targetsComputed[0] || null;
    const savingsGoal = primaryTarget && primaryTarget.requiredMonthly !== null && !primaryTarget.overdue
      ? Math.max(0, primaryTarget.requiredMonthly)
      : Number(data.targets.manualMonthlySavings || 0);
    const available = income - fixedTotal - savingsGoal;
    const remaining = available - spent;

    let avgMonthlyGrowth = 0;
    if (netWorthPoints.length >= 2) {
      const first = sortedHistory[0];
      const months = Math.max(1, monthsBetween(monthKeyOf(first.date), monthKeyOf(sortedHistory[sortedHistory.length - 1].date)));
      avgMonthlyGrowth = (rawNetWorth - (Number(first.assets) - Number(first.liabilities))) / months;
    } else {
      avgMonthlyGrowth = savingsGoal;
    }

    const currentQuarter = quarterOfMonth(currentMonthKey());
    const currentQuarterMonths = monthsInQuarter(currentQuarter);
    const accruedThisQuarter = currentQuarterMonths.reduce((sum, mk) => {
      const entry = data.bonusResults.find((r) => r.month === mk);
      if (!entry) return sum;
      return sum + computeMonthBonus(entry.target, entry.actual).total;
    }, 0);
    const monthsEnteredThisQuarter = currentQuarterMonths.filter((mk) => data.bonusResults.some((r) => r.month === mk)).length;

    return {
      fixedTotal, budgetTotal, income, savingsGoal, available, spent, remaining,
      categoryRows, netWorthPoints, latestNetWorth, rawNetWorth, unclaimedBonus, avgMonthlyGrowth,
      currentQuarter, accruedThisQuarter, monthsEnteredThisQuarter,
      targetsComputed, primaryTarget,
    };
  }, [data, viewMonth]);

  if (!loaded || !data || !derived) {
    return <div style={{ padding: 40, color: TEXT_DIM, fontSize: 14 }}>Loading your finances…</div>;
  }

  const overBudget = derived.remaining < 0;
  const runwayPct = derived.available > 0 ? (derived.spent / derived.available) * 100 : (derived.spent > 0 ? 100 : 0);

  return (
    <div style={{ background: INK, color: TEXT, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", borderRadius: 12, padding: 20, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, color: TEXT }}>Ledger</div>
        <div style={{ fontSize: 12, color: TEXT_FAINT }}>your money, in one place</div>
      </div>
      <LedgerRule style={{ marginBottom: 14 }} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={Wallet}>Overview</TabButton>
        <TabButton active={tab === "budget"} onClick={() => setTab("budget")} icon={Banknote}>Budget & spending</TabButton>
        <TabButton active={tab === "bonus"} onClick={() => setTab("bonus")} icon={Target}>Quarterly bonus</TabButton>
        <TabButton active={tab === "networth"} onClick={() => setTab("networth")} icon={PiggyBank}>Net worth & targets</TabButton>
        <TabButton active={tab === "forecast"} onClick={() => setTab("forecast")} icon={TrendingUp}>Forecast</TabButton>
        <TabButton active={tab === "setup"} onClick={() => setTab("setup")} icon={Settings}>Setup</TabButton>
      </div>

      {tab === "overview" && (
        <Overview
          data={data} update={update} derived={derived} viewMonth={viewMonth} setViewMonth={setViewMonth}
          overBudget={overBudget} runwayPct={runwayPct}
        />
      )}
      {tab === "budget" && (
        <BudgetTab data={data} update={update} derived={derived} viewMonth={viewMonth} setViewMonth={setViewMonth} />
      )}
      {tab === "bonus" && (
        <BonusTab data={data} update={update} derived={derived} />
      )}
      {tab === "networth" && (
        <NetWorthTab data={data} update={update} derived={derived} />
      )}
      {tab === "forecast" && (
        <ForecastTab data={data} derived={derived} />
      )}
      {tab === "setup" && (
        <SetupTab data={data} update={update} viewMonth={viewMonth} />
      )}
    </div>
  );
}

function MonthNav({ viewMonth, setViewMonth }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <button style={iconBtnStyle} onClick={() => setViewMonth((m) => shiftMonth(m, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
      <div style={{ fontSize: 14, minWidth: 100, textAlign: "center" }}>{monthLabel(viewMonth)}</div>
      <button style={iconBtnStyle} onClick={() => setViewMonth((m) => shiftMonth(m, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
    </div>
  );
}

function Overview({ data, update, derived, viewMonth, setViewMonth, overBudget, runwayPct }) {
  const [expForm, setExpForm] = useState({ categoryId: data.categories[0]?.id || "", amount: "", date: todayISO(), note: "" });

  const addExpense = () => {
    if (!expForm.amount || !expForm.categoryId) return;
    update((d) => {
      d.expenses.push({ id: uid(), categoryId: expForm.categoryId, amount: Number(expForm.amount), date: expForm.date, note: expForm.note });
    });
    setExpForm((f) => ({ ...f, amount: "", note: "" }));
  };

  return (
    <div>
      <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard label="Income this month" value={fmt(derived.income)} />
        <MetricCard label="Fixed obligations" value={fmt(derived.fixedTotal)} />
        <MetricCard
          label="Savings goal"
          value={fmt(derived.savingsGoal)}
          sub={derived.primaryTarget ? `for "${derived.primaryTarget.name}"` : "no target set — using manual goal"}
        />
        <MetricCard label="Available to spend" value={fmt(derived.available)} tone={derived.available < 0 ? "danger" : "good"} />
        <MetricCard
          label={`Bonus accrued (${quarterLabel(derived.currentQuarter)})`}
          value={fmt(derived.accruedThisQuarter)}
          sub={`${derived.monthsEnteredThisQuarter} of 3 months entered`}
        />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 13, color: TEXT_DIM }}>Spent so far this month</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 22 }}>{fmt(derived.spent)}</div>
        </div>
        <RunwayBar pct={runwayPct} over={overBudget} />
        <div style={{ marginTop: 10, fontSize: 13, color: overBudget ? RUST : TEAL }}>
          {overBudget
            ? `${fmt(Math.abs(derived.remaining))} over what you can afford this month`
            : `${fmt(derived.remaining)} left to spend freely this month`}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Budget vs spent by category</div>
        <div style={{ height: Math.max(160, derived.categoryRows.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={derived.categoryRows} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid horizontal={false} stroke={BORDER} />
              <XAxis type="number" tick={{ fill: TEXT_FAINT, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: TEXT_DIM, fontSize: 12 }} axisLine={{ stroke: BORDER }} tickLine={false} width={90} />
              <Tooltip
                contentStyle={{ background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: TEXT }}
                formatter={(v) => fmt(v)}
              />
              <Bar dataKey="budget" fill={GOLD} radius={[0, 4, 4, 0]} name="Budget" barSize={12} />
              <Bar dataKey="spent" name="Spent" radius={[0, 4, 4, 0]} barSize={12}>
                {derived.categoryRows.map((row, i) => (
                  <Cell key={i} fill={row.spent > row.budget && row.budget > 0 ? RUST : TEAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, background: GOLD, borderRadius: 2 }} />Budget</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, background: TEAL, borderRadius: 2 }} />Spent (within budget)</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, background: RUST, borderRadius: 2 }} />Spent (over budget)</span>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Log an expense</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Category">
            <select style={inputStyle} value={expForm.categoryId} onChange={(e) => setExpForm({ ...expForm, categoryId: e.target.value })}>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Amount">
            <input style={inputStyle} type="number" placeholder="0" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
          </Field>
          <Field label="Date">
            <input style={inputStyle} type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} />
          </Field>
          <Field label="Note (optional)">
            <input style={inputStyle} type="text" placeholder="e.g. weekly shop" value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} />
          </Field>
          <button style={{ ...buttonStyle, color: GOLD, borderColor: GOLD }} onClick={addExpense}><Plus size={14} />Add expense</button>
        </div>
      </Card>
    </div>
  );
}

function BudgetTab({ data, update, derived, viewMonth, setViewMonth }) {
  const setCategoryBudget = (id, val) => update((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (c) c.budget = val === "" ? "" : Number(val);
  });
  const removeCategory = (id) => update((d) => { d.categories = d.categories.filter((c) => c.id !== id); });
  const addCategory = () => update((d) => { d.categories.push({ id: uid(), name: "New category", budget: 0 }); });
  const renameCategory = (id, name) => update((d) => { const c = d.categories.find((x) => x.id === id); if (c) c.name = name; });

  const setFixed = (id, field, val) => update((d) => {
    const f = d.fixedObligations.find((x) => x.id === id);
    if (f) f[field] = field === "amount" ? (val === "" ? "" : Number(val)) : val;
  });
  const removeFixed = (id) => update((d) => { d.fixedObligations = d.fixedObligations.filter((f) => f.id !== id); });
  const addFixed = () => update((d) => { d.fixedObligations.push({ id: uid(), name: "New obligation", amount: 0 }); });

  const monthExpenses = data.expenses
    .filter((e) => monthKeyOf(e.date) === viewMonth)
    .sort((a, b) => b.date.localeCompare(a.date));
  const removeExpense = (id) => update((d) => { d.expenses = d.expenses.filter((e) => e.id !== id); });
  const categoryName = (id) => data.categories.find((c) => c.id === id)?.name || "Uncategorised";

  return (
    <div>
      <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: TEXT_DIM }}>Variable categories</div>
          <button style={buttonStyle} onClick={addCategory}><Plus size={14} />Add category</button>
        </div>
        {data.categories.map((c) => {
          const row = derived.categoryRows.find((r) => r.name === c.name);
          const spent = row ? row.spent : 0;
          return (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
              <input style={{ ...inputStyle, fontFamily: "inherit", flex: "1 1 140px" }} value={c.name} onChange={(e) => renameCategory(c.id, e.target.value)} />
              <input style={{ ...inputStyle, width: 90 }} type="number" value={c.budget} onChange={(e) => setCategoryBudget(c.id, e.target.value)} placeholder="Budget" />
              <div style={{ fontSize: 12, color: spent > Number(c.budget || 0) ? RUST : TEXT_DIM, minWidth: 90, textAlign: "right" }}>{fmt(spent)} spent</div>
              <button style={iconBtnStyle} onClick={() => removeCategory(c.id)} aria-label="Remove category"><Trash2 size={15} /></button>
            </div>
          );
        })}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: TEXT_DIM }}>Fixed obligations</div>
          <button style={buttonStyle} onClick={addFixed}><Plus size={14} />Add obligation</button>
        </div>
        {data.fixedObligations.map((f) => (
          <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
            <input style={{ ...inputStyle, fontFamily: "inherit", flex: "1 1 140px" }} value={f.name} onChange={(e) => setFixed(f.id, "name", e.target.value)} />
            <input style={{ ...inputStyle, width: 90 }} type="number" value={f.amount} onChange={(e) => setFixed(f.id, "amount", e.target.value)} placeholder="Amount" />
            <button style={iconBtnStyle} onClick={() => removeFixed(f.id)} aria-label="Remove obligation"><Trash2 size={15} /></button>
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Expenses in {monthLabel(viewMonth)}</div>
        {monthExpenses.length === 0 && <div style={{ fontSize: 13, color: TEXT_FAINT }}>Nothing logged for this month yet.</div>}
        {monthExpenses.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${BORDER}`, fontSize: 13 }}>
            <div style={{ width: 80, color: TEXT_FAINT }}>{e.date}</div>
            <div style={{ flex: "1 1 100px" }}>{categoryName(e.categoryId)}</div>
            <div style={{ flex: "1 1 120px", color: TEXT_DIM }}>{e.note}</div>
            <div style={{ width: 80, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmt(e.amount)}</div>
            <button style={iconBtnStyle} onClick={() => removeExpense(e.id)} aria-label="Remove expense"><Trash2 size={14} /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function BonusTab({ data, update, derived }) {
  const [selectedQuarter, setSelectedQuarter] = useState(derived.currentQuarter);

  const shiftQuarter = (delta) => {
    const [y, q] = selectedQuarter.split("-Q").map(Number);
    let ny = y, nq = q + delta;
    while (nq > 4) { nq -= 4; ny += 1; }
    while (nq < 1) { nq += 4; ny -= 1; }
    setSelectedQuarter(`${ny}-Q${nq}`);
  };

  const months = monthsInQuarter(selectedQuarter);
  const setResult = (mk, field, val) => update((d) => {
    let entry = d.bonusResults.find((r) => r.month === mk);
    if (!entry) {
      entry = { id: uid(), month: mk, target: 0, actual: 0 };
      d.bonusResults.push(entry);
    }
    entry[field] = val === "" ? "" : Number(val);
  });
  const getResult = (mk) => data.bonusResults.find((r) => r.month === mk) || { target: "", actual: "" };

  const monthRows = months.map((mk) => {
    const r = getResult(mk);
    const calc = computeMonthBonus(r.target, r.actual);
    return { month: mk, target: r.target, actual: r.actual, ...calc };
  });
  const quarterTotal = monthRows.reduce((s, r) => s + r.total, 0);
  const enteredCount = monthRows.filter((r) => r.target !== "" && r.target > 0).length;
  const isComplete = enteredCount === 3;
  const isFutureQuarter = monthsBetween(currentMonthKey(), months[0]) > 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button style={iconBtnStyle} onClick={() => shiftQuarter(-1)} aria-label="Previous quarter"><ChevronLeft size={18} /></button>
        <div style={{ fontSize: 14, minWidth: 100, textAlign: "center" }}>{quarterLabel(selectedQuarter)}</div>
        <button style={iconBtnStyle} onClick={() => shiftQuarter(1)} aria-label="Next quarter"><ChevronRight size={18} /></button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 4 }}>
          {isComplete ? "Payable at end of quarter" : `Accrued so far (${enteredCount} of 3 months locked in)`}
        </div>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 30, color: isComplete ? TEAL : TEXT }}>{fmt(quarterTotal)}</div>
        {isComplete && (
          <div style={{ fontSize: 12, color: TEXT_FAINT, marginTop: 6 }}>
            All three months are locked in — this is money you're owed, even before it lands in your account.
          </div>
        )}
        {!isComplete && !isFutureQuarter && (
          <div style={{ fontSize: 12, color: TEXT_FAINT, marginTop: 6 }}>
            Enter each closed month below as results come in. Only completed months count toward the total.
          </div>
        )}
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Monthly results</div>
        {monthRows.map((r) => (
          <div key={r.month} style={{ padding: "10px 0", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 70, fontSize: 13, color: TEXT_DIM, paddingBottom: 8 }}>{monthLabel(r.month)}</div>
              <Field label="Target">
                <input style={{ ...inputStyle, width: 110 }} type="number" placeholder="0" value={r.target} onChange={(e) => setResult(r.month, "target", e.target.value)} />
              </Field>
              <Field label="Actual">
                <input style={{ ...inputStyle, width: 110 }} type="number" placeholder="0" value={r.actual} onChange={(e) => setResult(r.month, "actual", e.target.value)} />
              </Field>
              <div style={{ fontSize: 13, color: TEXT_DIM, minWidth: 150 }}>
                {r.target > 0 ? (
                  <>
                    <span style={{ color: r.pct >= 100 ? TEAL : r.pct >= 90 ? GOLD : TEXT_FAINT }}>{Math.round(r.pct)}% of target</span>
                    {" · "}<span>{fmt(r.total)}</span>
                  </>
                ) : (
                  <span style={{ color: TEXT_FAINT }}>Enter target and actual</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: TEXT_FAINT, marginTop: 12 }}>
          100%+ of target = full £{BONUS_FULL} bonus, plus 10p for every £1 over. 95–99.9% = £{BONUS_FULL * 0.5}. 90–94.9% = £{BONUS_FULL * 0.25}. Below 90% = no bonus.
        </div>
      </Card>
    </div>
  );
}

function NetWorthTab({ data, update, derived }) {
  const [form, setForm] = useState({ date: todayISO(), assets: "", liabilities: "" });
  const [targetForm, setTargetForm] = useState({ name: "", amount: "", date: "" });

  const addSnapshot = () => {
    if (form.assets === "" && form.liabilities === "") return;
    update((d) => {
      d.netWorthHistory.push({ id: uid(), date: form.date, assets: Number(form.assets || 0), liabilities: Number(form.liabilities || 0) });
    });
    setForm({ date: todayISO(), assets: "", liabilities: "" });
  };
  const removeSnapshot = (id) => update((d) => { d.netWorthHistory = d.netWorthHistory.filter((h) => h.id !== id); });

  const addTarget = () => {
    if (!targetForm.amount || !targetForm.date) return;
    update((d) => {
      const makePrimary = d.targets.netWorthTargets.length === 0;
      d.targets.netWorthTargets.push({
        id: uid(),
        name: targetForm.name || "Target",
        amount: Number(targetForm.amount),
        date: targetForm.date,
        isPrimary: makePrimary,
      });
    });
    setTargetForm({ name: "", amount: "", date: "" });
  };
  const removeTarget = (id) => update((d) => {
    const wasPrimary = d.targets.netWorthTargets.find((t) => t.id === id)?.isPrimary;
    d.targets.netWorthTargets = d.targets.netWorthTargets.filter((t) => t.id !== id);
    if (wasPrimary && d.targets.netWorthTargets.length > 0) d.targets.netWorthTargets[0].isPrimary = true;
  });
  const setPrimary = (id) => update((d) => {
    d.targets.netWorthTargets.forEach((t) => { t.isPrimary = t.id === id; });
  });
  const editTarget = (id, field, val) => update((d) => {
    const t = d.targets.netWorthTargets.find((x) => x.id === id);
    if (!t) return;
    t[field] = field === "amount" ? Number(val) : val;
  });

  const sortedHistory = [...data.netWorthHistory].sort((a, b) => a.date.localeCompare(b.date));
  const targetColors = [RUST, TEAL, GOLD, "#7A6BB0", "#4C86C0"];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard label="Current net worth" value={fmt(derived.latestNetWorth)} sub={derived.unclaimedBonus > 0 ? `includes ${fmt(derived.unclaimedBonus)} accrued bonus` : undefined} />
        <MetricCard
          label="Monthly savings needed"
          value={derived.primaryTarget && !derived.primaryTarget.overdue ? fmt(derived.savingsGoal) : "—"}
          sub={derived.primaryTarget ? `to hit "${derived.primaryTarget.name}"` : "set a target below"}
        />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Net worth over time</div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={derived.netWorthPoints} margin={{ left: 0, right: 20, top: 10 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: TEXT_FAINT, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} />
              <YAxis tick={{ fill: TEXT_FAINT, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} tickFormatter={(v) => fmt(v)} width={70} />
              <Tooltip contentStyle={{ background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }} formatter={(v) => fmt(v)} />
              {derived.targetsComputed.map((t, i) => (
                <ReferenceLine
                  key={t.id}
                  y={t.amount}
                  stroke={targetColors[i % targetColors.length]}
                  strokeDasharray="5 4"
                  label={{ value: t.name, position: "insideTopRight", fill: targetColors[i % targetColors.length], fontSize: 11 }}
                />
              ))}
              <Line type="monotone" dataKey="actual" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} name="Net worth" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {sortedHistory.length === 0 && <div style={{ fontSize: 12, color: TEXT_FAINT, marginTop: 8 }}>Add a snapshot below to start the chart.</div>}
        {derived.unclaimedBonus > 0 && (
          <div style={{ fontSize: 12, color: TEXT_FAINT, marginTop: 8 }}>
            The chart shows your snapshots as entered. Your current net worth figure above also adds {fmt(derived.unclaimedBonus)} in bonus already locked in from completed quarters — add a new snapshot once it lands to fold it permanently into the chart.
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Targets</div>
        {derived.targetsComputed.length === 0 && <div style={{ fontSize: 13, color: TEXT_FAINT, marginBottom: 10 }}>No targets yet — add one below.</div>}
        {derived.targetsComputed.map((t, i) => (
          <div key={t.id} style={{ padding: "10px 0", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: targetColors[i % targetColors.length], marginBottom: 8 }} />
              <Field label="Name">
                <input style={{ ...inputStyle, width: 140, fontFamily: "inherit" }} value={t.name} onChange={(e) => editTarget(t.id, "name", e.target.value)} />
              </Field>
              <Field label="Target amount">
                <input style={{ ...inputStyle, width: 110 }} type="number" value={t.amount} onChange={(e) => editTarget(t.id, "amount", e.target.value)} />
              </Field>
              <Field label="Target date">
                <input style={{ ...inputStyle, width: 140 }} type="date" value={t.date} onChange={(e) => editTarget(t.id, "date", e.target.value)} />
              </Field>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: TEXT_DIM, paddingBottom: 8 }}>
                <input type="radio" name="primary-target" checked={!!t.isPrimary} onChange={() => setPrimary(t.id)} />
                Drives monthly limit
              </label>
              <button style={iconBtnStyle} onClick={() => removeTarget(t.id)} aria-label="Remove target"><Trash2 size={15} /></button>
            </div>
            <div style={{ fontSize: 13, color: TEXT_DIM, marginTop: 6, marginLeft: 22 }}>
              {!t.date
                ? <span style={{ color: TEXT_FAINT }}>Add a target date to see the monthly requirement</span>
                : t.overdue
                ? <span style={{ color: RUST }}>Target date has passed</span>
                : (
                  <>
                    <span style={{ color: t.progressPct >= 100 ? TEAL : TEXT_DIM }}>{Math.round(t.progressPct)}% there</span>
                    {" · "}
                    {t.requiredMonthly <= 0
                      ? <span style={{ color: TEAL }}>already on track, no monthly amount needed</span>
                      : <span>needs {fmt(t.requiredMonthly)}/month ({t.monthsLeft} month{t.monthsLeft === 1 ? "" : "s"} left)</span>}
                  </>
                )}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14, paddingTop: 14, borderTop: derived.targetsComputed.length ? `1px solid ${BORDER}` : "none" }}>
          <Field label="Name">
            <input style={inputStyle} type="text" placeholder="e.g. End of 2026" value={targetForm.name} onChange={(e) => setTargetForm({ ...targetForm, name: e.target.value })} />
          </Field>
          <Field label="Target amount">
            <input style={inputStyle} type="number" placeholder="0" value={targetForm.amount} onChange={(e) => setTargetForm({ ...targetForm, amount: e.target.value })} />
          </Field>
          <Field label="Target date">
            <input style={inputStyle} type="date" value={targetForm.date} onChange={(e) => setTargetForm({ ...targetForm, date: e.target.value })} />
          </Field>
          <button style={{ ...buttonStyle, color: GOLD, borderColor: GOLD }} onClick={addTarget}><Plus size={14} />Add target</button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Add a net worth snapshot</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Date">
            <input style={inputStyle} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Total assets">
            <input style={inputStyle} type="number" placeholder="0" value={form.assets} onChange={(e) => setForm({ ...form, assets: e.target.value })} />
          </Field>
          <Field label="Total liabilities">
            <input style={inputStyle} type="number" placeholder="0" value={form.liabilities} onChange={(e) => setForm({ ...form, liabilities: e.target.value })} />
          </Field>
          <button style={{ ...buttonStyle, color: GOLD, borderColor: GOLD }} onClick={addSnapshot}><Plus size={14} />Add snapshot</button>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Snapshot history</div>
        {sortedHistory.length === 0 && <div style={{ fontSize: 13, color: TEXT_FAINT }}>No snapshots yet.</div>}
        {[...sortedHistory].reverse().map((h) => (
          <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${BORDER}`, fontSize: 13 }}>
            <div style={{ width: 100, color: TEXT_FAINT }}>{h.date}</div>
            <div style={{ flex: 1 }}>Assets {fmt(h.assets)} · Liabilities {fmt(h.liabilities)}</div>
            <div style={{ width: 90, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmt(h.assets - h.liabilities)}</div>
            <button style={iconBtnStyle} onClick={() => removeSnapshot(h.id)} aria-label="Remove snapshot"><Trash2 size={14} /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ForecastTab({ data, derived }) {
  const [monthlyRate, setMonthlyRate] = useState(Math.round(derived.avgMonthlyGrowth) || 0);
  const [monthsAhead, setMonthsAhead] = useState(12);

  useEffect(() => {
    setMonthlyRate(Math.round(derived.avgMonthlyGrowth) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = derived.primaryTarget ? Number(derived.primaryTarget.amount || 0) : 0;
  const targetName = derived.primaryTarget ? derived.primaryTarget.name : null;
  const startValue = derived.latestNetWorth;
  const startDate = derived.netWorthPoints.length ? derived.netWorthPoints[derived.netWorthPoints.length - 1].date : todayISO();

  const chartData = useMemo(() => {
    const historical = derived.netWorthPoints.map((p) => ({ date: p.date, actual: p.actual, forecast: null }));
    const forecastPoints = [];
    const [y, m, dd] = startDate.split("-").map(Number);
    for (let i = 0; i <= monthsAhead; i++) {
      const d = new Date(y, (m - 1) + i, dd || 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      forecastPoints.push({
        date: key,
        actual: i === 0 ? startValue : null,
        forecast: startValue + monthlyRate * i,
      });
    }
    return [...historical.slice(0, -1), ...forecastPoints];
  }, [derived.netWorthPoints, monthlyRate, monthsAhead, startValue, startDate]);

  const monthsToTarget = target > 0 && monthlyRate > 0 ? Math.max(0, Math.ceil((target - startValue) / monthlyRate)) : null;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
          <Field label={`Assumed monthly growth: ${fmt(monthlyRate)}`}>
            <input type="range" min={-2000} max={5000} step={50} value={monthlyRate} onChange={(e) => setMonthlyRate(Number(e.target.value))} style={{ width: 220 }} />
          </Field>
          <Field label={`Months ahead: ${monthsAhead}`}>
            <input type="range" min={3} max={36} step={1} value={monthsAhead} onChange={(e) => setMonthsAhead(Number(e.target.value))} style={{ width: 220 }} />
          </Field>
        </div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 0, right: 20, top: 10 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: TEXT_FAINT, fontSize: 10 }} axisLine={{ stroke: BORDER }} tickLine={false} />
              <YAxis tick={{ fill: TEXT_FAINT, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} tickFormatter={(v) => fmt(v)} width={70} />
              <Tooltip contentStyle={{ background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }} formatter={(v) => (v == null ? "" : fmt(v))} />
              {target > 0 && <ReferenceLine y={target} stroke={RUST} strokeDasharray="5 4" label={{ value: targetName || "Target", position: "insideTopRight", fill: RUST, fontSize: 11 }} />}
              <Line type="monotone" dataKey="actual" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} name="Actual" connectNulls={false} />
              <Line type="monotone" dataKey="forecast" stroke={TEAL} strokeWidth={2} strokeDasharray="6 4" dot={false} name="Forecast" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, background: GOLD, borderRadius: 2 }} />Actual</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, background: TEAL, borderRadius: 2 }} />Forecast</span>
          {target > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, background: RUST, borderRadius: 2 }} />Target</span>}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 6 }}>What this means</div>
        <div style={{ fontSize: 14 }}>
          {monthlyRate <= 0 && "At this rate your net worth won't grow — try raising the assumed monthly growth or your savings goal."}
          {monthlyRate > 0 && target <= 0 && "Set a target on the Net worth & targets tab to see a projected date."}
          {monthlyRate > 0 && target > 0 && monthsToTarget !== null && (
            monthsToTarget === 0
              ? `You've already reached ${targetName ? `"${targetName}"` : "your target"}.`
              : `At ${fmt(monthlyRate)} a month, you'd reach ${targetName ? `"${targetName}"` : "your target"} of ${fmt(target)} in about ${monthsToTarget} month${monthsToTarget === 1 ? "" : "s"}.`
          )}
        </div>
      </Card>
    </div>
  );
}

function SetupTab({ data, update }) {
  const [bonusForm, setBonusForm] = useState({ label: "", amount: "", month: currentMonthKey() });

  const setBase = (v) => update((d) => { d.income.base = v === "" ? "" : Number(v); });
  const addBonus = () => {
    if (!bonusForm.amount) return;
    update((d) => { d.income.bonuses.push({ id: uid(), label: bonusForm.label || "Bonus", amount: Number(bonusForm.amount), month: bonusForm.month }); });
    setBonusForm({ label: "", amount: "", month: bonusForm.month });
  };
  const removeBonus = (id) => update((d) => { d.income.bonuses = d.income.bonuses.filter((b) => b.id !== id); });

  const setManualSavings = (v) => update((d) => { d.targets.manualMonthlySavings = v === "" ? "" : Number(v); });

  const sortedBonuses = [...data.income.bonuses].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Income</div>
        <Field label="Base monthly income">
          <input style={{ ...inputStyle, width: 160 }} type="number" value={data.income.base} onChange={(e) => setBase(e.target.value)} />
        </Field>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Bonuses and one-off income</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <Field label="Label">
            <input style={inputStyle} type="text" placeholder="e.g. commission" value={bonusForm.label} onChange={(e) => setBonusForm({ ...bonusForm, label: e.target.value })} />
          </Field>
          <Field label="Amount">
            <input style={inputStyle} type="number" placeholder="0" value={bonusForm.amount} onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })} />
          </Field>
          <Field label="Month">
            <input style={inputStyle} type="month" value={bonusForm.month} onChange={(e) => setBonusForm({ ...bonusForm, month: e.target.value })} />
          </Field>
          <button style={{ ...buttonStyle, color: GOLD, borderColor: GOLD }} onClick={addBonus}><Plus size={14} />Add</button>
        </div>
        {sortedBonuses.map((b) => (
          <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${BORDER}`, fontSize: 13 }}>
            <div style={{ width: 80, color: TEXT_FAINT }}>{monthLabel(b.month)}</div>
            <div style={{ flex: 1 }}>{b.label}</div>
            <div style={{ width: 80, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmt(b.amount)}</div>
            <button style={iconBtnStyle} onClick={() => removeBonus(b.id)} aria-label="Remove bonus"><Trash2 size={14} /></button>
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 6 }}>Targets</div>
        <div style={{ fontSize: 13, color: TEXT_FAINT, marginBottom: 12 }}>
          Your net worth targets — and the monthly savings figure worked out from them — now live on the
          "Net worth & targets" tab, where you can set as many as you like.
        </div>
        <Field label="Fallback monthly savings goal (used only if you haven't set any targets)">
          <input style={{ ...inputStyle, width: 160 }} type="number" value={data.targets.manualMonthlySavings} onChange={(e) => setManualSavings(e.target.value)} />
        </Field>
      </Card>
    </div>
  );
}
