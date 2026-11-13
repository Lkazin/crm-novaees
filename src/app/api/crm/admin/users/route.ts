import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const ALLOWED_DB_ROLES = new Set(["owner", "admin", "agent", "viewer"]);

export type GranularPermissions = {
  canManageAi: boolean;
  canManageWhatsapp: boolean;
  canManageTeam: boolean;
  canViewReports: boolean;
  canManageBilling: boolean;
};

function normalizeDbRole(role: unknown): "owner" | "admin" | "agent" | "viewer" {
  if (typeof role === "string" && ALLOWED_DB_ROLES.has(role.trim().toLowerCase())) {
    return role.trim().toLowerCase() as "owner" | "admin" | "agent" | "viewer";
  }
  return "admin";
}

function defaultPermissionsForRole(role: "owner" | "admin" | "agent" | "viewer"): GranularPermissions {
  if (role === "owner" || role === "admin") {
    return {
      canManageAi: true,
      canManageWhatsapp: true,
      canManageTeam: true,
      canViewReports: true,
      canManageBilling: role === "owner"
    };
  }
  if (role === "agent") {
    return {
      canManageAi: false,
      canManageWhatsapp: true,
      canManageTeam: false,
      canViewReports: false,
      canManageBilling: false
    };
  }
  return {
    canManageAi: false,
    canManageWhatsapp: false,
    canManageTeam: false,
    canViewReports: true,
    canManageBilling: false
  };
}

function normalizePermissions(
  raw: unknown,
  role: "owner" | "admin" | "agent" | "viewer"
): GranularPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    canManageAi: typeof obj.canManageAi === "boolean" ? obj.canManageAi : defaults.canManageAi,
    canManageWhatsapp:
      typeof obj.canManageWhatsapp === "boolean" ? obj.canManageWhatsapp : defaults.canManageWhatsapp,
    canManageTeam: typeof obj.canManageTeam === "boolean" ? obj.canManageTeam : defaults.canManageTeam,
    canViewReports:
      typeof obj.canViewReports === "boolean" ? obj.canViewReports : defaults.canViewReports,
    canManageBilling:
      typeof obj.canManageBilling === "boolean" ? obj.canManageBilling : defaults.canManageBilling
  };
}

function getAdminConfig() {
  const url = (
    process.env.CRM_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL
  )
    ?.trim()
    .replace(/\/$/, "") ?? "";
  const serviceKey = (
    process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY
  )?.trim() ?? "";
  return { url, serviceKey };
}

