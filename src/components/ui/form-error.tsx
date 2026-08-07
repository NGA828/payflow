/** Inline error banner for server-action forms. Renders nothing without a message. */
export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
      {message}
    </p>
  );
}
