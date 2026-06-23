import { useState } from "react";

interface Props {
  eventId: string;
}

export default function DeleteEventButton({ eventId }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setConfirming(true);
        }}
        className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-400/20"
      >
        Usuń
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-blue-100/80">Na pewno usunąć?</span>
      <form method="POST" action={`/api/events/${eventId}/delete`}>
        <button
          type="submit"
          className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-sm text-red-200 transition-colors hover:bg-red-500/30"
        >
          Tak, usuń
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
        }}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
      >
        Anuluj
      </button>
    </div>
  );
}
