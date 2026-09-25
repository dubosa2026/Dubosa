// Missões das crianças: ⭐ pontos, 🏆 conquistas e 🎯 meta semanal.
// Só para as crianças (e opcional). Nunca compara os adultos.
import { addDays, weekDates } from './dates';
import type { ISODate, Member, TaskInstance } from './types';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
}

export interface ChildProgress {
  child: Member;
  totalPoints: number;
  weekPoints: number;
  weekGoal: number;
  goalReached: boolean;
  missionsDone: number;
  streakDays: number;
  achievements: Achievement[];
}

export function childProgress(child: Member, instances: TaskInstance[], today: ISODate, weekStart: ISODate, weekGoal: number): ChildProgress {
  const mine = instances.filter((i) => i.kind === 'mission' && !i.deleted && i.assignee_ids.includes(child.id));
  const done = mine.filter((i) => i.status === 'done');
  const week = new Set(weekDates(weekStart));
  const totalPoints = done.reduce((s, i) => s + (i.points || 1), 0);
  const weekPoints = done.filter((i) => week.has(i.date)).reduce((s, i) => s + (i.points || 1), 0);

  const doneDays = new Set(done.map((i) => i.date));
  let streakDays = 0;
  let d = doneDays.has(today) ? today : addDays(today, -1);
  while (doneDays.has(d)) {
    streakDays++;
    d = addDays(d, -1);
  }
  const homework = done.filter((i) => i.category === 'escola').length;
  const tidy = done.filter((i) => /brinquedo|livro|objeto|sapato/i.test(i.title)).length;
  const achievements: Achievement[] = [
    { id: 'first', emoji: '🌟', title: 'Primeira missão', description: 'Concluiu a primeira missão.', earned: done.length >= 1 },
    { id: 'ten', emoji: '🚀', title: '10 missões', description: 'Concluiu 10 missões.', earned: done.length >= 10 },
    { id: 'fifty', emoji: '🦸', title: 'Super ajudante', description: 'Concluiu 50 missões.', earned: done.length >= 50 },
    { id: 'streak3', emoji: '🔥', title: '3 dias seguidos', description: 'Fez missões 3 dias seguidos.', earned: streakDays >= 3 },
    { id: 'streak7', emoji: '🏅', title: 'Semana completa', description: 'Fez missões 7 dias seguidos.', earned: streakDays >= 7 },
    { id: 'tidy', emoji: '🧸', title: 'Guardião dos brinquedos', description: 'Guardou as coisas 15 vezes.', earned: tidy >= 15 },
    { id: 'school', emoji: '📚', title: 'Estudante dedicada', description: 'Fez a lição 4 vezes.', earned: homework >= 4 },
    { id: 'goal', emoji: '🎯', title: 'Meta da semana', description: 'Alcançou a meta semanal de pontos.', earned: weekGoal > 0 && weekPoints >= weekGoal },
  ];
  return {
    child,
    totalPoints,
    weekPoints,
    weekGoal,
    goalReached: weekGoal > 0 && weekPoints >= weekGoal,
    missionsDone: done.length,
    streakDays,
    achievements,
  };
}
