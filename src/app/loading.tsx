export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-indigo-100 border-t-primary-600" />
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
