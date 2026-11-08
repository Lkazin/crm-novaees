import "server-only";
import { createHash, randomUUID } from "node:crypto";

export type AttendanceInput = { tenantId: string; phone: string; instance: string; messageIds: string[]; limit: number; floor: number; floorPeriod?: string; isTrial: boolean; now: Date };
export type AttendanceReservation = { allowed: boolean; reason?: string; token?: string; period?: string; used?: number; newWindow?: boolean };
export type AttendanceCommit = { committed: boolean; used: number; period: string; newWindow: boolean };
export interface AttendanceQuota {
 reserve(input: AttendanceInput): Promise<AttendanceReservation>;
 dispatch(input: AttendanceInput, token: string): Promise<void>;
 commit(input: AttendanceInput, token: string): Promise<AttendanceCommit>;
 release(input: AttendanceInput, token: string): Promise<void>;
}

async function tryRpc<T>(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data?: T }> {
 const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
 const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
 if (!url || !key) throw new Error("quota_service_not_configured");
 const response = await fetch(url+"/rest/v1/rpc/"+name, {
  method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(8000)
 });
 if (!response.ok) return { ok: false, status: response.status };
 return { ok: true, status: 200, data: await response.json() as T };
}

async function rpcWithFallback<T>(primaryName: string, primaryBody: Record<string, unknown>, fallbackName: string, fallbackBody: Record<string, unknown>): Promise<T> {
 const primary = await tryRpc<T>(primaryName, primaryBody);
 if (primary.ok && primary.data !== undefined) return primary.data;
 if (primary.status === 404) {
  const fallback = await tryRpc<T>(fallbackName, fallbackBody);
  if (fallback.ok && fallback.data !== undefined) return fallback.data;
  throw new Error("quota_operation_failed:" + fallback.status);
 }
 throw new Error("quota_operation_failed:" + primary.status);
}

export function attendanceQuota(): AttendanceQuota {
 return {
  reserve: async input => {
   if (!input.messageIds.length || input.messageIds.some(id => !id.trim())) throw new Error("invalid_quota_message_ids");
   const messageKeys = [...new Set(input.messageIds)].map(id => createHash("sha256").update(JSON.stringify([input.instance, id])).digest("hex"));
   const phoneHash = createHash("sha256").update(input.phone).digest("hex");
   const token = randomUUID();
   const value = await rpcWithFallback<AttendanceReservation>(
    "crm_reserve_ai_message",
    {
     p_tenant: input.tenantId, p_message_keys: messageKeys,
     p_instance: input.instance, p_token: token, p_limit: input.limit, p_floor: input.floor, p_floor_period: input.floorPeriod || null
    },
    "crm_reserve_attendance",
    {
     p_tenant: input.tenantId, p_phone_hash: phoneHash,
     p_instance: input.instance, p_token: token, p_limit: input.limit, p_floor: input.floor, p_floor_period: input.floorPeriod || null
    }
   );
   if (typeof value.allowed!=="boolean" || (value.allowed && (!value.token || !value.period || !Number.isInteger(value.used)))) throw new Error("invalid_quota_reservation");
   return value;
  },
  dispatch: async (input,token) => {
   const r = await rpcWithFallback<{dispatched:boolean}>(
    "crm_dispatch_ai_message",
    { p_tenant: input.tenantId, p_token: token, p_instance: input.instance, p_limit: input.limit },
    "crm_dispatch_attendance",
    { p_tenant: input.tenantId, p_token: token, p_instance: input.instance, p_limit: input.limit }
   );
   if(r.dispatched!==true)throw new Error("quota_dispatch_unconfirmed");
  },
  commit: async (input,token) => {
   const r = await rpcWithFallback<AttendanceCommit>(
    "crm_commit_ai_message",
    { p_tenant: input.tenantId, p_token: token },
    "crm_commit_attendance",
    { p_tenant: input.tenantId, p_token: token }
   );
   if(!r.committed || !Number.isInteger(r.used) || !r.period)throw new Error("quota_commit_unconfirmed");
   return r;
  },
  release: async (input,token) => {
   const r = await rpcWithFallback<{released:boolean}>(
    "crm_release_ai_message",
    { p_tenant: input.tenantId, p_token: token },
    "crm_release_attendance",
    { p_tenant: input.tenantId, p_token: token }
   );
   if(r.released!==true)throw new Error("quota_release_unconfirmed");
  }
 };
}
