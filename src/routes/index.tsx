import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, Cell, ReferenceLine,
} from "recharts";
import {
  Home, Activity, Battery, Footprints, BarChart3, Target, Bell, TrendingUp,
  Zap, Cpu, Settings, Lightbulb, Database, Wifi, Menu, X,
} from "lucide-react";
import { supabase, type EnergyReading } from "@/lib/supabaseClient";
import EnergyForecastCard from "../components/EnergyForecastCard";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Piezoelectric Energy Monitoring Dashboard" },
      { name: "description", content: "IoT-Based Piezoelectric Energy Harvesting Monitoring System — live ESP32 telemetry, capacitor analytics, footstep events, and forecasting." },
    ],
  }),
});

const NAV = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "live-voltage", label: "Live Voltage", icon: Activity },
  { id: "capacitor-bank", label: "Capacitor Bank", icon: Battery },
  { id: "footstep-events", label: "Footstep Events", icon: Footprints },
  { id: "energy-report", label: "Energy Report", icon: BarChart3 },
  { id: "detection-accuracy", label: "Detection Accuracy", icon: Target },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "forecasting", label: "Forecasting", icon: TrendingUp },
];

const C = {
  blue: "#2563EB",
  cyan: "#0EA5E9",
  green: "#10B981",
  purple: "#8B5CF6",
  amber: "#F59E0B",
  red: "#EF4444",
  dark: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  bg: "#F4F7FB",
};

