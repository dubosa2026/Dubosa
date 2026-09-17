import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { parseCsv } from "../utils/csv.js";

export const importRouter = Router();

/**
 * Camada de importação (seção 22/23): recebe pedidos via CSV colado no
 * corpo da requisição. Preparado para futuramente ser substituído por
 * integração direta com ERP/CRM sem mudar o restante do sistema — quem
 * consome pedidos (dashboard, radar, health score) não sabe de onde vieram.
 *
 * Formato esperado das colunas:
 * cnpjCliente,razaoSocial,uf,cidade,segmento,emailVendedor,data,total,desconto,margem,frete
 */
const importBodySchema = z.object({ csv: z.string().min(1) });

importRouter.post("/pedidos-csv", requireAuth, requireRole("ADMIN", "GERENTE"), async (req, res) => {
  const parsed = importBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Envie o CSV no campo 'csv'." });

  const rows = parseCsv(parsed.data.csv);
  const errors: string[] = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const vendor = await prisma.user.findUnique({ where: { email: row.emailVendedor } });
      if (!vendor) {
        errors.push(`Linha ${index + 2}: vendedor com e-mail "${row.emailVendedor}" não encontrado.`);
        continue;
      }

      let state = row.uf ? await prisma.state.findUnique({ where: { uf: row.uf.toUpperCase() } }) : null;

      let client = await prisma.client.findUnique({ where: { cnpj: row.cnpjCliente } });
      if (!client) {
        client = await prisma.client.create({
          data: {
            cnpj: row.cnpjCliente,
            legalName: row.razaoSocial || row.cnpjCliente,
            city: row.cidade || "N/D",
            segment: row.segmento || "N/D",
            vendorId: vendor.id,
            stateId: state?.id,
            isDemo: false,
          },
        });
      }

      await prisma.order.create({
        data: {
          clientId: client.id,
          vendorId: vendor.id,
          date: new Date(row.data),
          total: Number(row.total || 0),
          discount: Number(row.desconto || 0),
          margin: Number(row.margem || 0),
          freight: Number(row.frete || 0),
          isDemo: false,
        },
      });
      imported++;
    } catch (e) {
      errors.push(`Linha ${index + 2}: ${(e as Error).message}`);
    }
  }

  await prisma.auditLog.create({
    data: {
      entity: "Order",
      entityId: "bulk-import",
      action: "IMPORT_CSV",
      after: JSON.stringify({ imported, errors: errors.length }),
      userId: req.user!.id,
    },
  });

  res.json({ linhasProcessadas: rows.length, importados: imported, erros: errors });
});
