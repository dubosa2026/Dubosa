import { h } from '../dom.js';

/** Tela de entrada — pede o token pessoal quando o link não o traz. */
export function loginView({ app, error = null, roster }) {
  const input = h('input', {
    class: 'input input-token',
    type: 'text',
    placeholder: 'XXXX-XXXX-XXXX',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Seu código de acesso',
  });

  const submit = () => app.login(input.value);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  const semCadastro = !roster?.manager && !(roster?.sellers ?? []).length;

  return h('div', { class: 'view view-login' },
    h('div', { class: 'login-card' },
      h('div', { class: 'login-logo', 'aria-hidden': 'true', text: '🏆' }),
      h('h1', { class: 'login-title', text: 'Liga Comercial' }),
      h('p', { class: 'login-sub', text: 'Cada pessoa entra pelo próprio link. Você verá apenas os seus resultados.' }),
      error ? h('div', { class: 'alert alert-error', text: error }) : null,
      h('label', { class: 'field' },
        h('span', { class: 'field-label', text: 'Código de acesso' }),
        input),
      h('button', { class: 'btn btn-primary btn-block', onclick: submit, text: 'Entrar' }),
      semCadastro
        ? h('div', { class: 'login-first-run' },
          h('p', { class: 'muted', text: 'Nenhum acesso cadastrado ainda neste aplicativo.' }),
          h('button', {
            class: 'btn btn-block',
            onclick: () => app.startFirstRun(),
            text: 'Configurar como gestor',
          }))
        : null,
      h('p', { class: 'login-note' },
        h('span', { 'aria-hidden': 'true', text: '🔒' }),
        'O ranking nominal da equipe não existe no aplicativo do vendedor. Você vê sua posição e a distância para a próxima — nunca quem está nela.')));
}
