// Login por usuário: "eduardo" vira eduardo@nossacasa.app por baixo dos panos
// (o Supabase trabalha com e-mail). Quem preferir pode digitar um e-mail de verdade.
const DOMAIN = 'nossacasa.app';

export function toLoginEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (v.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
  const slug = v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
  return slug.length >= 3 ? `${slug}@${DOMAIN}` : null;
}

export function displayUser(email: string | null): string {
  if (!email) return '';
  return email.endsWith(`@${DOMAIN}`) ? email.slice(0, -DOMAIN.length - 1) : email;
}
