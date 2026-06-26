// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import type { HouseholdMemberProfile } from "@/types";
import EventForm from "@/components/events/EventForm";

// @testing-library/react auto-cleanup requires a global afterEach which Vitest does not
// expose unless globals:true is set.  Register it explicitly here.
afterEach(cleanup);

function makeProfile(overrides = {}): Pick<HouseholdMemberProfile, "id" | "display_name" | "kind"> {
  return { id: "p-1", display_name: "Alice", kind: "adult", ...overrides };
}

function makeInitialValues(overrides = {}) {
  return {
    title: "Test event",
    subject_id: "p-1",
    date: "2026-06-20",
    time: "09:00",
    duration_minutes: 60,
    location: null,
    notes: null,
    car_needed: false,
    driver_id: null,
    ...overrides,
  };
}

describe("create mode", () => {
  it('T17: renders "Dodaj wydarzenie" submit button', () => {
    render(<EventForm profiles={[makeProfile()]} />);
    expect(screen.getByRole("button", { name: /dodaj wydarzenie/i })).toBeTruthy();
  });

  it("T18: driver dropdown NOT rendered by default", () => {
    render(<EventForm profiles={[makeProfile()]} />);
    expect(screen.queryByLabelText(/kto jedzie/i)).toBeNull();
  });
});

describe("edit mode", () => {
  it('T19: renders "Zapisz zmiany" submit button', () => {
    render(<EventForm profiles={[makeProfile()]} initialValues={makeInitialValues()} eventId="evt-1" />);
    expect(screen.getByRole("button", { name: /zapisz zmiany/i })).toBeTruthy();
  });

  it("T20: pre-fills title input from initialValues", () => {
    // React 19 + jsdom does not reflect defaultValue via DOM APIs (element.value / getAttribute);
    // use renderToString which includes value="..." in SSR HTML output.
    const html = renderToString(
      <EventForm profiles={[makeProfile()]} initialValues={makeInitialValues({ title: "Wizyta" })} eventId="evt-1" />,
    );
    expect(html).toContain('value="Wizyta"');
  });

  it("T21: driver dropdown NOT rendered when car_needed is false", () => {
    render(
      <EventForm profiles={[makeProfile()]} initialValues={makeInitialValues({ car_needed: false })} eventId="evt-1" />,
    );
    expect(screen.queryByLabelText(/kto jedzie/i)).toBeNull();
  });

  it("T22: driver dropdown rendered when car_needed is true", () => {
    render(
      <EventForm profiles={[makeProfile()]} initialValues={makeInitialValues({ car_needed: true })} eventId="evt-1" />,
    );
    expect(screen.getByLabelText(/kto jedzie/i)).toBeTruthy();
  });
});

describe("car/driver toggle", () => {
  it("T23: clicking car_needed shows driver dropdown", async () => {
    const user = userEvent.setup();
    render(<EventForm profiles={[makeProfile()]} />);
    await user.click(screen.getByLabelText(/auto potrzebne/i));
    expect(screen.getByLabelText(/kto jedzie/i)).toBeTruthy();
  });

  it("T24: clicking car_needed twice hides driver dropdown", async () => {
    const user = userEvent.setup();
    render(<EventForm profiles={[makeProfile()]} />);
    await user.click(screen.getByLabelText(/auto potrzebne/i));
    await user.click(screen.getByLabelText(/auto potrzebne/i));
    expect(screen.queryByLabelText(/kto jedzie/i)).toBeNull();
  });
});
