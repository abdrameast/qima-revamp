import { redirect } from "next/navigation";

// Dashboard privé : la racine redirige vers l'authentification
export default function Home() {
  redirect("/login");
}
