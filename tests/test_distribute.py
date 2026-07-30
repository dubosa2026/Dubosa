import pandas as pd
import pytest

from sales_assistant.distribute import (
    COL_VENDEDOR_ATRIBUIDO,
    distribute,
    filter_ativos_30_dias,
)

VENDOR_MAP = pd.DataFrame(
    [
        {"Vendedor": "ALICE", "UF": "AC", "Email": "alice@ex.com"},
        {"Vendedor": "BEATRIZ", "UF": "AC", "Email": ""},
        {"Vendedor": "CARLOS", "UF": "AP", "Email": ""},  # unico vendedor da UF
        {"Vendedor": "DAIANE", "UF": "PA", "Email": ""},
        {"Vendedor": "EDUARDO", "UF": "PA", "Email": ""},
        {"Vendedor": "FELIPE", "UF": "PA", "Email": ""},
    ]
)


def make_export(rows):
    base_cols = ["UF", "Categoria", "Integrador (CLI - Nome)", "Valor Faturado"]
    df = pd.DataFrame(rows, columns=base_cols)
    df["_linha_original"] = range(2, len(df) + 2)
    return df


def test_filter_ativos_30_dias_exclui_apenas_o_rotulo_exato():
    df = make_export(
        [
            ("AC", "Ativo 30 dias", "CLI-1", 100),
            ("AC", "Ativo 60 dias", "CLI-2", 100),
            ("AC", "Inativo", "CLI-3", 100),
            ("AC", "ativo 30 dias", "CLI-4", 100),  # case-insensitive
        ]
    )
    mantidos, excluidos = filter_ativos_30_dias(df)
    assert len(excluidos) == 2
    assert len(mantidos) == 2
    assert set(mantidos["Integrador (CLI - Nome)"]) == {"CLI-2", "CLI-3"}


def test_uf_com_um_unico_vendedor_recebe_tudo():
    df = make_export([("AP", "Inativo", f"CLI-{i}", 10) for i in range(5)])
    resultado = distribute(df, VENDOR_MAP)
    assert (resultado.atribuidos[COL_VENDEDOR_ATRIBUIDO] == "CARLOS").all()
    assert len(resultado.atribuidos) == 5


def test_divisao_por_quantidade_fica_equilibrada():
    df = make_export([("PA", "Inativo", f"CLI-{i:03d}", i) for i in range(10)])
    resultado = distribute(df, VENDOR_MAP, metodo="quantidade")
    contagens = resultado.atribuidos[COL_VENDEDOR_ATRIBUIDO].value_counts()
    assert set(contagens.index) == {"DAIANE", "EDUARDO", "FELIPE"}
    assert contagens.max() - contagens.min() <= 1
    assert contagens.sum() == 10


def test_divisao_por_valor_equilibra_o_total_faturado():
    valores = [1000, 900, 100, 90, 10, 5]
    df = make_export([("PA", "Inativo", f"CLI-{i}", v) for i, v in enumerate(valores)])
    resultado = distribute(df, VENDOR_MAP, metodo="valor")
    totais = resultado.atribuidos.groupby(COL_VENDEDOR_ATRIBUIDO)["Valor Faturado"].sum()
    assert totais.max() - totais.min() <= max(valores)


def test_linha_sem_uf_nao_e_distribuida():
    df = make_export(
        [
            ("AC", "Inativo", "CLI-1", 10),
            ("", "Inativo", "CLI-2", 10),
            (None, "Inativo", "CLI-3", 10),
        ]
    )
    resultado = distribute(df, VENDOR_MAP)
    assert len(resultado.sem_uf) == 2
    assert len(resultado.atribuidos) == 1
    assert COL_VENDEDOR_ATRIBUIDO not in resultado.sem_uf.columns or resultado.sem_uf[COL_VENDEDOR_ATRIBUIDO].isna().all()


def test_uf_fora_do_mapeamento_fica_fora_do_escopo():
    df = make_export([("SP", "Inativo", "CLI-1", 10), ("AC", "Inativo", "CLI-2", 10)])
    resultado = distribute(df, VENDOR_MAP)
    assert len(resultado.fora_do_escopo) == 1
    assert resultado.fora_do_escopo.iloc[0]["UF"] == "SP"
    assert len(resultado.atribuidos) == 1


@pytest.mark.parametrize("marcador", ["TODAS", "todos", "AC/AP/PA", "AC, AP, PA"])
def test_marcador_todas_as_uf_divide_uma_vez_entre_todos(marcador):
    df = make_export([(marcador, "Inativo", f"CLI-{i}", i) for i in range(6)])
    resultado = distribute(df, VENDOR_MAP)
    vendedores_usados = set(resultado.atribuidos[COL_VENDEDOR_ATRIBUIDO])
    assert vendedores_usados <= {"ALICE", "BEATRIZ", "CARLOS", "DAIANE", "EDUARDO", "FELIPE"}
    assert len(resultado.atribuidos) == 6
    assert resultado.fora_do_escopo.empty
    assert resultado.sem_uf.empty


def test_resumo_inclui_todos_os_vendedores_mesmo_sem_cliente():
    df = make_export([("AP", "Inativo", "CLI-1", 10)])
    resultado = distribute(df, VENDOR_MAP)
    assert set(resultado.resumo["Vendedor"]) == set(VENDOR_MAP["Vendedor"])
    zerados = resultado.resumo[resultado.resumo["Vendedor"] != "CARLOS"]
    assert (zerados["qtde_clientes"] == 0).all()
