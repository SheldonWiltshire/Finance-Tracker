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
    manualMonthlySavings: Number((targets
