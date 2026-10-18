import Posts from "@/views/Posts";

export default async function CreatorPostsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <Posts initialView={view === "outliers" ? "outliers" : "posts"} />;
}
