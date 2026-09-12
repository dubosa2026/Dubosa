import { DataSource, emptyDay } from '../DataSource.js';
import { toRecords, DEFAULT_FIELD_MAP } from '../types.js';
import { nowInTimezone } from '../../core/clock.js';

/**
 * PLANILHA DO GOOGLE PUBLICADA
 * ============================
 *
 * O caminho mais simples que existe para a equipe inteira ver o mesmo placar
 * sem servidor, sem senha e sem arquivo para subir: uma planilha publicada na
 * web em formato CSV.
 *
 * O gestor cola a produção na planilha; o aplicativo de cada vendedor lê a
 * mesma planilha sozinho, a cada atualização. Nada precisa ser enviado ao
 * repositório, e ninguém precisa gerar token nenhum.
 *
 * Por que funciona onde o resto esbarra: o Google serve a planilha publicada
 * com permissão de leitura para qualquer origem, então o navegador do vendedor
 * consegue lê-la — o problema de CORS que trava a leitura direta do sistema de
 * pedidos não existe aqui.
 *
 * Colunas esperadas (a ordem não importa, o nome sim):
 *
 *   Nome | Data | Horário | Pedidos | Faturamento
 *
 * Data e Horário são opcionais: sem eles, a leitura vale para o dia de hoje no
 * horário da consulta — mas aí não há curva, só o instante. Com eles, cada
 * bloco de linhas colado ao longo do dia vira um ponto da curva, e ritmo,
 * projeção e comparação com ontem passam a existir de verdade.
 *
 * LIMITE, dito com todas as letras: uma planilha publicada é pública para quem
 * tiver o link dela. Ela não deve conter nada além de nome, data, horário,
 * pedidos e faturamento — e o link não deve ser divulgado. A privacidade que o
 * aplicativo garante é a de um vendedor não ver o outro DENTRO do aplicativo.
 */
export class SheetSource extends DataSource {
  static id = 'planilha';

  static label = 'Planilha do Google publicada';

  constructor(options = {}) {
    super(options);
    this.url = options.url ?? '';
    this.timezone = options.timezone ?? 'America/Sao_Paulo';
    this.fieldMap = { ...DEFAULT_FIELD_MAP, ...(options.fieldMap ?? {}) };
  }

  get semantics() {
    return 'cumulative';
  }

  get isConnected() {
    return Boolean(this.url);
  }

  get capabilities() {
    return { scopedRanking: false };
  }

  /**
   * Aceita o link normal da planilha e converte para o endereço de CSV.
   * O gestor cola o que tiver na mão; o aplicativo se vira.
   */
  static normalizarUrl(url) {
    const bruto = String(url ?? '').trim();
    if (!bruto) return '';

    // Já é um endereço de exportação
    if (/output=csv|\/export\?/i.test(bruto)) return bruto;

    // Link publicado: .../d/e/2PACX-.../pubhtml  ->  .../pub?output=csv
    const publicado = bruto.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pub/i);
    if (publicado) return `${publicado[1]}/pub?output=csv`;

