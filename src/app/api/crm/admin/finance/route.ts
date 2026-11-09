import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getSupabaseConfig, catalogOwnerId, getMasterPixConfig, saveMasterPixConfig, type MasterPixConfig } from "@/lib/crm/plans";
import { patchCrmConfig } from "@/lib/crm/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type OperationalExpense = {
  id: string;
  description: string;
  category: "ai" | "servers" | "database" | "whatsapp" | "apis" | "domains" | "marketing" | "taxes" | "tools" | "other";
  amount: number; // In BRL (e.g. 150.50)
  dueDate: string; // YYYY-MM-DD
  paymentDate?: string | null;
  status: "paid" | "pending";
  recurring: boolean;
  supplier?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type FinanceMasterSettings = {
  pixConfig: MasterPixConfig;
  defaultGraceDays: number;
  autoBlockOnOverdue: boolean;
  expenses: OperationalExpense[];
  invoiceNotes?: string;
};

async function getMasterFinanceConfig(): Promise<FinanceMasterSettings> {
  const pixConfig = await getMasterPixConfig();
  const config = getSupabaseConfig();
  let defaultGraceDays = 3;
  let autoBlockOnOverdue = true;
  let expenses: OperationalExpense[] = [];
  let invoiceNotes = "";

  if (config.url && config.serviceKey) {
    try {
      const ownerId = await catalogOwnerId();
      const r = await fetch(config.url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${ownerId}&select=business_description`, {
        headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
        cache: "no-store"
      });
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]?.business_description) {
          const root = JSON.parse(rows[0].business_description);
          if (root?.master_finance && typeof root.master_finance === "object") {
            const mf = root.master_finance;
            if (typeof mf.defaultGraceDays === "number") defaultGraceDays = mf.defaultGraceDays;
            if (typeof mf.autoBlockOnOverdue === "boolean") autoBlockOnOverdue = mf.autoBlockOnOverdue;
            if (Array.isArray(mf.expenses)) expenses = mf.expenses;
            if (typeof mf.invoiceNotes === "string") invoiceNotes = mf.invoiceNotes;
          }
        }
      }
    } catch {}
  }

  return {
    pixConfig,
    defaultGraceDays,
    autoBlockOnOverdue,
    expenses,
    invoiceNotes
  };
}

async function saveMasterFinanceSettings(patch: Partial<FinanceMasterSettings>): Promise<FinanceMasterSettings> {
  const current = await getMasterFinanceConfig();
  const updated: FinanceMasterSettings = {
    ...current,
    ...patch,
    pixConfig: patch.pixConfig ? { ...current.pixConfig, ...patch.pixConfig } : current.pixConfig
  };

  if (patch.pixConfig) {
    await saveMasterPixConfig(patch.pixConfig);
  }

  const config = getSupabaseConfig();
  if (config.url && config.serviceKey) {
    const ownerId = await catalogOwnerId();
    await patchCrmConfig(ownerId, {
      master_finance: {
        defaultGraceDays: updated.defaultGraceDays,
        autoBlockOnOverdue: updated.autoBlockOnOverdue,
        expenses: updated.expenses,
        invoiceNotes: updated.invoiceNotes
      }
    });
  }

  return updated;
}

/**
 * GET /api/crm/admin/finance
 * Returns master financial settings, PIX config, and operational expenses.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const financeConfig = await getMasterFinanceConfig();
    return privateJson(financeConfig);
  } catch (err) {
    return privateJson({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

/**
 * POST /api/crm/admin/finance
 * Actions:
 *  - "update_settings": update general finance settings (PIX, grace days, etc.)
 *  - "add_expense": add operational expense
 *  - "update_expense": update or toggle paid status of an expense
 *  - "delete_expense": remove an expense
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "update_settings") {
      const { pixConfig, defaultGraceDays, autoBlockOnOverdue, invoiceNotes } = body;
      const updated = await saveMasterFinanceSettings({
        pixConfig,
        defaultGraceDays: typeof defaultGraceDays === "number" ? Math.max(0, Math.min(60, defaultGraceDays)) : undefined,
        autoBlockOnOverdue: typeof autoBlockOnOverdue === "boolean" ? autoBlockOnOverdue : undefined,
        invoiceNotes: typeof invoiceNotes === "string" ? invoiceNotes.trim() : undefined
      });
      return privateJson({ success: true, settings: updated });
    }

    if (action === "add_expense") {
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const category = typeof body.category === "string" ? body.category : "other";
      const amount = Number(body.amount);
      const dueDate = typeof body.dueDate === "string" ? body.dueDate : new Date().toISOString().slice(0, 10);
      const status = body.status === "paid" ? "paid" : "pending";
      const recurring = Boolean(body.recurring);
      const supplier = typeof body.supplier === "string" ? body.supplier.trim() : "";
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";

      if (!description || !Number.isFinite(amount) || amount <= 0) {
        return privateJson({ error: "invalid_expense_data", message: "Descrição e valor válido são obrigatórios." }, 400);
      }

      const current = await getMasterFinanceConfig();
      const newExpense: OperationalExpense = {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        description,
        category: category as OperationalExpense["category"],
        amount: Math.round(amount * 100) / 100,
        dueDate,
        paymentDate: status === "paid" ? (body.paymentDate || new Date().toISOString().slice(0, 10)) : null,
        status,
        recurring,
        supplier,
        notes,
        createdAt: new Date().toISOString()
      };

      const updatedExpenses = [newExpense, ...current.expenses];
      await saveMasterFinanceSettings({ expenses: updatedExpenses });

      return privateJson({ success: true, expense: newExpense, expenses: updatedExpenses }, 201);
    }

    if (action === "update_expense") {
      const expenseId = typeof body.id === "string" ? body.id : "";
      if (!expenseId) return privateJson({ error: "missing_expense_id" }, 400);

      const current = await getMasterFinanceConfig();
      const idx = current.expenses.findIndex(e => e.id === expenseId);
      if (idx === -1) return privateJson({ error: "expense_not_found" }, 404);

      const exp = current.expenses[idx];
      const updatedExp: OperationalExpense = {
        ...exp,
        description: typeof body.description === "string" ? body.description.trim() : exp.description,
        category: typeof body.category === "string" ? body.category as OperationalExpense["category"] : exp.category,
        amount: typeof body.amount === "number" && body.amount > 0 ? body.amount : exp.amount,
        dueDate: typeof body.dueDate === "string" ? body.dueDate : exp.dueDate,
        status: body.status ? (body.status === "paid" ? "paid" : "pending") : exp.status,
        paymentDate: body.status === "paid" ? (body.paymentDate || exp.paymentDate || new Date().toISOString().slice(0, 10)) : (body.status === "pending" ? null : exp.paymentDate),
        recurring: body.recurring !== undefined ? Boolean(body.recurring) : exp.recurring,
        supplier: typeof body.supplier === "string" ? body.supplier.trim() : exp.supplier,
        notes: typeof body.notes === "string" ? body.notes.trim() : exp.notes,
        updatedAt: new Date().toISOString()
      };

      current.expenses[idx] = updatedExp;
      await saveMasterFinanceSettings({ expenses: current.expenses });

      return privateJson({ success: true, expense: updatedExp, expenses: current.expenses });
    }

    if (action === "delete_expense") {
      const expenseId = typeof body.id === "string" ? body.id : "";
      if (!expenseId) return privateJson({ error: "missing_expense_id" }, 400);

      const current = await getMasterFinanceConfig();
      const filtered = current.expenses.filter(e => e.id !== expenseId);
      await saveMasterFinanceSettings({ expenses: filtered });

      return privateJson({ success: true, expenses: filtered });
    }

    return privateJson({ error: "invalid_action" }, 400);
  } catch (err) {
    return privateJson({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}
