import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";

export default async function RequestsPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (access.role === "admin" || access.role === "project_manager") redirect("/procurement");
  redirect("/my-budget");
}
