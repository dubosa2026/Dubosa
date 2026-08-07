"""Logica central do assistente comercial: filtra a base exportada do BI e
distribui os clientes entre os vendedores de acordo com a UF de atuacao.

Regras (definidas junto com o usuario):
  1. Clientes com Categoria == "Ativo 30 dias" sao ignorados (nao entram na
     distribuicao) -- a base final e so para clientes inativos/dormentes.
  2. Para cada UF presente no mapeamento vendedor->UF:
       - 1 vendedor mapeado  -> todos os clientes daquela UF vao para ele.
       - 2+ vendedores       -> divisao o mais justa possivel (algoritmo
         guloso LPT: maior valor faturado primeiro, sempre para quem estiver
         com o menor total acumulado). Isso naturalmente cobre o caso de um
         unico vendedor, entao nao ha necessidade de um caminho especial.
  3. Linhas sem UF preenchida na planilha nao sao distribuidas.
  4. Linhas cuja UF representa "todas as UFs da foto" de uma vez (ex: conta
     nacional marcada como TODAS/NACIONAL/BR, ou contendo todas as UFs do
     mapeamento separadas por / , ;) sao divididas uma unica vez entre TODOS
     os vendedores do mapeamento (nao por UF individual).
  5. UFs presentes no arquivo mas que nao aparecem no mapeamento (ex: outras
     regioes do Brasil fora da equipe Norte) ficam fora de escopo: nao sao
     tocadas/distribuidas por este processo.
  6. Regra fixa de regiao: a equipe so prospecta a Regiao Norte (AC, AM, AP,
     PA, RO, RR, TO). Cliente de qualquer outra UF NUNCA e redistribuido,
     mesmo que alguem cadastre um vendedor para aquela UF -- ele permanece
     com o vendedor que ja o atende na coluna "Vendedor" da base.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pandas as pd

ACTIVE_30_LABEL_DEFAULT = "Ativo 30 dias"
ALL_UF_MARKERS = {"TODOS", "TODAS", "NACIONAL", "BR", "BRASIL"}
REGIAO_NORTE = frozenset({"AC", "AM", "AP", "PA", "RO", "RR", "TO"})
UF_SPLIT_RE = re.compile(r"[\/,;+]")

COL_UF = "UF"
COL_CATEGORIA = "Categoria"
COL_VENDEDOR_ATRIBUIDO = "Vendedor Atribuido"
COL_VENDEDOR_BI = "Vendedor"
COL_VALOR_FATURADO = "Valor Faturado"


def _norm(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    return text


def _norm_uf(value) -> str:
    return _norm(value).upper()


def load_export(path: str) -> pd.DataFrame:
    """Le a planilha exportada pela macro do BI e normaliza os nomes de coluna."""
    df = pd.read_excel(path)
    df.columns = [str(c).strip() for c in df.columns]
    df = df.reset_index(drop=True)
    df["_linha_original"] = df.index + 2  # +2 = cabecalho (1) + index 0-based
    return df


def load_vendor_map(path: str) -> pd.DataFrame:
    """Le config/vendedores.csv (Vendedor, UF, Email)."""
    vdf = pd.read_csv(path, dtype=str).fillna("")
    vdf["Vendedor"] = vdf["Vendedor"].map(_norm)
    vdf["UF"] = vdf["UF"].map(_norm_uf)
    vdf["Email"] = vdf["Email"].map(_norm)
    vdf = vdf[vdf["Vendedor"] != ""]
    return vdf.reset_index(drop=True)


def uf_to_vendedores(vendor_map: pd.DataFrame) -> dict[str, list[str]]:
    """UF -> vendedores. Linhas fora da Regiao Norte sao descartadas: a regra
    de regiao vale mesmo que alguem cadastre um vendedor para outra UF."""
    mapping: dict[str, list[str]] = {}
    for _, row in vendor_map.iterrows():
        if row["UF"] not in REGIAO_NORTE:
            continue
        mapping.setdefault(row["UF"], []).append(row["Vendedor"])
    return mapping


def filter_ativos_30_dias(
    df: pd.DataFrame,
    categoria_col: str = COL_CATEGORIA,
    active_label: str = ACTIVE_30_LABEL_DEFAULT,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Retorna (mantidos, excluidos_ativos_30_dias)."""
    categoria = df[categoria_col].map(_norm).str.casefold()
    mask_excluir = categoria == active_label.casefold()
    return df[~mask_excluir].copy(), df[mask_excluir].copy()


def _is_all_uf_marker(raw_value: str, todas_ufs: set[str]) -> bool:
    value = _norm_uf(raw_value)
    if not value:
        return False
    if value in ALL_UF_MARKERS:
        return True
    partes = {p.strip() for p in UF_SPLIT_RE.split(value) if p.strip()}
    return len(partes) > 1 and partes >= todas_ufs


