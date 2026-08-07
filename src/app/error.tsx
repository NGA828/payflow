"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to server logs via Next error reporting; kept out of the UI.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <p className="text-6xl font-bold text-danger tnum">500</p>
      <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        An unexpected error occurred. Please try again — if the problem persists, contact support.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        Try again
      </button>
    </div>
  );
}
