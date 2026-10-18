import { redirect } from "next/navigation";

/** General Creative Performance (every post, approved or not) was retired
 * from the dashboard on 8 Oct 2026; old links land on Performance. */
export default function CreatorPerformanceAllPage() {
  redirect("/creators/performance");
}
