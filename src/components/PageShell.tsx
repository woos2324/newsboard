import { AppShell } from "@/components/AppShell";

type Props = {
  title?: string;
  description?: string;
  children: React.ReactNode;
};

export function PageShell({ title, description, children }: Props) {
  return (
    <AppShell>
      <main className="flex-1 px-6 py-6">
        {title ? (
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </main>
    </AppShell>
  );
}
