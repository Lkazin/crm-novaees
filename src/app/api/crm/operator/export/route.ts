import { NextRequest, NextResponse } from "next/server";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { supabaseSettings } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId") || "";
  const type = request.nextUrl.searchParams.get("type") || "contacts"; // "contacts" | "conversations"

  if (!UUID.test(tenantId)) {
    return new NextResponse("ID de empresa inválido", { status: 400 });
  }

  const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
  if (!access) {
    return new NextResponse("Acesso não autorizado", { status: 403 });
  }

  const { url } = supabaseSettings();
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (serviceKey.length < 30) {
    return new NextResponse("Serviço de banco indisponível", { status: 503 });
  }

  try {
    if (type === "conversations") {
      const res = await fetch(
        `${url}/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&select=id,status,mode,last_message_at,created_at,crm_contacts(name,phone)&order=last_message_at.desc.nullslast&limit=2000`,
        {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        return new NextResponse("Erro ao consultar histórico de conversas", { status: 502 });
      }

      type ConvRow = {
        id: string;
        status: string;
        mode: string;
        last_message_at: string | null;
        created_at: string;
        crm_contacts?: { name: string | null; phone: string } | null;
      };

      const rows = (await res.json()) as ConvRow[];
      const headers = ["ID da Conversa", "Nome do Cliente", "Telefone", "Status", "Modo", "Última Interação", "Criado Em"];
      const lines = [headers.join(",")];

      for (const r of rows) {
        lines.push(
          [
            escapeCsvField(r.id),
            escapeCsvField(r.crm_contacts?.name ?? "Cliente"),
            escapeCsvField(r.crm_contacts?.phone ?? ""),
            escapeCsvField(r.status),
            escapeCsvField(r.mode),
            escapeCsvField(r.last_message_at ?? ""),
            escapeCsvField(r.created_at),
          ].join(",")
        );
      }

      const csvData = "\uFEFF" + lines.join("\r\n");
      const filename = `conversas_crm_${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csvData, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // Default: contacts
    const res = await fetch(
      `${url}/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&select=id,name,phone,created_at,updated_at&order=created_at.desc&limit=5000`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return new NextResponse("Erro ao consultar contatos", { status: 502 });
    }

    type ContactRow = {
      id: string;
      name: string | null;
      phone: string;
      created_at: string;
      updated_at: string | null;
    };

    const rows = (await res.json()) as ContactRow[];
    const headers = ["ID do Contato", "Nome", "WhatsApp/Telefone", "Data de Cadastro", "Última Atualização"];
    const lines = [headers.join(",")];

    for (const r of rows) {
      lines.push(
        [
          escapeCsvField(r.id),
          escapeCsvField(r.name ?? ""),
          escapeCsvField(r.phone),
          escapeCsvField(r.created_at),
          escapeCsvField(r.updated_at ?? ""),
        ].join(",")
      );
    }

    const csvData = "\uFEFF" + lines.join("\r\n");
    const filename = `contatos_crm_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return new NextResponse("Falha ao exportar CSV", { status: 500 });
  }
}
