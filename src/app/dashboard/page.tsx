import { redirect } from "next/navigation"

// La vue d'ensemble est servie depuis /dashboard/overview
export default function DashboardPage() {
  redirect("/dashboard/overview")
}
