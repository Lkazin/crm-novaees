import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  return { url, serviceKey };
}

/**
 * GET /api/crm/admin/users
 * Lists all registered client users from Supabase Auth, their metadata and linked tenants.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    // 1. Fetch users from Supabase Auth
    const rUsers = await fetch(url + "/auth/v1/admin/users?per_page=500", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    if (!rUsers.ok) {
      return privateJson({ error: "failed_to_fetch_users" }, 500);
    }
    const usersData = await rUsers.json();
    const allUsers = (usersData?.users || []) as Array<{
      id: string;
      email: string;
      created_at: string;
      banned_until?: string | null;
      user_metadata?: {
        name?: string;
        storeName?: string;
        whatsapp?: string;
        recoveryWhatsapp?: string;
        role?: string;
        is_blocked?: boolean;
      };
    }>;

    // 2. Fetch all memberships
    const rMemb = await fetch(url + "/rest/v1/crm_tenant_memberships?select=tenant_id,user_id,role,is_active", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const memberships = rMemb.ok ? ((await rMemb.json()) as Array<{ tenant_id: string; user_id: string; role: string; is_active: boolean }>) : [];

    // 3. Fetch all tenants
    const rTenants = await fetch(url + "/rest/v1/crm_tenants?select=id,name,status", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = rTenants.ok ? ((await rTenants.json()) as Array<{ id: string; name: string; status: string }>) : [];
    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    // 4. Fetch tenant settings to obtain plan names if available
    const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const settings = rSettings.ok ? ((await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>) : [];
    const planMap = new Map<string, string>();
    for (const s of settings) {
      try {
        const parsed = JSON.parse(s.business_description);
        if (parsed?.plan?.name) planMap.set(s.tenant_id, parsed.plan.name);
      } catch {}
    }

    // 5. Build user list with links
    const clientUsers = allUsers.map(user => {
      const userMemberships = memberships.filter(m => m.user_id === user.id && m.is_active !== false);
      const linkedTenants = userMemberships.map(m => {
        const t = tenantMap.get(m.tenant_id);
        return {
          tenantId: m.tenant_id,
          tenantName: t?.name || "Loja Vinculada",
          status: t?.status || "active",
          role: m.role,
          planName: planMap.get(m.tenant_id) || "Plano Ativo"
        };
      });

      const isBlocked = Boolean(user.user_metadata?.is_blocked || (user.banned_until && new Date(user.banned_until) > new Date()));
      let status: "waiting_store" | "linked" | "blocked" = "waiting_store";
      if (isBlocked) {
        status = "blocked";
      } else if (linkedTenants.length > 0) {
        status = "linked";
      }

      const rawWhatsapp = user.user_metadata?.whatsapp || user.user_metadata?.recoveryWhatsapp || "";
      const name = user.user_metadata?.name || user.user_metadata?.storeName || (user.email ? user.email.split("@")[0] : "Cliente");

      return {
        id: user.id,
        email: user.email,
        name,
        whatsapp: rawWhatsapp,
        status,
        isBlocked,
        createdAt: user.created_at,
        linkedTenants
      };
    });

    return privateJson({ users: clientUsers });
  } catch (err) {
    return privateJson({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

/**
 * POST /api/crm/admin/users
 * Creates a new client login user in Supabase Auth (Step 1 of the new workflow).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const rawWhatsapp = typeof body.whatsapp === "string" ? body.whatsapp.replace(/\D/g, "") : "";
    const password = typeof body.password === "string" ? body.password : "";
    const isBlocked = body.status === "blocked" || body.isBlocked === true;

    if (!name || name.length < 2) {
      return privateJson({ error: "invalid_name", message: "Informe o nome completo do responsável." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return privateJson({ error: "invalid_email", message: "Informe um endereço de e-mail válido." }, 400);
    }
    if (rawWhatsapp.length < 10) {
      return privateJson({ error: "invalid_whatsapp", message: "Informe um número de WhatsApp válido com DDD." }, 400);
    }
    if (password.length < 6) {
      return privateJson({ error: "password_too_short", message: "A senha inicial deve conter pelo menos 6 caracteres." }, 400);
    }

    // Call Supabase Auth Admin API
    const rCreate = await fetch(url + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          whatsapp: rawWhatsapp,
          role: "CLIENT",
          is_blocked: isBlocked
        }
      })
    });

    if (!rCreate.ok) {
      const errText = await rCreate.text();
      if (errText.includes("already been registered") || errText.includes("already exists") || rCreate.status === 422) {
        return privateJson({
          error: "email_already_exists",
          message: "Este e-mail já está cadastrado no sistema. Utilize outro e-mail ou vincule a loja diretamente a este cliente."
        }, 409);
      }
      return privateJson({ error: "user_create_failed", message: "Falha ao criar o usuário no sistema.", detail: errText }, 500);
    }

    const createdData = await rCreate.json();
    const user = {
      id: createdData.id,
      email: createdData.email,
      name,
      whatsapp: rawWhatsapp,
      status: isBlocked ? "blocked" : "waiting_store",
      isBlocked,
      createdAt: createdData.created_at,
      linkedTenants: []
    };

    return privateJson({ success: true, user }, 201);
  } catch (err) {
    return privateJson({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

/**
 * PATCH /api/crm/admin/users
 * Updates a client user profile, block status, or password.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return privateJson({ error: "invalid_user_id" }, 400);
    }

    const action = body.action || "update_status";
    const updatePayload: Record<string, unknown> = {};

    if (action === "toggle_block") {
      const isBlocked = Boolean(body.blocked);
      updatePayload.user_metadata = { is_blocked: isBlocked };
      if (isBlocked) {
        updatePayload.ban_duration = "876000h"; // ban for 100 years
      } else {
        updatePayload.ban_duration = "none";
      }
    } else if (action === "update_profile") {
      const metadataUpdates: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) metadataUpdates.name = body.name.trim();
      if (typeof body.whatsapp === "string" && body.whatsapp.replace(/\D/g, "")) {
        metadataUpdates.whatsapp = body.whatsapp.replace(/\D/g, "");
      }
      updatePayload.user_metadata = metadataUpdates;
    } else if (action === "reset_password") {
      const newPassword = typeof body.password === "string" ? body.password : "";
      if (newPassword.length < 6) {
        return privateJson({ error: "password_too_short", message: "A nova senha deve ter no mínimo 6 caracteres." }, 400);
      }
      updatePayload.password = newPassword;
    }

    const rUpdate = await fetch(url + `/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatePayload)
    });

    if (!rUpdate.ok) {
      const err = await rUpdate.text();
      return privateJson({ error: "update_failed", detail: err }, 500);
    }

    return privateJson({ success: true });
  } catch (err) {
    return privateJson({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}
