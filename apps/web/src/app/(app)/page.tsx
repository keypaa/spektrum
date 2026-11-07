import { requireUser } from "@/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  return <h1>Your Projects</h1>;
}
