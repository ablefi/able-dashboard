import { redirect } from "next/navigation";

/** Outliers now lives as a tab inside Posts. */
export default function CreatorOutliersPage() {
  redirect("/creators/posts?view=outliers");
}
