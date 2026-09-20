import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Hash de senha simples (scrypt) para autenticação local no V1. */
export function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(senha: string, senhaHash: string): boolean {
  const [salt, hash] = senhaHash.split(":");
  if (!salt || !hash) return false;
  const hashTentativa = scryptSync(senha, salt, 64);
  const hashArmazenado = Buffer.from(hash, "hex");
  if (hashTentativa.length !== hashArmazenado.length) return false;
  return timingSafeEqual(hashTentativa, hashArmazenado);
}