def fair_split(
    clientes: pd.DataFrame,
    vendedores: list[str],
    metodo: str = "quantidade",
    weight_col: str = COL_VALOR_FATURADO,
    order_col: str = "Integrador (CLI - Nome)",
) -> pd.Series:
    """Divisao o mais justa possivel entre `vendedores`.

    metodo="quantidade" (padrao): rodizio simples -- cada vendedor recebe o
    mesmo numero de clientes, diferenca maxima de 1 quando a conta nao é
    exata. Ordem deterministica pelo nome do cliente (`order_col`), para que
    reexecucoes com a mesma base sempre produzam o mesmo resultado.

    metodo="valor": guloso LPT -- ordena por `weight_col` (maior primeiro) e
    sempre entrega ao vendedor com menor total acumulado, equilibrando o
    faturado total por vendedor em vez da quantidade de clientes.

    Em ambos os casos, com um unico vendedor em `vendedores` todos os
    clientes vao para ele -- cobre o caso "so tem um vendedor na UF" sem
    precisar de um caminho especial.
    """
    if clientes.empty or not vendedores:
        return pd.Series(index=clientes.index, dtype=object)

    if metodo == "valor":
        pesos = pd.to_numeric(clientes[weight_col], errors="coerce").fillna(0.0)
        ordem = pesos.sort_values(ascending=False, kind="mergesort").index
        totais = {v: 0.0 for v in vendedores}
        contagens = {v: 0 for v in vendedores}
        atribuicao = {}
        for idx in ordem:
            escolhido = min(vendedores, key=lambda v: (totais[v], contagens[v], v))
            atribuicao[idx] = escolhido
            totais[escolhido] += float(pesos.loc[idx])
            contagens[escolhido] += 1
        return pd.Series(atribuicao).reindex(clientes.index)

    if metodo != "quantidade":
        raise ValueError(f"metodo desconhecido: {metodo!r} (use 'quantidade' ou 'valor')")

    ordem = clientes[order_col].map(_norm).sort_values(kind="mergesort").index
    vendedores_ordenados = sorted(vendedores)
    atribuicao = {
        idx: vendedores_ordenados[posicao % len(vendedores_ordenados)]
        for posicao, idx in enumerate(ordem)
    }
    return pd.Series(atribuicao).reindex(clientes.index)


@dataclass
class DistributionResult:
    atribuidos: pd.DataFrame
    sem_uf: pd.DataFrame
    fora_do_escopo: pd.DataFrame
    excluidos_ativos_30: pd.DataFrame
    resumo: pd.DataFrame
    vendor_map: pd.DataFrame = field(repr=False)


def distribute(
    export_df: pd.DataFrame,
    vendor_map: pd.DataFrame,
    uf_col: str = COL_UF,
    categoria_col: str = COL_CATEGORIA,
    weight_col: str = COL_VALOR_FATURADO,
    active_label: str = ACTIVE_30_LABEL_DEFAULT,
    metodo: str = "quantidade",
) -> DistributionResult:
    mantidos, excluidos_ativos_30 = filter_ativos_30_dias(
        export_df, categoria_col=categoria_col, active_label=active_label
    )

    uf_map = uf_to_vendedores(vendor_map)
    todas_as_vendedores = sorted({v for vs in uf_map.values() for v in vs})
    todas_ufs = set(uf_map.keys())

    uf_normalizada = mantidos[uf_col].map(_norm_uf)

    mask_sem_uf = uf_normalizada == ""
    mask_all_uf = uf_normalizada.map(lambda v: _is_all_uf_marker(v, todas_ufs)) & ~mask_sem_uf
    mask_mapeada = uf_normalizada.isin(todas_ufs) & ~mask_all_uf & ~mask_sem_uf
    mask_fora_escopo = ~mask_sem_uf & ~mask_all_uf & ~mask_mapeada

    sem_uf = mantidos[mask_sem_uf].copy()
    fora_do_escopo = mantidos[mask_fora_escopo].copy()

    partes_atribuidas = []

    # 1) divisao "todas as UFs de uma vez" -> uma unica rodada entre TODOS os vendedores
    bloco_all = mantidos[mask_all_uf]
    if not bloco_all.empty:
        atrib = fair_split(bloco_all, todas_as_vendedores, metodo=metodo, weight_col=weight_col)
        bloco = bloco_all.copy()
        bloco[COL_VENDEDOR_ATRIBUIDO] = atrib
        partes_atribuidas.append(bloco)

    # 2) divisao por UF (1 vendedor = tudo pra ele; 2+ = fair_split cuida)
    bloco_mapeado = mantidos[mask_mapeada]
    for uf, vendedores_uf in uf_map.items():
        grupo = bloco_mapeado[uf_normalizada.loc[bloco_mapeado.index] == uf]
        if grupo.empty:
            continue
        atrib = fair_split(grupo, vendedores_uf, metodo=metodo, weight_col=weight_col)
        bloco = grupo.copy()
        bloco[COL_VENDEDOR_ATRIBUIDO] = atrib
        partes_atribuidas.append(bloco)

    if partes_atribuidas:
        atribuidos = pd.concat(partes_atribuidas).sort_index()
    else:
        atribuidos = mantidos.iloc[0:0].copy()
        atribuidos[COL_VENDEDOR_ATRIBUIDO] = pd.Series(dtype=object)

    resumo = (
        atribuidos.groupby(COL_VENDEDOR_ATRIBUIDO)
        .agg(
            qtde_clientes=(COL_VENDEDOR_ATRIBUIDO, "count"),
            valor_faturado_total=(weight_col, lambda s: pd.to_numeric(s, errors="coerce").fillna(0).sum()),
        )
        .reindex(todas_as_vendedores, fill_value=0)
        .reset_index()
        .rename(columns={COL_VENDEDOR_ATRIBUIDO: "Vendedor"})
    )
    resumo = resumo.merge(vendor_map[["Vendedor", "UF"]], on="Vendedor", how="left")
    resumo = resumo[["Vendedor", "UF", "qtde_clientes", "valor_faturado_total"]]

    return DistributionResult(
        atribuidos=atribuidos,
        sem_uf=sem_uf,
        fora_do_escopo=fora_do_escopo,
        excluidos_ativos_30=excluidos_ativos_30,
        resumo=resumo,
        vendor_map=vendor_map,
    )
