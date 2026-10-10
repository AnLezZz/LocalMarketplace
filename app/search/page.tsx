import ProviderSearch, { type SearchParams } from "../../components/ProviderSearch";

export const dynamic = "force-dynamic";

export default async function Search({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <ProviderSearch params={await searchParams} basePath="/search" />;
}
