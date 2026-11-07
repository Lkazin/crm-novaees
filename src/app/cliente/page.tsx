import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import ClientWorkspace from "@/components/crm/ClientWorkspace";

type ClientPageProps = {
  searchParams: Promise<{ tenant?: string | string[] }>;
};

export default async function ClientPage({ searchParams }: ClientPageProps) {
  const params = await searchParams;
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  const cookieStore = await cookies();
  const hasMaster = Boolean(cookieStore.get("nw_master_session")?.value);

  // If a Master Admin opens /cliente or asks for NovaesWeb, route to Master's integrated CRM section
  if (hasMaster && (!tenant || tenant === "novaesweb")) {
    redirect("/admin?section=crm");
  }

  return <ClientWorkspace initialTenant={tenant} />;
}
