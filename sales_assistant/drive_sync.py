"""Publica os arquivos ja distribuidos no Google Drive: cria uma estrutura de
pastas por UF, sobe cada planilha como Google Sheets nativo e compartilha com
o e-mail de cada vendedor.

Requer uma conta de servico do Google Cloud com a pasta raiz do Drive
compartilhada com ela (ver README.md, secao "Configurar o Google Drive").
As dependencias (google-api-python-client, google-auth) sao opcionais: este
modulo so precisa ser importado quando o comando `sync` for usado.
"""

from __future__ import annotations

from pathlib import Path

from sales_assistant.distribute import DistributionResult

SCOPES = ["https://www.googleapis.com/auth/drive"]
FOLDER_MIME = "application/vnd.google-apps.folder"
SHEET_MIME = "application/vnd.google-apps.spreadsheet"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_drive_service(credentials_path: str):
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Instale as dependencias do Google Drive: "
            "pip install google-api-python-client google-auth google-auth-httplib2"
        ) from exc

    creds = service_account.Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def _find_child(service, name: str, parent_id: str, mime_type: str | None = None):
    query = [
        f"name = '{name}'",
        f"'{parent_id}' in parents",
        "trashed = false",
    ]
    if mime_type:
        query.append(f"mimeType = '{mime_type}'")
    resp = service.files().list(
        q=" and ".join(query),
        fields="files(id, name)",
        spaces="drive",
    ).execute()
    files = resp.get("files", [])
    return files[0] if files else None


def ensure_folder(service, name: str, parent_id: str) -> str:
    existing = _find_child(service, name, parent_id, mime_type=FOLDER_MIME)
    if existing:
        return existing["id"]
    metadata = {"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]}
    created = service.files().create(body=metadata, fields="id").execute()
    return created["id"]


def upsert_spreadsheet(service, local_path: Path, name: str, parent_id: str) -> str:
    """Cria (ou atualiza, se ja existir) uma Google Sheet a partir do xlsx local.

    Atualizar em vez de recriar preserva o ID do arquivo e, com ele, os
    compartilhamentos ja feitos -- nao e preciso reconvidar o vendedor a
    cada nova exportacao.
    """
    from googleapiclient.http import MediaFileUpload

    media = MediaFileUpload(str(local_path), mimetype=XLSX_MIME, resumable=True)
    existing = _find_child(service, name, parent_id, mime_type=SHEET_MIME)
    if existing:
        service.files().update(fileId=existing["id"], media_body=media).execute()
        return existing["id"]

    metadata = {"name": name, "mimeType": SHEET_MIME, "parents": [parent_id]}
    created = service.files().create(body=metadata, media_body=media, fields="id").execute()
    return created["id"]


def share_with_email(service, file_id: str, email: str, role: str = "writer") -> str:
    """Convida o vendedor por e-mail. Se ele ja tiver acesso, nao duplica o convite."""
    perms = service.permissions().list(fileId=file_id, fields="permissions(id, emailAddress)").execute()
    for p in perms.get("permissions", []):
        if p.get("emailAddress", "").lower() == email.lower():
            return "ja_tinha_acesso"

    service.permissions().create(
        fileId=file_id,
        body={"type": "user", "role": role, "emailAddress": email},
        sendNotificationEmail=True,
    ).execute()
    return "convite_enviado"


def sync_all(
    service,
    vendor_files: dict[str, Path],
    vendor_map,
    root_folder_id: str,
    role: str = "writer",
) -> list[dict]:
    """Sobe todos os arquivos de `vendor_files` para o Drive, organizados em
    subpastas por UF dentro de `root_folder_id`, e compartilha com o e-mail
    de cada vendedor (coluna Email de vendor_map). Retorna um relatorio para
    auditoria/log (quem foi convidado, quem ficou sem e-mail cadastrado)."""
    relatorio = []
    pastas_uf: dict[str, str] = {}

    for _, linha in vendor_map.iterrows():
        vendedor, uf, email = linha["Vendedor"], linha["UF"], linha["Email"]
        local_path = vendor_files.get(vendedor)
        if local_path is None:
            continue

        if uf not in pastas_uf:
            pastas_uf[uf] = ensure_folder(service, uf, root_folder_id)

        file_id = upsert_spreadsheet(service, local_path, vendedor, pastas_uf[uf])

        if email:
            status = share_with_email(service, file_id, email, role=role)
        else:
            status = "sem_email_cadastrado"

        relatorio.append(
            {
                "Vendedor": vendedor,
                "UF": uf,
                "Email": email,
                "file_id": file_id,
                "status": status,
                "link": f"https://docs.google.com/spreadsheets/d/{file_id}/edit",
            }
        )

    return relatorio
