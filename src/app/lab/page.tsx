import { redirect } from "next/navigation";

/** The old token-based browser entry is retired; use the single Supabase login. */
export default function LegacyLabRedirect() { redirect("/"); }
