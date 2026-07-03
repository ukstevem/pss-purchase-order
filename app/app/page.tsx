import { PageHeader } from "@platform/ui";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="p-8">
      <PageHeader title="Dashboard" />
      <p className="text-sm text-zinc-500">Scaffold placeholder — dashboard lands with phase 1.</p>
    </div>
  );
}
