import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import type { HouseholdMemberProfile } from "@/types";

interface InitialValues {
  title: string;
  subject_id: string;
  date: string;
  time: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  car_needed: boolean;
  driver_id: string | null;
}

interface Props {
  profiles: Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">[];
  error?: string | null;
  initialValues?: InitialValues;
  eventId?: string;
}

export default function EventForm({ profiles, error, initialValues, eventId }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [carNeeded, setCarNeeded] = useState(initialValues?.car_needed ?? false);

  const isEditMode = Boolean(initialValues && eventId);
  const action = isEditMode ? `/api/events/${eventId}` : "/api/events";

  return (
    <form method="POST" action={action} className="space-y-4">
      <ServerError message={error} />

      <div>
        <label htmlFor="title" className="mb-1 block text-sm text-blue-100/80">
          Tytuł *
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          placeholder="np. Wizyta u dentysty"
          defaultValue={initialValues?.title}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="subject_id" className="mb-1 block text-sm text-blue-100/80">
          Osoba *
        </label>
        <select
          id="subject_id"
          name="subject_id"
          required
          defaultValue={initialValues?.subject_id ?? ""}
          className="w-full rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-white [color-scheme:dark] focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        >
          <option value="">-- wybierz osobę --</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ({p.kind === "adult" ? "dorosły" : "dziecko"})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className="mb-1 block text-sm text-blue-100/80">
            Data *
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={initialValues?.date ?? today}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="time" className="mb-1 block text-sm text-blue-100/80">
            Godzina *
          </label>
          <input
            id="time"
            name="time"
            type="time"
            lang="pl"
            required
            defaultValue={initialValues?.time}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="duration_minutes" className="mb-1 block text-sm text-blue-100/80">
          Czas trwania (minuty) *
        </label>
        <input
          id="duration_minutes"
          name="duration_minutes"
          type="number"
          required
          min={10}
          max={1440}
          step={10}
          placeholder="60"
          defaultValue={initialValues?.duration_minutes}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="location" className="mb-1 block text-sm text-blue-100/80">
          Lokalizacja
        </label>
        <input
          id="location"
          name="location"
          type="text"
          maxLength={300}
          placeholder="np. ul. Kwiatowa 1"
          defaultValue={initialValues?.location ?? ""}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm text-blue-100/80">
          Notatki
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={2000}
          rows={3}
          placeholder="Dodatkowe informacje..."
          defaultValue={initialValues?.notes ?? ""}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="car_needed"
          name="car_needed"
          type="checkbox"
          value="on"
          checked={carNeeded}
          onChange={(e) => {
            setCarNeeded(e.target.checked);
          }}
          className="h-4 w-4 rounded border-white/20 accent-blue-400"
        />
        <label htmlFor="car_needed" className="text-sm text-blue-100/80">
          Auto potrzebne
        </label>
      </div>

      {carNeeded && (
        <div>
          <label htmlFor="driver_id" className="mb-1 block text-sm text-blue-100/80">
            Kto jedzie
          </label>
          <select
            id="driver_id"
            name="driver_id"
            defaultValue={initialValues?.driver_id ?? ""}
            className="w-full rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-white [color-scheme:dark] focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
          >
            <option value="">-- brak kierowcy --</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
      >
        {isEditMode ? "Zapisz zmiany" : "Dodaj wydarzenie"}
      </button>
    </form>
  );
}
