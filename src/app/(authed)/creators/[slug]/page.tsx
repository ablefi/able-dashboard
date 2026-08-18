import CreatorDetail from "@/views/CreatorDetail";

export default async function CreatorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CreatorDetail slug={slug} />;
}
