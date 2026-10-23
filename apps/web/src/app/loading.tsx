import { PageHeading } from "@/components/page-heading";
import { Card, CardContent } from "@/components/zuno/card";
import { Skeleton } from "@/components/zuno/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 p-6" aria-busy="true">
      <PageHeading title="Cargando Legal" description="Estamos preparando la información." />
      <Card className="gap-0 rounded-lg border-border py-0 shadow-sm">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-4/5 max-w-lg" />
        </CardContent>
      </Card>
    </main>
  );
}
