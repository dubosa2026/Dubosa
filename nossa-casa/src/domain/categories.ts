import type { CategoryId, Priority, Effort } from './types';

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  emoji: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'limpeza', label: 'Limpeza', emoji: '🧹' },
  { id: 'roupas', label: 'Roupas', emoji: '👕' },
  { id: 'cozinha', label: 'Cozinha', emoji: '🍳' },
  { id: 'lavanderia', label: 'Lavanderia', emoji: '🧺' },
  { id: 'criancas', label: 'Crianças', emoji: '🧸' },
  { id: 'escola', label: 'Escola', emoji: '📚' },
  { id: 'plantas', label: 'Plantas', emoji: '🌱' },
  { id: 'sapatos', label: 'Sapatos', emoji: '👟' },
  { id: 'mercado', label: 'Mercado', emoji: '🛒' },
  { id: 'organizacao', label: 'Organização', emoji: '🏠' },
  { id: 'familia', label: 'Família', emoji: '❤️' },
  { id: 'quartos', label: 'Quartos', emoji: '🛏' },
  { id: 'banheiro', label: 'Banheiro', emoji: '🚿' },
  { id: 'sala', label: 'Sala', emoji: '🛋' },
  { id: 'sacada', label: 'Sacada', emoji: '🌿' },
  { id: 'geral', label: 'Geral', emoji: '📦' },
  { id: 'cobertura', label: 'Cobertura das crianças', emoji: '🤝' },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function category(id: CategoryId): CategoryInfo {
  return byId.get(id) ?? { id, label: id, emoji: '📦' };
}

export const PRIORITY_INFO: Record<Priority, { label: string; emoji: string; order: number }> = {
  high: { label: 'Alta prioridade', emoji: '🔴', order: 0 },
  medium: { label: 'Média prioridade', emoji: '🟡', order: 1 },
  low: { label: 'Baixa prioridade', emoji: '🟢', order: 2 },
};

export const EFFORT_INFO: Record<Effort, { label: string; factor: number }> = {
  1: { label: 'Leve', factor: 1.0 },
  2: { label: 'Médio', factor: 1.2 },
  3: { label: 'Pesado', factor: 1.45 },
};

export const MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
