import "server-only";

// Monitor de canais de WhatsApp: compara o estado real na Evolution com o status
// gravado em crm_channels e avisa o Master quando um canal cai ou volta.
//
// Regras (para nao virar spam):
//   * canal que estava 'connected' e agora nao esta -> alerta 'down' imediato
//   * canal caido ha mais de 6h e sem lembrete recente -> 'reminder'
//   * canal que voltou a 'connected' -> 'recovered', uma unica vez
//   * canal que NUNCA esteve conectado (last_status nunca foi connected) nao
//     alerta: e um canal ainda nao configurado, nao uma queda.

import { sendText, type EvolutionSendConfig } from "@/lib/agent/evolution";

const EVOLUTION_TIMEOUT_MS = 8000;
const REMINDER_AFTER_MS = 6 * 60 * 60 * 1000;

export type ChannelRow = {
  id: string;
  tenant_id: string;
  instance_name: string;
  status: string;
};

export type AlertStateRow = {
  tenant_id: string;
  channel_id: string;
  instance_name: string;
  last_status: string;
  last_alert_at: string | null;
  last_alert_kind: string | null;
  consecutive_failures: number;
};

export type ChannelAlert = {
  tenantId: string;
  channelId: string;
  instanceName: string;
  kind: "down" | "reminder" | "recovered";
  previousStatus: string;
  currentStatus: string;
};

function supabaseConfig() {
  const url = (process.env.CRM_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, key };
}

function evolutionConfig() {
  const url = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.EVOLUTION_API_KEY || "").trim();
  return { url, key };
}

async function db<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error("supabase_not_configured");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal"
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`supabase_${res.status}`);
  if (method === "GET" || method === "POST") {
    const text = await res.text();
    return (text ? JSON.parse(text) : []) as T;
  }
  return undefined as T;
}

