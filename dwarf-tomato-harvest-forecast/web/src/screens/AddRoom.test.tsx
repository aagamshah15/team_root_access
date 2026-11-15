import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AddRoom, { roomLabel } from "./AddRoom";
import { DRAFT_KEY, loadDraft } from "./AddRoomStore";

const TODAY = "2027-04-30";
const CLIMATE = "timestamp,air_temp_c\n2027-03-01T00:00,19.5\n2027-03-01T12:00,24.0\n2027-03-02T00:00,18.9\n";
const PLANTS = "date,plant,fruit_weight_g,red_fruit_weight_g\n2027-04-20,1,210,40\n2027-04-20,2,190,0\n";

function csv(name: string, text: string) {
  return new File([text], name, { type: "text/csv" });
}
function pick(label: RegExp, files: File[]) {
  fireEvent.change(screen.getByLabelText(label, { selector: "input" }), { target: { files } });
}
function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label, { selector: "input" }), { target: { value } });
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("AddRoom screen", () => {
  it("mounts with no props and says nothing is uploaded", () => {
    render(<AddRoom />);
    expect(screen.getByRole("heading", { name: "Add a room" })).toBeTruthy();
    expect(screen.getByText("Nothing is uploaded.")).toBeTruthy();
  });

  it("blocks submit and explains every missing required field", async () => {
    render(<AddRoom today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /check and save draft/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Give the room a name/)).toBeTruthy();
    expect(screen.getByText(/Planting date is required/)).toBeTruthy();
    expect(screen.getByText(/Add the room’s climate log/)).toBeTruthy();
    expect(loadDraft()).toBeNull();
  });

  it("checks files in the browser, then saves a draft and shows the summary", async () => {
    render(<AddRoom today={TODAY} />);
    type(/room name/i, "North");
    type(/growing area/i, "96");
    type(/planting date/i, "2027-03-01");
    pick(/climate log/i, [csv("north-climate.csv", CLIMATE)]);
    pick(/plant weighings/i, [csv("north-plants.csv", PLANTS)]);
    // 3 rows, 1 Mar – 2 Mar
    expect(await screen.findByText("3 rows, 1 Mar 2027 – 2 Mar 2027")).toBeTruthy();
    expect(await screen.findByText("2 plants weighed on 1 day (20 Apr 2027)")).toBeTruthy();
    // planted 1 Mar, today 30 Apr: 30 (rest of Mar) + 30 (Apr) = day 60
    expect(screen.getByText("Day 60 today")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /check and save draft/i }));
    const line = await screen.findByTestId("summary-line");
    expect(line.textContent).toBe("Room North · planted 1 Mar 2027 · 2 files OK");
    expect(screen.getByText(/made by our team’s pipeline, not in this browser/)).toBeTruthy();

    const saved = loadDraft();
    expect(saved).toMatchObject({ draft: true, name: "North", areaM2: 96, plantingDate: "2027-03-01" });
    expect(saved!.files.map((f) => f.kind)).toEqual(["climate", "plants"]);
    // file contents are never stored, only the check summary
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toContain("19.5");
  });

  it("re-checks weighings when the planting date moves after them", async () => {
    render(<AddRoom today={TODAY} />);
    pick(/plant weighings/i, [csv("p.csv", PLANTS)]);
    await screen.findByText(/2 plants weighed/);
    type(/planting date/i, "2027-04-25"); // after the 20 Apr weighings
    await waitFor(() => expect(screen.getByText(/Weighings dated before the planting date \(25 Apr 2027\)/)).toBeTruthy());
  });

  it("flags a planting date after the first climate-log day", async () => {
    render(<AddRoom today={TODAY} />);
    pick(/climate log/i, [csv("c.csv", CLIMATE)]);
    await screen.findByText(/3 rows/);
    type(/planting date/i, "2027-03-05");
    fireEvent.blur(screen.getByLabelText(/planting date/i, { selector: "input" }));
    expect(screen.getByText(/climate log starts on 1 Mar 2027, before the planting date 5 Mar 2027/)).toBeTruthy();
  });

  it("restores a saved draft and can remove it", async () => {
    render(<AddRoom today={TODAY} />);
    type(/room name/i, "Room 7");
    type(/growing area/i, "120");
    type(/planting date/i, "2027-03-01");
    pick(/climate log/i, [csv("c.csv", CLIMATE)]);
    pick(/plant weighings/i, [csv("p.csv", PLANTS)]);
    await screen.findByText(/2 plants weighed/);
    fireEvent.click(screen.getByRole("button", { name: /check and save draft/i }));
    await screen.findByTestId("summary-line");
    cleanup();

    render(<AddRoom today={TODAY} />);
    expect(screen.getByTestId("summary-line").textContent).toBe("Room 7 · planted 1 Mar 2027 · 2 files OK");
    fireEvent.click(screen.getByRole("button", { name: /remove draft/i }));
    expect(loadDraft()).toBeNull();
    expect(screen.getByRole("button", { name: /check and save draft/i })).toBeTruthy();
  });

  it("labels rooms without doubling the word Room", () => {
    expect(roomLabel("North")).toBe("Room North");
    expect(roomLabel("room 4")).toBe("room 4");
  });
});
