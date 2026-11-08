import { randomUUID } from "node:crypto";
import type { AttendanceQuota, AttendanceInput } from "./attendance-quota";

type RedisFixture = { get(k: string): Promise<string | null>; exists(k: string): Promise<number>; set(k: string, v: string, ...args: unknown[]): Promise<unknown> };
type Reservation = { input: AttendanceInput; period: string; state: "reserved" | "dispatching" | "committed" | "released" };
type State = { reservations: Map<string, Reservation>; queue: Promise<unknown> };
const states = new WeakMap<object, State>();

// Deterministic test double; actual locking is exercised against PostgreSQL.
export function memoryAttendanceQuota(redis: RedisFixture): AttendanceQuota {
  let shared = states.get(redis);
  if (!shared) { shared = { reservations: new Map(), queue: Promise.resolve() }; states.set(redis, shared); }
  const state = shared;
  const period = (input: AttendanceInput) => input.isTrial ? "trial" : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(input.now).slice(0, 7);
  const key = (input: AttendanceInput, billingPeriod = period(input)) => billingPeriod === "trial" ? "crm:quota:trial:" + input.tenantId : "crm:quota:" + input.tenantId + ":" + billingPeriod;
  const current = async (input: AttendanceInput, billingPeriod = period(input)) => Math.max(input.floorPeriod === billingPeriod ? input.floor : 0, Number(await redis.get(key(input, billingPeriod)) || 0));
  const locked = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = state.queue.then(operation);
    state.queue = result.catch(() => undefined);
    return result;
  };
  const get = (input: AttendanceInput, token: string) => {
    const reservation = state.reservations.get(token);
    if (!reservation || reservation.input.tenantId !== input.tenantId) throw Error("missing_reservation");
    return reservation;
  };
  return {
    reserve: input => locked(async () => {
      const billingPeriod = period(input);
      const previous = [...state.reservations.values()].filter(r => r.input.tenantId === input.tenantId);
      const sameInstance = previous.filter(r => r.input.instance === input.instance);
      if (sameInstance.some(r => ["reserved", "dispatching"].includes(r.state) && r.input.messageIds.some(id => input.messageIds.includes(id)))) return { allowed: false, reason: "message_busy" };
      const freshIds = input.messageIds.filter(id => !sameInstance.some(r => r.state === "committed" && r.input.messageIds.includes(id)));
      if (!freshIds.length) return { allowed: false, reason: "message_already_processed" };
      const used = await current(input);
      const pending = previous.filter(r => r.period === billingPeriod && ["reserved", "dispatching"].includes(r.state)).length;
      if (used + pending >= input.limit) return { allowed: false, reason: "quota_exceeded" };
      const token = randomUUID();
      state.reservations.set(token, { input: { ...input, messageIds: freshIds }, period: billingPeriod, state: "reserved" });
      return { allowed: true, token, period: billingPeriod, used, newWindow: false };
    }),
    dispatch: (input, token) => locked(async () => {
      const reservation = get(input, token);
      if (reservation.state !== "reserved") throw Error("reservation_not_ready");
      reservation.period = period(input);
      const pending = [...state.reservations.values()].filter(r => r.input.tenantId === input.tenantId && r.period === reservation.period && ["reserved", "dispatching"].includes(r.state)).length;
      if (await current(input) + pending > input.limit) throw Error("quota_limit_changed");
      reservation.state = "dispatching";
    }),
    commit: (input, token) => locked(async () => {
      const reservation = get(input, token);
      if (!["dispatching", "committed"].includes(reservation.state)) throw Error("reservation_not_dispatched");
      const used = await current(input, reservation.period) + (reservation.state === "committed" ? 0 : 1);
      await redis.set(key(input, reservation.period), String(used));
      reservation.state = "committed";
      return { committed: true, used, period: reservation.period, newWindow: false };
    }),
    release: (input, token) => locked(async () => {
      const reservation = get(input, token);
      if (reservation.state !== "committed") reservation.state = "released";
    })
  };
}

