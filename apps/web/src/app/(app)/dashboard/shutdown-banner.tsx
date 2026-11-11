export function ShutdownBanner(_props: { onClose: () => void }) {
  return (
    <section
      data-testid="shutdown-banner"
      className="relative flex items-start gap-2 rounded-lg border border-notification-border-warning/25 bg-fg-warning/10 px-3 py-2 pr-11"
    />
  );
}