/**
 * GET /api/crm/admin/users
 * Lists all registered client users from Supabase Auth, their metadata, permissions and linked tenants.
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
        accessRole?: string;
        customerId?: string;
        permissions?: Partial<GranularPermissions>;
        is_blocked?: boolean;
      };
    }>;

    // 2. Fetch all memberships
    const rMemb = await fetch(
      url + "/rest/v1/crm_tenant_memberships?select=tenant_id,user_id,role,is_active",
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const memberships = rMemb.ok
      ? ((await rMemb.json()) as Array<{
          tenant_id: string;
          user_id: string;
          role: string;
          is_active: boolean;
        }>)
      : [];

    // 3. Fetch all tenants
    const rTenants = await fetch(url + "/rest/v1/crm_tenants?select=id,name,status", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = rTenants.ok
      ? ((await rTenants.json()) as Array<{ id: string; name: string; status: string }>)
      : [];
    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    // 4. Fetch tenant settings to obtain plan names if available
    const rSettings = await fetch(
      url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description",
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const settings = rSettings.ok
      ? ((await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>)
      : [];
    const planMap = new Map<string, string>();
    for (const s of settings) {
      try {
        const parsed = JSON.parse(s.business_description);
        if (parsed?.plan?.name) planMap.set(s.tenant_id, parsed.plan.name);
      } catch {}
    }

    // 5. Build user list with links
    const clientUsers = allUsers.map(user => {
      const userMemberships = memberships.filter(
        m => m.user_id === user.id && m.is_active !== false
      );
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

      const isBlocked = Boolean(
        user.user_metadata?.is_blocked ||
          (user.banned_until && new Date(user.banned_until) > new Date())
      );
      let status: "waiting_store" | "linked" | "blocked" = "waiting_store";
      if (isBlocked) {
        status = "blocked";
      } else if (linkedTenants.length > 0) {
        status = "linked";
      }

      const rawWhatsapp =
        user.user_metadata?.whatsapp || user.user_metadata?.recoveryWhatsapp || "";
      const name =
        user.user_metadata?.name ||
        user.user_metadata?.storeName ||
        (user.email ? user.email.split("@")[0] : "Cliente");
      const primaryRole = normalizeDbRole(
        linkedTenants[0]?.role || user.user_metadata?.accessRole || "admin"
      );
      const permissions = normalizePermissions(user.user_metadata?.permissions, primaryRole);

      return {
        id: user.id,
        email: user.email,
        name,
        whatsapp: rawWhatsapp,
        status,
        isBlocked,
        accessRole: primaryRole,
        permissions,
        customerId: user.user_metadata?.customerId || null,
        createdAt: user.created_at,
        linkedTenants
      };
    });

    return privateJson({ users: clientUsers });
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/**
 * POST /api/crm/admin/users
 * Creates a client login user in Supabase Auth and optionally links it to one or more companies
 * with explicit role and granular permissions (Step 3: Logins & Acessos).
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

    // Collect target tenant IDs to link (supports single tenantId or array tenantIds)
    const targetTenantIds: string[] = [];
    if (typeof body.tenantId === "string" && UUID_REGEX.test(body.tenantId.trim())) {
      targetTenantIds.push(body.tenantId.trim());
    }
    if (Array.isArray(body.tenantIds)) {
      for (const item of body.tenantIds) {
        if (typeof item === "string" && UUID_REGEX.test(item.trim()) && !targetTenantIds.includes(item.trim())) {
          targetTenantIds.push(item.trim());
        }
      }
    }

    const accessRole = normalizeDbRole(body.role || body.accessRole || "admin");
    const permissions = normalizePermissions(body.permissions, accessRole);
    const customerId =
      typeof body.customerId === "string" && body.customerId.trim().length > 0
        ? body.customerId.trim()
        : undefined;

    // Fast path: linking an existing user login to additional company/companies
    const existingUserId =
      typeof body.existingUserId === "string" && UUID_REGEX.test(body.existingUserId.trim())
        ? body.existingUserId.trim()
        : "";
    if (existingUserId && targetTenantIds.length > 0) {
      for (const tid of targetTenantIds) {
        const rLink = await fetch(url + "/rest/v1/crm_tenant_memberships", {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: "Bearer " + serviceKey,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            tenant_id: tid,
            user_id: existingUserId,
            role: accessRole,
            is_active: true
          })
        });
        if (!rLink.ok) {
          return privateJson(
            {
              error: "membership_link_failed",
              message: "Não foi possível vincular o login existente à empresa selecionada."
            },
            500
          );
        }
      }
      return privateJson(
        {
          success: true,
          linkedExisting: true,
          userId: existingUserId,
          tenantIds: targetTenantIds,
          role: accessRole,
          permissions
        },
        201
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const rawWhatsapp =
      typeof body.whatsapp === "string" ? body.whatsapp.replace(/\D/g, "") : "";
    const password = typeof body.password === "string" ? body.password : "";
    const isBlocked = body.status === "blocked" || body.isBlocked === true;

    if (!name || name.length < 2) {
      return privateJson(
        { error: "invalid_name", message: "Informe o nome completo do responsável." },
        400
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return privateJson(
        { error: "invalid_email", message: "Informe um endereço de e-mail válido." },
        400
      );
    }
    if (rawWhatsapp.length < 10) {
      return privateJson(
        { error: "invalid_whatsapp", message: "Informe um número de WhatsApp válido com DDD." },
        400
      );
    }
    if (password.length < 6) {
      return privateJson(
        {
          error: "password_too_short",
          message: "A senha inicial deve conter pelo menos 6 caracteres."
        },
        400
      );
    }

    const metadataPayload: Record<string, unknown> = {
      name,
      whatsapp: rawWhatsapp,
      role: "CLIENT",
      is_blocked: isBlocked
    };
    if (body.role || body.accessRole) metadataPayload.accessRole = accessRole;
    if (body.permissions) metadataPayload.permissions = permissions;
    if (customerId) metadataPayload.customerId = customerId;

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
        user_metadata: metadataPayload
      })
    });

    if (!rCreate.ok) {
      const errText = await rCreate.text();
      if (
        errText.includes("already been registered") ||
        errText.includes("already exists") ||
        rCreate.status === 422
      ) {
        return privateJson(
          {
            error: "email_already_exists",
            message:
              "Este e-mail já possui login cadastrado no sistema. Você pode vinculá-lo diretamente a outra empresa usando a opção 'Vincular Empresa' no card desse login."
          },
          409
        );
      }
      return privateJson(
        {
          error: "user_create_failed",
          message: "Falha ao criar o usuário no sistema.",
          detail: errText
        },
        500
      );
    }

    const createdData = await rCreate.json();
    const createdUserId = createdData.id as string;

    const linkedTenants: Array<{
      tenantId: string;
      tenantName: string;
      status: string;
      role: string;
      planName: string;
    }> = [];

    if (targetTenantIds.length > 0 && UUID_REGEX.test(createdUserId || "")) {
      for (const tid of targetTenantIds) {
        const rMemb = await fetch(url + "/rest/v1/crm_tenant_memberships", {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: "Bearer " + serviceKey,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            tenant_id: tid,
            user_id: createdUserId,
            role: accessRole,
            is_active: true
          })
        });
        if (rMemb.ok) {
          linkedTenants.push({
            tenantId: tid,
            tenantName: "Empresa Vinculada",
            status: "active",
            role: accessRole,
            planName: "Plano Ativo"
          });
        }
      }
    }

    const user = {
      id: createdUserId,
      email: createdData.email,
      name,
      whatsapp: rawWhatsapp,
      status: isBlocked ? "blocked" : linkedTenants.length > 0 ? "linked" : "waiting_store",
      isBlocked,
      accessRole,
      permissions,
      customerId: customerId || null,
      createdAt: createdData.created_at,
      linkedTenants
    };

    return privateJson({ success: true, user }, 201);
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/**
 * DELETE /api/crm/admin/users?userId=...
 * Permanently deletes a client login. Refuses if the user still has linked stores.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const userId = request.nextUrl.searchParams.get("userId")?.trim() || "";
    if (!UUID_REGEX.test(userId)) {
      return privateJson({ error: "invalid_user_id" }, 400);
    }
    const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

    const rMemb = await fetch(
      url + `/rest/v1/crm_tenant_memberships?user_id=eq.${userId}&select=tenant_id&limit=1`,
      { headers, cache: "no-store" }
    );
    if (!rMemb.ok) return privateJson({ error: "membership_check_failed" }, 500);
    if (((await rMemb.json()) as unknown[]).length > 0) {
      return privateJson(
        {
          error: "user_has_linked_stores",
          message:
            "Este cliente ainda possui loja vinculada. Apague a loja primeiro (marcando a opção de apagar o login) e depois o cliente."
        },
        409
      );
    }

    const rDel = await fetch(url + `/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers
    });
    if (!rDel.ok) {
      return privateJson({ error: "delete_failed", detail: await rDel.text() }, 500);
    }
    return privateJson({ success: true, deleted: true, userId });
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/**
 * PATCH /api/crm/admin/users
 * Updates a client user profile, block status, password, company links, or permissions.
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
    if (!userId || !UUID_REGEX.test(userId)) {
      return privateJson({ error: "invalid_user_id" }, 400);
    }

    const action = body.action || "update_status";

    if (action === "link_tenant") {
      const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
      if (!UUID_REGEX.test(tenantId)) {
        return privateJson({ error: "invalid_tenant_id", message: "Selecione uma empresa válida." }, 400);
      }
      const accessRole = normalizeDbRole(body.role || "admin");
      const rLink = await fetch(url + "/rest/v1/crm_tenant_memberships", {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: "Bearer " + serviceKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: userId,
          role: accessRole,
          is_active: true
        })
      });
      if (!rLink.ok) {
        return privateJson({ error: "link_failed", detail: await rLink.text() }, 500);
      }
      if (body.permissions) {
        const permissions = normalizePermissions(body.permissions, accessRole);
        await fetch(url + `/auth/v1/admin/users/${userId}`, {
          method: "PUT",
          headers: {
            apikey: serviceKey,
            Authorization: "Bearer " + serviceKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            user_metadata: { accessRole, permissions }
          })
        }).catch(() => {});
      }
      return privateJson({ success: true, linked: true, tenantId, role: accessRole });
    }

    if (action === "unlink_tenant") {
      const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
      if (!UUID_REGEX.test(tenantId)) {
        return privateJson({ error: "invalid_tenant_id" }, 400);
      }
      const rUnlink = await fetch(
        url + `/rest/v1/crm_tenant_memberships?user_id=eq.${userId}&tenant_id=eq.${tenantId}`,
        {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
        }
      );
      if (!rUnlink.ok) {
        return privateJson({ error: "unlink_failed", detail: await rUnlink.text() }, 500);
      }
      return privateJson({ success: true, unlinked: true, tenantId });
    }

    if (action === "update_permissions") {
      const accessRole = normalizeDbRole(body.role || body.accessRole || "admin");
      const permissions = normalizePermissions(body.permissions, accessRole);
      const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";

      if (UUID_REGEX.test(tenantId)) {
        await fetch(
          url + `/rest/v1/crm_tenant_memberships?user_id=eq.${userId}&tenant_id=eq.${tenantId}`,
          {
            method: "PATCH",
            headers: {
              apikey: serviceKey,
              Authorization: "Bearer " + serviceKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ role: accessRole })
          }
        );
      }

      const rPerm = await fetch(url + `/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          apikey: serviceKey,
          Authorization: "Bearer " + serviceKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_metadata: { accessRole, permissions }
        })
      });
      if (!rPerm.ok) {
        return privateJson({ error: "update_permissions_failed", detail: await rPerm.text() }, 500);
      }
      return privateJson({ success: true, accessRole, permissions });
    }

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
        return privateJson(
          {
            error: "password_too_short",
            message: "A nova senha deve ter no mínimo 6 caracteres."
          },
          400
        );
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
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