/** Le o estado real de cada instancia na Evolution. Falha de leitura = status desconhecido. */
export async function fetchEvolutionStates(instanceNames: string[]): Promise<Map<string, string>> {
  const { url, key } = evolutionConfig();
  const out = new Map<string, string>();
  if (!url || !key) return out;

  await Promise.all(instanceNames.map(async name => {
    try {
      const res = await fetch(`${url}/instance/connectionState/${encodeURIComponent(name)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS)
      });
      if (!res.ok) {
        // 404 = instancia nao existe mais na Evolution: trata como caida.
        out.set(name, res.status === 404 ? "disconnected" : "unknown");
        return;
      }
      const data = await res.json();
      const state = data?.instance?.state || data?.state || "unknown";
      out.set(name, String(state));
    } catch {
      // Timeout/erro de rede: 'unknown' evita alarme falso e evita resetar contador.
      out.set(name, "unknown");
    }
  }));
  return out;
}

/** Decide quais alertas devem sair neste ciclo. Pura: nao toca em rede nem banco. */
export function decideAlerts(input: {
  channels: ChannelRow[];
  states: Map<string, string>;
  alertStates: AlertStateRow[];
  now?: Date;
}): { alerts: ChannelAlert[]; updates: Array<{ channelId: string; tenantId: string; status: string }> } {
  const now = input.now ?? new Date();
  const stateByChannel = new Map(input.alertStates.map(s => [s.channel_id, s]));
  const alerts: ChannelAlert[] = [];
  const updates: Array<{ channelId: string; tenantId: string; status: string }> = [];

  for (const channel of input.channels) {
    const current = input.states.get(channel.instance_name);
    // Estado desconhecido: nao mexe em nada, espera o proximo ciclo.
    if (!current || current === "unknown") continue;

    const previous = stateByChannel.get(channel.id);
    const previousStatus = previous?.last_status ?? channel.status;
    const wasConnected = previousStatus === "connected";
    const isConnected = current === "connected" || current === "open";
    const normalized = isConnected ? "connected" : current;

    if (normalized !== channel.status) {
      updates.push({ channelId: channel.id, tenantId: channel.tenant_id, status: normalized });
    }

    if (wasConnected && !isConnected) {
      alerts.push({
        tenantId: channel.tenant_id,
        channelId: channel.id,
        instanceName: channel.instance_name,
        kind: "down",
        previousStatus,
        currentStatus: normalized
      });
      continue;
    }

    if (isConnected) {
      // Voltou depois de ter caido: avisa uma vez so. Vale tanto para canal que
      // estava conectado quanto para o que estava caido e reconectou.
      const wasDown = previous?.last_alert_kind === "down" || previous?.last_alert_kind === "reminder";
      if (wasDown) {
        alerts.push({
          tenantId: channel.tenant_id,
          channelId: channel.id,
          instanceName: channel.instance_name,
          kind: "recovered",
          previousStatus,
          currentStatus: normalized
        });
      }
      continue;
    }

    // Canal que nunca conectou nao gera alerta: e configuracao pendente, nao queda.
    if (!isConnected && previous?.last_alert_kind) {
      const lastAt = previous.last_alert_at ? new Date(previous.last_alert_at).getTime() : 0;
      if (now.getTime() - lastAt >= REMINDER_AFTER_MS) {
        alerts.push({
          tenantId: channel.tenant_id,
          channelId: channel.id,
          instanceName: channel.instance_name,
          kind: "reminder",
          previousStatus,
          currentStatus: normalized
        });
      }
    }
  }

  return { alerts, updates };
}

export function buildAlertMessage(alert: ChannelAlert, tenantName: string): string {
  const label = `${tenantName} · ${alert.instanceName}`;
  if (alert.kind === "down") {
    return `🔴 *Canal de WhatsApp caiu*\n\n${label}\n\nO canal estava conectado e desconectou. A IA parou de atender nesse número até reconectar.\n\nAbra o Painel Master → Radar para reconectar.`;
  }
  if (alert.kind === "reminder") {
    return `🟡 *Canal ainda desconectado*\n\n${label}\n\nJá passaram mais de 6 horas sem conexão. Enquanto isso, a IA não atende nesse número.`;
  }
  return `🟢 *Canal reconectado*\n\n${label}\n\nA conexão voltou e a IA já está atendendo normalmente.`;
}

export type MonitorDeps = {
  fetchChannels?: () => Promise<ChannelRow[]>;
  fetchStates?: (names: string[]) => Promise<Map<string, string>>;
  fetchAlertStates?: () => Promise<AlertStateRow[]>;
  saveAlertState?: (row: {
    tenantId: string;
    channelId: string;
    instanceName: string;
    lastStatus: string;
    kind: string | null;
  }) => Promise<void>;
  updateChannelStatus?: (channelId: string, status: string) => Promise<void>;
  recordAlert?: (alert: ChannelAlert, phone: string, delivered: boolean, error?: string) => Promise<void>;
  fetchTenantName?: (tenantId: string) => Promise<string>;
  sendWhatsapp?: (phone: string, text: string) => Promise<boolean>;
  masterPhone?: () => string;
  now?: () => Date;
};

export type MonitorResult = {
  checked: number;
  alertsSent: number;
  alerts: Array<{ kind: string; instanceName: string; delivered: boolean; error?: string }>;
  skipped?: string;
};

export async function runChannelMonitor(deps: MonitorDeps = {}): Promise<MonitorResult> {
  const phone = (deps.masterPhone ?? (() => (process.env.MASTER_NOTIFICATION_PHONE || "").trim()))();
  const fetchChannels = deps.fetchChannels ?? (() => db<ChannelRow[]>(
    "crm_channels?select=id,tenant_id,instance_name,status&order=instance_name"
  ));
  const channels = await fetchChannels();
  if (!channels.length) return { checked: 0, alertsSent: 0, alerts: [], skipped: "no_channels" };

  const names = channels.map(c => c.instance_name);
  const states = await (deps.fetchStates ?? fetchEvolutionStates)(names);
  const alertStates = await (deps.fetchAlertStates ?? (() => db<AlertStateRow[]>(
    "crm_channel_alert_state?select=tenant_id,channel_id,instance_name,last_status,last_alert_at,last_alert_kind,consecutive_failures"
  )))();

  const { alerts, updates } = decideAlerts({
    channels,
    states,
    alertStates,
    now: deps.now ? deps.now() : new Date()
  });

  const updateChannelStatus = deps.updateChannelStatus ?? (async (channelId, status) => {
    await db(`crm_channels?id=eq.${channelId}`, "PATCH", { status });
  });
  for (const update of updates) {
    try {
      await updateChannelStatus(update.channelId, update.status);
    } catch { /* status do banco nao pode travar o monitor */ }
  }

  const saveAlertState = deps.saveAlertState ?? (async row => {
    await db("crm_channel_alert_state?on_conflict=tenant_id,channel_id", "POST", {
      tenant_id: row.tenantId,
      channel_id: row.channelId,
      instance_name: row.instanceName,
      last_status: row.lastStatus,
      last_alert_at: row.kind ? new Date().toISOString() : null,
      last_alert_kind: row.kind,
      updated_at: new Date().toISOString()
    });
  });

  const recordAlert = deps.recordAlert ?? (async (alert, targetPhone, delivered, error) => {
    await db("crm_channel_alerts", "POST", {
      tenant_id: alert.tenantId,
      channel_id: alert.channelId,
      instance_name: alert.instanceName,
      kind: alert.kind,
      phone: targetPhone || null,
      delivered,
      error: error ?? null
    });
  });

  const tenantNames = new Map<string, string>();
  const fetchTenantName = deps.fetchTenantName ?? (async (tenantId: string) => {
    if (tenantNames.has(tenantId)) return tenantNames.get(tenantId)!;
    const rows = await db<Array<{ name: string }>>(`crm_tenants?id=eq.${tenantId}&select=name&limit=1`);
    const name = rows[0]?.name ?? tenantId;
    tenantNames.set(tenantId, name);
    return name;
  });

  const sendWhatsapp = deps.sendWhatsapp ?? (async (to: string, text: string) => {
    const cfg = evolutionConfig();
    if (!cfg.url || !cfg.key) return false;
    const instance = (process.env.MASTER_NOTIFICATION_INSTANCE || "novaesweb-ia-teste").trim();
    const sendCfg: EvolutionSendConfig = { evolutionUrl: cfg.url, evolutionKey: cfg.key, instance, sendFormat: "v2" };
    try {
      await sendText(to, text, sendCfg, instance);
      return true;
    } catch {
      return false;
    }
  });

  const results: MonitorResult["alerts"] = [];
  for (const alert of alerts) {
    const tenantName = await fetchTenantName(alert.tenantId);
    const message = buildAlertMessage(alert, tenantName);
    let delivered = false;
    let error: string | undefined;
    if (!phone) {
      error = "master_phone_not_configured";
    } else {
      try {
        delivered = await sendWhatsapp(phone, message);
        if (!delivered) error = "send_failed";
      } catch (err) {
        error = err instanceof Error ? err.message : "send_error";
      }
    }
    try {
      await recordAlert(alert, phone, delivered, error);
    } catch { /* auditoria nao pode quebrar o envio */ }
    try {
      await saveAlertState({
        tenantId: alert.tenantId,
        channelId: alert.channelId,
        instanceName: alert.instanceName,
        lastStatus: alert.currentStatus,
        kind: alert.kind
      });
    } catch { /* ignore */ }
    results.push({ kind: alert.kind, instanceName: alert.instanceName, delivered, error });
  }

  // Canais sem alerta: so atualiza o estado observado, sem tocar em last_alert_*.
  const alertedIds = new Set(alerts.map(a => a.channelId));
  for (const channel of channels) {
    if (alertedIds.has(channel.id)) continue;
    const current = states.get(channel.instance_name);
    if (!current || current === "unknown") continue;
    try {
      await saveAlertState({
        tenantId: channel.tenant_id,
        channelId: channel.id,
        instanceName: channel.instance_name,
        lastStatus: current === "open" ? "connected" : current,
        kind: null
      });
    } catch { /* ignore */ }
  }

  return {
    checked: channels.length,
    alertsSent: results.filter(r => r.delivered).length,
    alerts: results,
    skipped: phone ? undefined : "master_phone_not_configured"
  };
}
