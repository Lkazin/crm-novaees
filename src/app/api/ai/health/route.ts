import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  // Does not reveal environment variables or connection details.
  return NextResponse.json({ component: "crm-ai-lab", status: "ready_for_configuration", liveConnectionVerified: false });
}
