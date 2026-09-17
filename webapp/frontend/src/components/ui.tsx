import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-5 ${className}`}>{children}</div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const subColor = tone === "success" ? "text-success-600" : tone === "danger" ? "text-danger-600" : "text-gray-500";
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className={`mt-1 text-xs font-medium ${subColor}`}>{sub}</div>}
    </Card>
  );
}

const LEVEL_STYLES: Record<string, { bg: string; border: string; emoji: string; label: string }> = {
  ATENCAO: { bg: "bg-danger-50", border: "border-danger-500", emoji: "🔴", label: "Atenção" },
  OPORTUNIDADE: { bg: "bg-warning-50", border: "border-warning-500", emoji: "🟡", label: "Oportunidade" },
  DESTAQUE: { bg: "bg-success-50", border: "border-success-500", emoji: "🟢", label: "Destaque" },
  INFORMACAO: { bg: "bg-info-50", border: "border-info-500", emoji: "🔵", label: "Informação" },
};

export function AlertBadge({ level }: { level: string }) {
  const s = LEVEL_STYLES[level] ?? LEVEL_STYLES.INFORMACAO;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
      {s.emoji} {s.label}
    </span>
  );
}

export function alertStyles(level: string) {
  return LEVEL_STYLES[level] ?? LEVEL_STYLES.INFORMACAO;
}

const HEALTH_STYLES: Record<string, { emoji: string; label: string; color: string }> = {
  SAUDAVEL: { emoji: "🟢", label: "Saudável", color: "text-success-600" },
  ATENCAO: { emoji: "🟡", label: "Atenção", color: "text-warning-600" },
  RISCO: { emoji: "🟠", label: "Risco", color: "text-orange-600" },
  ALTO_RISCO: { emoji: "🔴", label: "Alto risco", color: "text-danger-600" },
};

export function HealthBadge({ status }: { status: string }) {
  const s = HEALTH_STYLES[status] ?? HEALTH_STYLES.SAUDAVEL;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.color}`}>
      {s.emoji} {s.label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
    ghost: "text-brand-600 hover:bg-brand-50",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-sm text-gray-500 py-8 text-center">{message}</div>;
}

export function LoadingState() {
  return <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>;
}
