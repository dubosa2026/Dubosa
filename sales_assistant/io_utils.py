"""Geracao dos arquivos de saida: planilha consolidada (visao do admin) e uma
planilha por vendedor (o arquivo ja tratado que cada um recebe)."""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from sales_assistant.distribute import COL_VENDEDOR_ATRIBUIDO, DistributionResult

INTERNAL_COLS = ["_linha_original"]

VENDOR_FILE_COLUMN_ORDER = [
    "UF",
    "Cidade",
    "Integrador (CLI - Nome)",
    "Telefone",
    "E-mail",
    "Categoria",
    "Última Nota",
    "Qtde. Pedidos",
    "Valor Faturado",
    "Gerente",
]


def _drop_internal(df: pd.DataFrame) -> pd.DataFrame:
    return df.drop(columns=[c for c in INTERNAL_COLS if c in df.columns])


def _sanitize_filename(name: str) -> str:
    name = re.sub(r'[\\/*?:"<>|]', "-", name).strip()
    return re.sub(r"\s+", " ", name)


def _reorder_for_vendor(df: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in VENDOR_FILE_COLUMN_ORDER if c in df.columns]
    resto = [c for c in df.columns if c not in cols and c != COL_VENDEDOR_ATRIBUIDO]
    return df[cols + resto]


def write_master_workbook(result: DistributionResult, out_path: str | Path) -> Path:
    """Planilha unica para o admin: resumo + todas as abas de auditoria."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        result.resumo.to_excel(writer, sheet_name="Resumo", index=False)
        _drop_internal(result.atribuidos).to_excel(writer, sheet_name="Distribuido", index=False)
        _drop_internal(result.sem_uf).to_excel(writer, sheet_name="Sem UF (nao distribuido)", index=False)
        _drop_internal(result.fora_do_escopo).to_excel(writer, sheet_name="Fora do escopo (outra UF)", index=False)
        _drop_internal(result.excluidos_ativos_30).to_excel(writer, sheet_name="Excluidos - Ativo 30 dias", index=False)

    return out_path


def write_vendor_files(result: DistributionResult, output_dir: str | Path) -> dict[str, Path]:
    """Um arquivo .xlsx por vendedor em output_dir/<UF>/<vendedor>.xlsx.

    Vendedores sem nenhum cliente atribuido nesta rodada ainda recebem um
    arquivo (so com cabecalho), para deixar claro que o processo rodou e nao
    esqueceu ninguem.
    """
    output_dir = Path(output_dir)
    atribuidos = _drop_internal(result.atribuidos)
    caminhos: dict[str, Path] = {}

    for _, linha in result.vendor_map.iterrows():
        vendedor = linha["Vendedor"]
        uf = linha["UF"]
        clientes = atribuidos[atribuidos[COL_VENDEDOR_ATRIBUIDO] == vendedor].drop(
            columns=[COL_VENDEDOR_ATRIBUIDO]
        )
        clientes = _reorder_for_vendor(clientes)

        pasta_uf = output_dir / uf
        pasta_uf.mkdir(parents=True, exist_ok=True)
        destino = pasta_uf / f"{_sanitize_filename(vendedor)}.xlsx"

        with pd.ExcelWriter(destino, engine="openpyxl") as writer:
            clientes.to_excel(writer, sheet_name="Clientes", index=False)

        caminhos[vendedor] = destino

    return caminhos
