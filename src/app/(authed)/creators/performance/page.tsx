import Performance from "@/views/Performance";

/** "Performance for Us" — counted (approval-gated) posts only. */
export default function CreatorPerformancePage() {
  return <Performance scope="counted" />;
}
