interface FeedbackProps {
  message: string | null;
  isError: boolean;
}

export function Feedback({ message, isError }: FeedbackProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={[
        "fixed bottom-6 right-6 z-30 max-w-[min(520px,calc(100vw-48px))] rounded-control border px-4 py-3 text-sm font-bold shadow-panel backdrop-blur",
        isError
          ? "border-red-200 bg-red-50/95 text-signal-red"
          : "border-line bg-white/95 text-ink"
      ].join(" ")}
      role="status"
    >
      {message}
    </div>
  );
}
