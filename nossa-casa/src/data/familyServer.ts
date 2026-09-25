// Servidor (Supabase) da família, embutido no APK: com isto preenchido, ninguém
// precisa colar endereço nem chave no celular — é instalar, criar usuário e usar.
//
// A chave "anon"/"publishable" é pública por natureza (vai dentro de qualquer app
// que usa Supabase). Quem protege os dados é o login + as regras do banco (RLS):
// só Eduardo e Jussara, depois de entrarem na casa, enxergam alguma coisa.
export const FAMILY_SERVER = {
  url: '',
  anonKey: '',
};
