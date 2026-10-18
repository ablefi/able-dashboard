import CreatorDetail from "@/views/able/CreatorDetail";

export default async function CreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreatorDetail id={id} />;
}
