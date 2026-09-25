// Servidor (Supabase) da família, embutido no APK: ninguém precisa colar endereço
// nem chave no celular — é instalar, criar usuário e usar.
//
// A chave "publishable" é pública por natureza (vai dentro de qualquer app que usa
// Supabase). Quem protege os dados é o login + as regras do banco (RLS): só Eduardo
// e Jussara, depois de entrarem na casa, enxergam alguma coisa.
export const FAMILY_SERVER = {
  url: 'https://gvauairzxqfpynvvymgp.supabase.co',
  anonKey: 'sb_publishable_2uSfNLAV77x607QrB-FSKw_Tb_gU2hL',
};
