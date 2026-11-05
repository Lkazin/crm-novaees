import { redirect } from "next/navigation";

/** Legacy operator URL now uses the same single login and panel at /. */
export default function OperatorAlias(){redirect("/");}
