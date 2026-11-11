export function DashboardHeader() {
  return (
    <header
      data-testid="dashboard-header"
      className="flex items-center gap-3 border-b border-[color:var(--project-list-divider)] px-5 py-3"
    >
      <h1 className="text-lg font-semibold">Your Projects</h1>
    </header>
  );
}