    // Link normal de edição: .../d/<id>/edit#gid=0  ->  .../export?format=csv&gid=0
    const normal = bruto.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+)/i);
    if (normal) {
      const gid = bruto.match(/[#&?]gid=(\d+)/);
      return `${normal[1]}/export?format=csv${gid ? `&gid=${gid[1]}` : ''}`;
    }

    return bruto;
  }

  async fetchDay(date) {
    const url = SheetSource.normalizarUrl(this.url);
    if (!url) {
      return emptyDay(date, { status: 'awaiting_source', message: 'Link da planilha não configurado.' });
    }

    let texto;
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        return emptyDay(date, {
          status: 'error',
          message: res.status === 404
            ? 'A planilha não foi encontrada. Confira se ela está publicada na web.'
            : `A planilha respondeu ${res.status}. Ela precisa estar publicada na web para poder ser lida.`,
        });
      }
      texto = await res.text();
    } catch (err) {
      return emptyDay(date, {
        status: 'error',
        message: 'Não consegui ler a planilha. Confira o link e se ela está publicada na web. '
          + `Detalhe: ${err.message}`,
      });
    }

    if (/^\s*</.test(texto)) {
      return emptyDay(date, {
        status: 'error',
        message: 'O link devolveu uma página, não os dados. Use Arquivo → Compartilhar → '
          + 'Publicar na web, e escolha o formato CSV.',
      });
    }

    return this.parse(texto, date);
  }

  /** Converte o CSV em registros do dia pedido. */
  parse(texto, date) {
    const linhas = parseCsv(texto);
    if (linhas.length < 2) {
      return emptyDay(date, { status: 'awaiting_source', message: 'A planilha está vazia.' });
    }

    const cabecalho = linhas[0].map((c) => String(c).trim());
    const objetos = linhas.slice(1)
      .filter((l) => l.some((c) => String(c).trim() !== ''))
      .map((l) => Object.fromEntries(cabecalho.map((nome, i) => [nome, l[i] ?? ''])));

    const agora = nowInTimezone(this.timezone);
    const temData = cabecalho.some((c) => /^(data|dia|date)$/i.test(c));
    const temHora = cabecalho.some((c) => /^(hor[aá]rio|hora|time)$/i.test(c));

    const preparadas = objetos.map((o) => ({
      ...o,
      ...(temData ? {} : { __data: date }),
      ...(temHora ? {} : { __hora: agora.time }),
    }));

    const fieldMap = {
      ...this.fieldMap,
      date: temData ? this.fieldMap.date : ['__data'],
      time: temHora ? this.fieldMap.time : ['__hora'],
    };

    const { records, errors } = toRecords(preparadas, { fieldMap });
    const doDia = records.filter((r) => r.date === date);

    if (!doDia.length) {
      return emptyDay(date, {
        status: 'awaiting_source',
        message: records.length
          ? 'A planilha tem dados, mas nenhum para este dia.'
          : 'Não consegui ler nenhuma linha. Confira os nomes das colunas: Nome, Data, Horário, Pedidos, Faturamento.',
        meta: { totalNaPlanilha: records.length, errors: errors.slice(0, 5), colunas: cabecalho },
      });
    }

    return {
      status: 'ready',
      records: doDia,
      semantics: 'cumulative',
      date,
      fetchedAt: new Date().toISOString(),
      message: null,
      meta: {
        planilha: true,
        totalNaPlanilha: records.length,
        doDia: doDia.length,
        ignoradas: errors.length,
        colunas: cabecalho,
      },
    };
  }

  async health() {
    return {
      ok: this.isConnected,
      label: SheetSource.label,
      detail: this.isConnected
        ? 'Lendo a planilha publicada. Cada atualização do aplicativo relê a planilha — '
          + 'o que você colar nela aparece para a equipe inteira, sem enviar nada.'
        : 'Link da planilha ainda não informado.',
    };
  }
}

/**
 * Leitor de CSV que aguenta o que o Google produz: aspas, vírgula dentro de
 * campo, quebra de linha dentro de campo e ponto e vírgula como separador.
 */
export function parseCsv(texto) {
  const conteudo = String(texto ?? '').replace(/^﻿/, '');
  const separador = escolherSeparador(conteudo);

  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroDeAspas = false;

  for (let i = 0; i < conteudo.length; i += 1) {
    const c = conteudo[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (conteudo[i + 1] === '"') { campo += '"'; i += 1; } else { dentroDeAspas = false; }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') { dentroDeAspas = true; continue; }
    if (c === separador) { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }

  return linhas;
}

/** Google exporta com vírgula; planilha brasileira salva com ponto e vírgula. */
function escolherSeparador(conteudo) {
  const primeira = conteudo.slice(0, conteudo.indexOf('\n') + 1 || 400);
  const virgulas = (primeira.match(/,/g) ?? []).length;
  const pontoVirgula = (primeira.match(/;/g) ?? []).length;
  return pontoVirgula > virgulas ? ';' : ',';
}
