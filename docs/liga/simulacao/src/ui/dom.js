/** Utilitários mínimos de DOM. Sem framework, sem build, sem dependência. */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'line', 'rect', 'circle', 'text', 'polyline', 'polygon',
  'defs', 'linearGradient', 'stop', 'clipPath', 'tspan',
]);

/**
 * h('div', { class: 'x', onclick: fn }, filho1, filho2)
 * Atributos especiais: `class`, `text`, `html`, `dataset`, `style` (objeto),
 * `on<evento>`.
 */
export function h(tag, props = {}, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }

  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  node.append(...children.flat(Infinity).filter(Boolean));
  return node;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** Copia texto para a área de transferência, com alternativa para http/file. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  }
}

/** Dispara o download de um arquivo gerado no próprio navegador. */
export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
