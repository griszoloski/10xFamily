import { describe, it, expect } from "vitest";
import type { EventWithProfiles } from "@/lib/services/events";
import { detectCarConflicts } from "@/lib/services/events";

function makeEvent(overrides: Partial<EventWithProfiles> = {}): EventWithProfiles {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    subject_id: "sub-1",
    driver_id: null,
    title: "Test event",
    starts_at: "2026-06-20T09:00:00",
    duration_minutes: 60,
    location: null,
    notes: null,
    car_needed: false,
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    subject: { id: "sub-1", display_name: "Alice", kind: "adult" },
    driver: null,
    ...overrides,
  };
}

describe("detectCarConflicts", () => {
  describe("baseline", () => {
    it("empty array returns no pairs", () => {
      expect(detectCarConflicts([])).toEqual([]);
    });

    it("single car event returns no pairs", () => {
      const event = makeEvent({ car_needed: true });
      expect(detectCarConflicts([event])).toEqual([]);
    });
  });

  describe("car_needed filter (R2 — false positive)", () => {
    it("two non-car events overlapping return no pairs", () => {
      const a = makeEvent({ car_needed: false, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: false, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toEqual([]);
    });

    it("one car + one non-car overlapping return no pairs", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: false, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toEqual([]);
    });
  });

  describe("same-day filter (R2 — false positive)", () => {
    it("two car events on different days return no pairs", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-21T09:00:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toEqual([]);
    });
  });

  describe("boundary / overlap (R1 — false negative)", () => {
    it("touching (A ends exactly when B starts) is NOT a conflict per PRD", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T10:00:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toEqual([]);
    });

    it("touching in reverse (B ends exactly when A starts) is NOT a conflict per PRD", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T10:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toEqual([]);
    });

    it("two car events with clear overlap return one pair", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:30:00", duration_minutes: 60 });
      const pairs = detectCarConflicts([a, b]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].a).toBe(a);
      expect(pairs[0].b).toBe(b);
    });

    it("one event fully contained in another returns one pair", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 180 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:30:00", duration_minutes: 30 });
      const pairs = detectCarConflicts([a, b]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].a).toBe(a);
      expect(pairs[0].b).toBe(b);
    });

    it("three car events all overlapping return three pairs", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 120 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:30:00", duration_minutes: 60 });
      const c = makeEvent({ car_needed: true, starts_at: "2026-06-20T10:00:00", duration_minutes: 90 });
      expect(detectCarConflicts([a, b, c])).toHaveLength(3);
    });

    it("three car events, only two overlap, return one pair", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T09:30:00", duration_minutes: 60 });
      const c = makeEvent({ car_needed: true, starts_at: "2026-06-20T11:00:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b, c])).toHaveLength(1);
    });
  });

  describe("naive-string same-day assumption (R6 — midnight boundary)", () => {
    it("two car events on same naive calendar day near midnight return one pair", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T22:00:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-20T22:30:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toHaveLength(1);
    });

    it("two car events on consecutive naive calendar days do not conflict", () => {
      const a = makeEvent({ car_needed: true, starts_at: "2026-06-20T23:30:00", duration_minutes: 60 });
      const b = makeEvent({ car_needed: true, starts_at: "2026-06-21T00:30:00", duration_minutes: 60 });
      expect(detectCarConflicts([a, b])).toEqual([]);
    });
  });
});
