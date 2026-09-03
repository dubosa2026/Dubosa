import { PendingSource } from './PendingSource.js';
import { DemoSource } from './DemoSource.js';
import { HttpJsonSource } from './HttpJsonSource.js';
import { LigaApiSource } from './LigaApiSource.js';

/**
 * REGISTRO DE ADAPTADORES
 * =======================
 *
 * Ponto único de extensão da camada de dados. Para conectar a base real no
 * futuro:
 *
 *   1. crie `src/data/sources/MinhaFonte.js` estendendo `DataSource`;
 *   2. registre aqui com `registerSource(MinhaFonte)`;
 *   3. aponte `dataSource.adapter` em `config/app.config.json` para o id dela.
 *
 * Nenhuma tela, cálculo ou regra de permissão precisa ser alterada.
 */

const registry = new Map();

export function registerSource(SourceClass) {
  if (!SourceClass?.id) throw new Error('Adaptador precisa de um `static id`.');
  registry.set(SourceClass.id, SourceClass);
  return SourceClass;
}

export function listSources() {
  return [...registry.values()].map((S) => ({ id: S.id, label: S.label }));
}

export function createSource(id, options = {}) {
  const SourceClass = registry.get(id) ?? PendingSource;
  return new SourceClass(options);
}

registerSource(PendingSource);
registerSource(DemoSource);
registerSource(HttpJsonSource);
registerSource(LigaApiSource);
