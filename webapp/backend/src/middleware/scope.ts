import { prisma } from "../prisma.js";
import type { AuthUser } from "./auth.js";

/**
 * Regras de escopo de dados por papel (seção 3 do briefing):
 * - ADMIN: vê tudo.
 * - GERENTE: vê os vendedores das equipes que gerencia.
 * - SUPERVISOR: vê os vendedores da(s) equipe(s) em que atua.
 * - VENDEDOR: vê apenas a própria carteira.
 *
 * Retorna a lista de IDs de vendedores visíveis pelo usuário autenticado,
 * ou `null` quando o usuário pode ver todos (ADMIN).
 */
export async function visibleVendorIds(user: AuthUser): Promise<string[] | null> {
  if (user.role === "ADMIN") return null;

  if (user.role === "VENDEDOR") return [user.id];

  if (user.role === "GERENTE") {
    const teams = await prisma.team.findMany({
      where: { managerId: user.id },
      include: { members: true },
    });
    const ids = teams.flatMap((t) => t.members.map((m) => m.id));
    return ids.length ? ids : [user.id];
  }

  // SUPERVISOR: mesma equipe(s) que o usuário integra
  if (!user.teamId) return [user.id];
  const peers = await prisma.user.findMany({
    where: { teamId: user.teamId, role: "VENDEDOR" },
    select: { id: true },
  });
  return peers.map((p) => p.id);
}
