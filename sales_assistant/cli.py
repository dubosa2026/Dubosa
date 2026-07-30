"""Linha de comando do assistente comercial.

Uso:
    python -m sales_assistant.cli distribute --input export.xlsx --output out/
    python -m sales_assistant.cli sync --input export.xlsx --output out/ \\
        --credentials service_account.json --drive-folder-id <ID_DA_PASTA_RAIZ>
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from sales_assistant.distribute import ACTIVE_30_LABEL_DEFAULT, distribute, load_export, load_vendor_map
from sales_assistant.io_utils import write_master_workbook, write_vendor_files

DEFAULT_VENDOR_MAP = "config/vendedores.csv"


def _run_distribution(args) -> tuple:
    export_df = load_export(args.input)
    vendor_map = load_vendor_map(args.vendor_map)
    resultado = distribute(
        export_df,
        vendor_map,
        active_label=args.active_label,
        metodo=args.metodo,
    )

    master_path = write_master_workbook(resultado, Path(args.output) / "resumo_admin.xlsx")
    arquivos_vendedor = write_vendor_files(resultado, Path(args.output) / "vendedores")

    print(f"Base lida: {len(export_df)} linhas")
    print(f"Excluidos (Ativo 30 dias): {len(resultado.excluidos_ativos_30)}")
    print(f"Sem UF (nao distribuido): {len(resultado.sem_uf)}")
    print(f"Fora do escopo (UF fora do mapeamento): {len(resultado.fora_do_escopo)}")
    print(f"Distribuidos entre os vendedores: {len(resultado.atribuidos)}")
    print(f"\nResumo admin: {master_path}")
    print(f"Arquivos por vendedor: {len(arquivos_vendedor)} em {Path(args.output) / 'vendedores'}")

    return resultado, arquivos_vendedor, vendor_map


def cmd_distribute(args) -> None:
    _run_distribution(args)


def cmd_sync(args) -> None:
    from sales_assistant.drive_sync import build_drive_service, sync_all

    _, arquivos_vendedor, vendor_map = _run_distribution(args)

    service = build_drive_service(args.credentials)
    relatorio = sync_all(service, arquivos_vendedor, vendor_map, args.drive_folder_id, role=args.role)

    log_path = Path(args.output) / "log_sincronizacao_drive.csv"
    with open(log_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["Vendedor", "UF", "Email", "file_id", "status", "link"])
        writer.writeheader()
        writer.writerows(relatorio)

    sem_email = [r for r in relatorio if r["status"] == "sem_email_cadastrado"]
    convidados = [r for r in relatorio if r["status"] == "convite_enviado"]

    print(f"\nSincronizado com o Google Drive: {len(relatorio)} planilhas")
    print(f"Convites novos enviados: {len(convidados)}")
    if sem_email:
        nomes = ", ".join(r["Vendedor"] for r in sem_email)
        print(f"AVISO: sem e-mail cadastrado em {args.vendor_map} para: {nomes}")
    print(f"Log detalhado: {log_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Assistente comercial de distribuicao de clientes por UF")
    sub = parser.add_subparsers(dest="comando", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--input", required=True, help="Planilha exportada do BI (.xlsx)")
    common.add_argument("--vendor-map", default=DEFAULT_VENDOR_MAP, help="CSV vendedor/UF/email")
    common.add_argument("--output", default="output", help="Pasta de saida")
    common.add_argument(
        "--active-label",
        default=ACTIVE_30_LABEL_DEFAULT,
        help="Valor da coluna Categoria a ignorar (padrao: 'Ativo 30 dias')",
    )
    common.add_argument(
        "--metodo",
        choices=["quantidade", "valor"],
        default="quantidade",
        help="Criterio de divisao justa: mesma quantidade de clientes (padrao) ou valor faturado equilibrado",
    )

    p_dist = sub.add_parser("distribute", parents=[common], help="Gera os arquivos localmente")
    p_dist.set_defaults(func=cmd_distribute)

    p_sync = sub.add_parser("sync", parents=[common], help="Gera os arquivos e publica no Google Drive")
    p_sync.add_argument("--credentials", required=True, help="JSON da conta de servico do Google")
    p_sync.add_argument("--drive-folder-id", required=True, help="ID da pasta raiz no Drive (compartilhada com a conta de servico)")
    p_sync.add_argument("--role", default="writer", choices=["writer", "reader"], help="Permissao do vendedor no arquivo")
    p_sync.set_defaults(func=cmd_sync)

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