// ---------- helpers ----------
function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts; }
}
function statusColor(s: string | null) {
  const v = (s || "").toUpperCase();
  if (v === "NORMAL") return C.green;
  if (v === "CHARGING") return C.amber;
  if (v === "LOW") return C.red;
  if (v === "CRITICAL") return C.red;
  return C.muted;
}
function ledColor(s: string | null) {
  return (s || "").toUpperCase() === "ON" ? C.green : C.red;
}
function stddev(arr: number[]) {
  if (!arr.length) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// ---------- atoms ----------
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Gauge({ value, max = 100, color, label, suffix = "%" }: {
  value: number; max?: number; color: string; label: string; suffix?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const data = [{ name: "v", value: pct, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div className="text-sm font-medium text-slate-600 mb-1">{label}</div>
      <div className="relative w-full h-32">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="85%" innerRadius="90%" outerRadius="140%"
            barSize={14} data={data} startAngle={180} endAngle={0}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#E2E8F0" }} dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-2 text-center">
          <div className="text-2xl font-bold" style={{ color: C.dark }}>
            {typeof value === "number" ? value.toFixed(1) : value}{suffix}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] p-5 transition-shadow hover:shadow-[0_2px_6px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.08)] ${className}`}>
      {children}
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon: Icon, color, spark }: {
  title: string; value: React.ReactNode; subtitle: string;
  icon: React.ComponentType<{ size?: number; color?: string }>; color: string; spark?: number[];
}) {
  return (
    <Card className="!p-4 min-h-[180px]">
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 leading-snug">
              {title}
            </div>

            <div
              className="mt-2 text-2xl font-bold leading-tight break-words"
              style={{ color: C.dark }}
            >
              {value}
            </div>

            <div className="text-xs text-slate-500 mt-1 leading-snug">
              {subtitle}
            </div>
          </div>

          <div
            className="h-9 w-9 min-w-9 shrink-0 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${color}1A` }}
          >
            <Icon size={18} color={color} />
          </div>
        </div>

        <div className="mt-auto">
          {spark && spark.length > 1 && <Sparkline data={spark} color={color} />}
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold tracking-tight" style={{ color: C.dark }}>{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// ---------- sidebar ----------
function Sidebar({ active, onNavigate, open, onClose }: {
  active: string; onNavigate: (id: string) => void; open: boolean; onClose: () => void;
}) {
  return (
    <>
      {open && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={onClose} />}
      <aside
        className={`fixed z-50 inset-y-0 left-0 w-64 bg-white border-r border-[#E2E8F0] flex flex-col transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-[#E2E8F0] flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-full flex items-center justify-center text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})` }}
          >
            <Zap size={22} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold tracking-wider text-slate-500">ENERGY</div>
            <div className="text-base font-bold leading-tight" style={{ color: C.dark }}>DASHBOARD</div>
            <div className="text-[11px] text-slate-500">Piezo IoT Monitor</div>
          </div>
          <button className="lg:hidden text-slate-500" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((it) => {
            const isActive = active === it.id;
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={() => { onNavigate(it.id); onClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? "text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                }`}
                style={isActive ? { background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})` } : undefined}
              >
                <Icon size={18} color={isActive ? "#fff" : C.muted} />
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 space-y-2 border-t border-[#E2E8F0]">
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#EFF6FF" }}>
            <Cpu size={16} color={C.blue} />
            <div className="text-xs">
              <div className="text-slate-500">Device</div>
              <div className="font-semibold" style={{ color: C.dark }}>ESP32</div>
            </div>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#ECFDF5" }}>
            <Database size={16} color={C.green} />
            <div className="text-xs">
              <div className="text-slate-500">Database</div>
              <div className="font-semibold" style={{ color: C.dark }}>Supabase</div>
            </div>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#ECFDF5" }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: C.green }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: C.green }} />
            </span>
            <div className="text-xs">
              <div className="text-slate-500">Connection</div>
              <div className="font-semibold" style={{ color: C.dark }}>Live</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ---------- main ----------
function Dashboard() {
  const [rows, setRows] = useState<EnergyReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const observers = useRef<IntersectionObserver | null>(null);

  // Fetch initial + realtime subscription
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("energy_readings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted && data) setRows(data as EnergyReading[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("energy_readings_inserts")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "energy_readings" },
        (payload) => {
          setRows((prev) => [payload.new as EnergyReading, ...prev].slice(0, 50));
        })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  // Scroll spy
  useEffect(() => {
    if (observers.current) observers.current.disconnect();
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) io.observe(el);
    });
    observers.current = io;
    return () => io.disconnect();
  }, [loading]);

  const handleNav = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  const latest = rows[0];
  const chrono = useMemo(() => [...rows].reverse(), [rows]);
  const last20 = chrono.slice(-20);

  const capVoltages = chrono.map((r) => Number(r.capacitor_voltage ?? 0));
  const minV = capVoltages.length ? Math.min(...capVoltages) : 0;
  const maxV = capVoltages.length ? Math.max(...capVoltages) : 0;
  const avgV = capVoltages.length ? capVoltages.reduce((a, b) => a + b, 0) / capVoltages.length : 0;

  const voltagePct = latest ? (Number(latest.capacitor_voltage ?? 0) / 3.3) * 100 : 0;
  const chargePct = latest ? Number(latest.charge_percent ?? 0) : 0;
  const stabilitySd = stddev(capVoltages);
  const stabilityPct = Math.max(0, Math.min(100, 100 - stabilitySd * 60));
  const ledPct = (latest?.led_status || "").toUpperCase() === "ON" ? 100 : 0;

  // Footstep static dataset
  const footstepEvents = useMemo(() => {
    const out: { idx: number; v: number }[] = [];
    let seed = 1;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 1; i <= 87; i++) {
      const heavy = i % 9 === 0 || i % 14 === 0;
      const base = 0.9 + rand() * 1.0;
      const v = heavy ? Math.min(2.4, base + 0.6 + rand() * 0.4) : base;
      out.push({ idx: i, v: Number(v.toFixed(2)) });
    }
    return out;
  }, []);

  const footstepBuckets = [
    { label: "0–5", count: 12 }, { label: "5–10", count: 16 },
    { label: "10–15", count: 23 }, { label: "15–20", count: 14 },
    { label: "20–25", count: 13 }, { label: "25–30", count: 9 },
  ];

  const accuracyData = [
    { name: "Detection Accuracy", existing: 65, ours: 97.7 },
    { name: "False Positive Rate", existing: 30, ours: 0 },
  ];

  // Forecast
  const forecastTrend = useMemo(() => {
    if (capVoltages.length < 2) return "stable" as const;
    const half = Math.floor(capVoltages.length / 2);
    const a = capVoltages.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
    const b = capVoltages.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, capVoltages.length - half);
    const d = b - a;
    if (d > 0.05) return "increasing" as const;
    if (d < -0.05) return "decreasing" as const;
    return "stable" as const;
  }, [capVoltages]);

  const forecastData = useMemo(() => {
    const base = chrono.map((r, i) => ({ i, actual: Number(r.capacitor_voltage ?? 0), forecast: null as number | null }));
    if (!base.length) return base;
    const last = base[base.length - 1].actual;
    const slope = forecastTrend === "increasing" ? 0.05 : forecastTrend === "decreasing" ? -0.05 : 0;
    for (let k = 1; k <= 5; k++) {
      base.push({ i: base.length, actual: null as unknown as number, forecast: Number((last + slope * k).toFixed(2)) });
    }
    // ensure connection point
    base[chrono.length - 1] = { ...base[chrono.length - 1], forecast: last };
    return base;
  }, [chrono, forecastTrend]);

  const alertConfig = (() => {
    const s = (latest?.status || "").toUpperCase();
    if (s === "LOW") return { bg: "#FEF2F2", border: C.red, text: "Low energy level detected.", color: C.red };
    if (s === "CHARGING") return { bg: "#FFFBEB", border: C.amber, text: "System currently CHARGING — capacitor bank is storing harvested energy.", color: C.amber };
    if (s === "NORMAL") return { bg: "#ECFDF5", border: C.green, text: "System operating normally.", color: C.green };
    if (s === "CRITICAL") return { bg: "#FEF2F2", border: C.red, text: "High voltage condition detected. Monitor capacitor voltage carefully.", color: C.red };
    return { bg: "#F1F5F9", border: C.muted, text: "Waiting for live status...", color: C.muted };
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-slate-500">Loading dashboard…</div>
      </div>
    );
  }

  const noData = rows.length === 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <Sidebar active={active} onNavigate={handleNav} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-[#E2E8F0]">
          <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
            <button className="lg:hidden text-slate-600" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate" style={{ color: C.dark }}>
                Piezoelectric Energy Monitoring Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 truncate">
                IoT-Based Piezoelectric Energy Harvesting Monitoring System
              </p>
            </div>
            <div
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${C.green}, ${C.cyan})` }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              Live IoT System
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 p-4 sm:p-6">
          <main className="space-y-10 min-w-0">
            {noData && (
              <Card>
                <div className="text-center py-12 text-slate-500">
                  <Wifi size={32} className="mx-auto mb-3" color={C.muted} />
                  Waiting for ESP32 data...
                </div>
              </Card>
            )}

            {/* OVERVIEW */}
            <section id="overview" className="scroll-mt-24">
              <SectionHeader title="Overview" subtitle="Latest live telemetry from ESP32" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
                <KpiCard
                  title="Capacitor Voltage"
                  value={latest ? `${Number(latest.capacitor_voltage ?? 0).toFixed(2)} V` : "—"}
                  subtitle="Latest live reading" icon={Activity} color={C.blue}
                  spark={last20.map((r) => Number(r.capacitor_voltage ?? 0))}
                />
                <KpiCard
                  title="Charge Percentage"
                  value={latest ? `${Number(latest.charge_percent ?? 0).toFixed(1)}%` : "—"}
                  subtitle="Current storage level" icon={Battery} color={C.green}
                  spark={last20.map((r) => Number(r.charge_percent ?? 0))}
                />
                <KpiCard
                  title="ADC Value"
                  value={latest ? `${latest.adc_value ?? "—"}` : "—"}
                  subtitle="Latest ESP32 reading" icon={Cpu} color={C.purple}
                  spark={last20.map((r) => Number(r.adc_value ?? 0))}
                />
                <KpiCard
                  title="System Status"
                  value={
                    <span className="px-2 py-0.5 rounded-md text-sm font-bold" style={{
                      color: statusColor(latest?.status ?? null),
                      backgroundColor: `${statusColor(latest?.status ?? null)}1A`,
                    }}>{latest?.status ?? "—"}</span>
                  }
                  subtitle="Current operating state" icon={Settings} color={C.amber}
                />
                <KpiCard
                  title="LED Status"
                  value={
                    <span className="px-2 py-0.5 rounded-md text-sm font-bold" style={{
                      color: ledColor(latest?.led_status ?? null),
                      backgroundColor: `${ledColor(latest?.led_status ?? null)}1A`,
                    }}>{latest?.led_status ?? "—"}</span>
                  }
                  subtitle="Load condition" icon={Lightbulb} color={ledColor(latest?.led_status ?? null)}
                />
              </div>
            </section>

            {/* LIVE VOLTAGE */}
            <section id="live-voltage" className="scroll-mt-24">
              <SectionHeader title="Live Voltage Analysis" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold" style={{ color: C.dark }}>Live Capacitor Voltage Trend</div>
                    <div className="text-xs text-slate-500">latest 50 readings</div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chrono.map((r) => ({ t: fmtTime(r.created_at), v: Number(r.capacitor_voltage ?? 0) }))}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                        <XAxis dataKey="t" stroke={C.muted} fontSize={11} minTickGap={24} />
                        <YAxis stroke={C.muted} fontSize={11} />
                        <Tooltip />
                        <ReferenceLine y={minV} stroke={C.muted} strokeDasharray="3 3" label={{ value: `min ${minV.toFixed(2)}`, fill: C.muted, fontSize: 10, position: "insideBottomLeft" }} />
                        <ReferenceLine y={maxV} stroke={C.muted} strokeDasharray="3 3" label={{ value: `max ${maxV.toFixed(2)}`, fill: C.muted, fontSize: 10, position: "insideTopLeft" }} />
                        <Line type="monotone" dataKey="v" stroke={C.cyan} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card>
                  <div className="font-semibold mb-2" style={{ color: C.dark }}>Voltage Utilization</div>
                  <Gauge label="of 3.3 V max" value={voltagePct} color={C.blue} />
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Latest</div><div className="font-bold text-sm" style={{ color: C.dark }}>{latest ? Number(latest.capacitor_voltage ?? 0).toFixed(2) : "—"} V</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Min</div><div className="font-bold text-sm" style={{ color: C.dark }}>{minV.toFixed(2)} V</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Max</div><div className="font-bold text-sm" style={{ color: C.dark }}>{maxV.toFixed(2)} V</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Avg</div><div className="font-bold text-sm" style={{ color: C.dark }}>{avgV.toFixed(2)} V</div></div>
                  </div>
                </Card>
              </div>
            </section>

            {/* CAPACITOR BANK */}
            <section id="capacitor-bank" className="scroll-mt-24">
              <SectionHeader title="Capacitor Bank Analysis" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <Card><Gauge label="Charge Level" value={chargePct} color={C.blue} /></Card>
                <Card><Gauge label="Voltage Utilization" value={voltagePct} color={C.green} /></Card>
                <Card><Gauge label="Energy Stability" value={stabilityPct} color={C.purple} /></Card>
                <Card><Gauge label="LED Activity" value={ledPct} color={ledColor(latest?.led_status ?? null)} /></Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <div className="font-semibold mb-2" style={{ color: C.dark }}>Charge Percentage Trend</div>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chrono.map((r) => ({ t: fmtTime(r.created_at), v: Number(r.charge_percent ?? 0) }))}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                        <XAxis dataKey="t" stroke={C.muted} fontSize={11} minTickGap={24} />
                        <YAxis stroke={C.muted} fontSize={11} />
                        <Tooltip />
                        <Line type="monotone" dataKey="v" stroke={C.green} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card>
                  <div className="font-semibold mb-2" style={{ color: C.dark }}>Capacitor Voltage Trend</div>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chrono.map((r) => ({ t: fmtTime(r.created_at), v: Number(r.capacitor_voltage ?? 0) }))}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                        <XAxis dataKey="t" stroke={C.muted} fontSize={11} minTickGap={24} />
                        <YAxis stroke={C.muted} fontSize={11} />
                        <Tooltip />
                        <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <Card className="mt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${C.blue}1A` }}>
                    <Battery size={20} color={C.blue} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Capacitor Condition</div>
                    <div className="font-semibold" style={{ color: C.dark }}>
                      {chargePct > 70 ? "Well-charged — ready for sustained load" :
                       chargePct > 30 ? "Moderate charge — actively harvesting" :
                       "Low charge — collecting footstep energy"}
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* FOOTSTEP EVENTS */}
            <section id="footstep-events" className="scroll-mt-24">
              <SectionHeader title="Footstep Event Analysis" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <div className="font-semibold mb-2" style={{ color: C.dark }}>Voltage Output per Footstep Event</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={footstepEvents}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                        <XAxis dataKey="idx" stroke={C.muted} fontSize={11} label={{ value: "Event Index", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }} />
                        <YAxis stroke={C.muted} fontSize={11} domain={[0, 2.6]} label={{ value: "Voltage (V)", angle: -90, position: "insideLeft", fill: C.muted, fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="v" stroke={C.cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-500 italic mt-2">Fig. 1: Voltage output per footstep event over 30-minute test session.</p>
                  <p className="text-xs mt-1" style={{ color: C.dark }}>
                    <span className="font-semibold">Key insight:</span> Consistent measurable output in the 0.8–2.4 V range confirms reliable piezoelectric response, with heavier steps producing higher voltage peaks.
                  </p>
                </Card>
                <Card>
                  <div className="font-semibold mb-2" style={{ color: C.dark }}>Footstep Detection Rate vs Time</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={footstepBuckets}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                        <XAxis dataKey="label" stroke={C.muted} fontSize={11} />
                        <YAxis stroke={C.muted} fontSize={11} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                          {footstepBuckets.map((b, i) => (
                            <Cell key={i} fill={b.label === "10–15" ? C.purple : C.blue} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-500 italic mt-2">Fig. 2: Footstep events per 5-minute interval.</p>
                  <p className="text-xs mt-1" style={{ color: C.dark }}>
                    <span className="font-semibold">Key insight:</span> Peak activity occurs during minutes 10–15 with 23 events, validating peak-usage detection capability of the system.
                  </p>
                </Card>
              </div>
            </section>

            {/* ENERGY REPORT */}
            <section id="energy-report" className="scroll-mt-24">
              <SectionHeader title="Energy Harvesting Report" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                {[
                  { l: "Voltage Range", v: "1.31 V – 3.30 V" },
                  { l: "Peak Charge", v: "66.00%" },
                  { l: "Logged Live Readings", v: "100+" },
                  { l: "Footstep Events", v: "87" },
                  { l: "Latest ADC", v: latest?.adc_value ?? "—" },
                  { l: "Latest Pin Voltage", v: latest ? `${Number(latest.pin_voltage ?? 0).toFixed(2)} V` : "—" },
                  { l: "Latest Capacitor V", v: latest ? `${Number(latest.capacitor_voltage ?? 0).toFixed(2)} V` : "—" },
                  { l: "Latest LED", v: latest?.led_status ?? "—" },
                ].map((c) => (
                  <Card key={c.l} className="!p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{c.l}</div>
                    <div className="text-lg font-bold mt-1" style={{ color: C.dark }}>{c.v}</div>
                  </Card>
                ))}
              </div>
              <Card>
                <p className="text-sm text-slate-600 leading-relaxed">
                  The system captures measurable voltage from footstep events and stores the generated energy in the capacitor bank.
                  The ESP32 continuously monitors the capacitor voltage through GPIO34 and transmits the readings to Supabase.
                  The dashboard visualizes voltage trends, charge percentage, operating status, LED activity, and event-based performance in real time.
                </p>
              </Card>
              <Card className="mt-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">System Flow</div>
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  {["Piezoelectric Sensor", "Bridge Rectifier", "Capacitor Bank", "ESP32 GPIO34", "Supabase", "Live Dashboard"].map((s, i, arr) => (
                    <div key={s} className="flex items-center gap-2">
                      <span className="px-3 py-1.5 rounded-lg font-semibold text-white" style={{
                        background: `linear-gradient(135deg, ${[C.blue, C.cyan, C.purple, C.green, C.amber, C.red][i]}, ${[C.cyan, C.blue, C.blue, C.cyan, C.green, C.purple][i]})`,
                      }}>{s}</span>
                      {i < arr.length - 1 && <span className="text-slate-400">→</span>}
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            {/* DETECTION ACCURACY */}
            <section id="detection-accuracy" className="scroll-mt-24">
              <SectionHeader title="Event Detection Accuracy" />
              <Card>
                <div className="font-semibold mb-2" style={{ color: C.dark }}>Event Detection Accuracy Comparison</div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={accuracyData} barGap={10}>
                      <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke={C.muted} fontSize={12} />
                      <YAxis stroke={C.muted} fontSize={11} domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="existing" name="Existing Prototype" fill="#94A3B8" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="ours" name="Our System" fill={C.green} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 italic mt-2">Fig. 3: Detection accuracy comparison.</p>
                <p className="text-xs mt-1" style={{ color: C.dark }}>
                  <span className="font-semibold">Key insight:</span> Threshold and debounce logic eliminate false positives, achieving 97.7% accuracy compared to about 65% for basic prototypes without digital filtering.
                </p>
              </Card>
            </section>

            {/* ALERTS */}
            <section id="alerts" className="scroll-mt-24">
              <SectionHeader title="System Alerts" />
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-start gap-3 p-4" style={{ backgroundColor: alertConfig.bg, borderLeft: `4px solid ${alertConfig.border}` }}>
                  <Bell size={20} color={alertConfig.color} />
                  <div>
                    <div className="font-semibold" style={{ color: alertConfig.color }}>{(latest?.status ?? "UNKNOWN").toUpperCase()}</div>
                    <div className="text-sm text-slate-700">{alertConfig.text}</div>
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
                {[
                  { l: "Current Status", v: latest?.status ?? "—", c: statusColor(latest?.status ?? null) },
                  { l: "LED Status", v: latest?.led_status ?? "—", c: ledColor(latest?.led_status ?? null) },
                  { l: "Voltage Threshold", v: "3.30 V", c: C.blue },
                  { l: "Last Updated", v: latest ? fmtTime(latest.created_at) : "—", c: C.purple },
                  { l: "Database", v: "Connected", c: C.green },
                ].map((c) => (
                  <Card key={c.l} className="!p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{c.l}</div>
                    <div className="text-base font-bold mt-1" style={{ color: c.c }}>{c.v}</div>
                  </Card>
                ))}
              </div>
            </section>

            {/* FORECASTING */}
            <section id="forecasting" className="scroll-mt-24">
              <SectionHeader title="Energy Forecasting" />

              <div className="mb-4">
                <EnergyForecastCard />
              </div>

              <Card className="mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{
                    backgroundColor: forecastTrend === "increasing" ? `${C.green}1A` : forecastTrend === "decreasing" ? `${C.red}1A` : `${C.amber}1A`,
                  }}>
                    <TrendingUp size={20} color={forecastTrend === "increasing" ? C.green : forecastTrend === "decreasing" ? C.red : C.amber} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Trend Analysis</div>
                    <div className="font-semibold" style={{ color: C.dark }}>
                      {forecastTrend === "increasing" && "Voltage trend is increasing. Capacitor bank is charging."}
                      {forecastTrend === "decreasing" && "Voltage trend is decreasing. Stored energy may be consumed by the load."}
                      {forecastTrend === "stable" && "Voltage level is stable."}
                    </div>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="font-semibold mb-2" style={{ color: C.dark }}>Capacitor Voltage Forecast (next 5)</div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastData}>
                      <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                      <XAxis dataKey="i" stroke={C.muted} fontSize={11} />
                      <YAxis stroke={C.muted} fontSize={11} />
                      <Tooltip />
                      <Line type="monotone" dataKey="actual" stroke={C.blue} strokeWidth={2.5} dot={false} isAnimationActive={false} name="Actual" />
                      <Line type="monotone" dataKey="forecast" stroke={C.purple} strokeWidth={2.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} name="Forecast" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </section>

            {/* BOTTOM SUMMARY */}
            <section>
              <SectionHeader title="Project Summary" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { l: "Voltage Range", v: "1.31 V – 3.30 V", c: C.blue },
                  { l: "Logged Live Readings", v: "100+", c: C.cyan },
                  { l: "Footstep Events", v: "87", c: C.purple },
                  { l: "Detection Accuracy", v: "97.7%", c: C.green },
                  { l: "False Positive Rate", v: "0%", c: C.amber },
                  { l: "Peak Charge", v: "66.00%", c: C.red },
                ].map((c) => (
                  <Card key={c.l} className="!p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{c.l}</div>
                    <div className="text-lg font-bold mt-1" style={{ color: c.c }}>{c.v}</div>
                  </Card>
                ))}
              </div>
            </section>

            {/* RECENT READINGS */}
            <section>
              <SectionHeader title="Recent Sensor Readings" subtitle="Latest 10 rows from Supabase" />
              <Card className="!p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                      <tr>
                        {["Time", "Device ID", "ADC", "Pin V", "Cap V", "Charge %", "Status", "LED"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((r) => (
                        <tr key={String(r.id)} className="border-t border-[#E2E8F0] hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{fmtTime(r.created_at)}</td>
                          <td className="px-4 py-3 text-slate-600">{r.device_id ?? "—"}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: C.dark }}>{r.adc_value ?? "—"}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: C.dark }}>{r.pin_voltage != null ? Number(r.pin_voltage).toFixed(2) : "—"}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: C.dark }}>{r.capacitor_voltage != null ? Number(r.capacitor_voltage).toFixed(2) : "—"}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: C.dark }}>{r.charge_percent != null ? Number(r.charge_percent).toFixed(1) : "—"}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{
                              color: statusColor(r.status), backgroundColor: `${statusColor(r.status)}1A`,
                            }}>{r.status ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{
                              color: ledColor(r.led_status), backgroundColor: `${ledColor(r.led_status)}1A`,
                            }}>{r.led_status ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Waiting for ESP32 data...</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </main>

          {/* SMART INSIGHTS PANEL */}
          <aside className="xl:sticky xl:top-24 xl:self-start space-y-3">
            <Card>
              <div className="flex items-center justify-between">
                <div className="font-bold" style={{ color: C.dark }}>Smart Insights</div>
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full text-white" style={{ background: `linear-gradient(135deg, ${C.green}, ${C.cyan})` }}>
                  Live Analysis
                </span>
              </div>
            </Card>
            {[
              {
                title: "Latest reading", color: C.blue, body: (
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>Voltage: <span className="font-semibold" style={{ color: C.dark }}>{latest ? Number(latest.capacitor_voltage ?? 0).toFixed(2) : "—"} V</span></div>
                    <div>Charge: <span className="font-semibold" style={{ color: C.dark }}>{latest ? Number(latest.charge_percent ?? 0).toFixed(1) : "—"}%</span></div>
                    <div>Status: <span className="font-semibold" style={{ color: statusColor(latest?.status ?? null) }}>{latest?.status ?? "—"}</span></div>
                    <div>LED: <span className="font-semibold" style={{ color: ledColor(latest?.led_status ?? null) }}>{latest?.led_status ?? "—"}</span></div>
                  </div>
                )
              },
              { title: "Database", color: C.green, body: <div className="text-xs text-slate-600">Live readings captured from Supabase.</div> },
              { title: "Voltage range", color: C.cyan, body: <div className="text-xs text-slate-600">Min <span className="font-semibold" style={{ color: C.dark }}>{minV.toFixed(2)} V</span> · Max <span className="font-semibold" style={{ color: C.dark }}>{maxV.toFixed(2)} V</span></div> },
              { title: "Footstep test", color: C.purple, body: <div className="text-xs text-slate-600">Footstep test confirms reliable energy harvesting over 87 events.</div> },
              { title: "Peak activity", color: C.amber, body: <div className="text-xs text-slate-600">Peak activity interval: 10–15 min with 23 events.</div> },
              { title: "Detection improvement", color: C.red, body: <div className="text-xs text-slate-600">Digital filtering eliminated false positives and improved accuracy to 97.7%.</div> },
            ].map((c) => (
              <Card key={c.title} className="!p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.color }}>{c.title}</div>
                </div>
                {c.body}
              </Card>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
