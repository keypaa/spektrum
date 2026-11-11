export function AccountChip({
  userName,
}: {
  userName: string;
  userEmail: string;
}) {
  return (
    <button
      type="button"
      data-testid="account-chip"
      className="ml-2 mt-3 flex items-center gap-1.5 rounded-lg px-5 py-2"
    >
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-button-secondary-bg text-xs font-medium text-button-secondary-text">
        {userName.charAt(0).toUpperCase()}
      </span>
      <span className="truncate text-sm font-medium">{userName}</span>
    </button>
  );
}
