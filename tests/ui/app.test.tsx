// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/postcode-map", () => ({
  PostcodeMap: ({ selectedPostcode }: { selectedPostcode: string | null }) => (
    <section aria-label="Interactive Australian postcode map">
      Postcode map · {selectedPostcode}
    </section>
  ),
}));

import App from "../../src/App";
import { clonePaperDefaults } from "../../src/parameters/defaults";

const attributes = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/postcode-attributes.json"), "utf8"),
) as Record<string, unknown>;
const climate = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/climate/3000.json"), "utf8"),
) as unknown;
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/manifest.json"), "utf8"),
) as unknown;

function response(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => structuredClone(value),
  } as Response;
}

async function openPage(name: "Planner" | "Results" | "Customise" | "Guide" | "Glossary") {
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  fireEvent.click(within(navigation).getByRole("link", { name }));
  await waitFor(() => expect(within(navigation).getByRole("link", { name }).getAttribute("aria-current")).toBe("page"));
}

describe("GeoPump Planner pages", () => {
  beforeEach(() => {
    window.location.hash = "";
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("postcode-index.json")) {
        return response([{
          postcode: "3000",
          locality_hint: "3000",
          state: null,
          lat: -37.81315551,
          lon: 144.962375,
          has_ground_data: true,
          has_load_data: true,
          has_climate_data: true,
        }]);
      }
      if (url.includes("postcode-attributes.json")) {
        return response({ "3000": attributes["3000"] });
      }
      if (url.includes("manifest.json")) return response(manifest);
      if (url.includes("climate/3000.json")) return response(climate);
      throw new Error(`Unexpected URL: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the home page concise and moves full settings and results to separate pages", async () => {
    render(<App />);
    expect(await screen.findByText("Screening result", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Plan by postcode." })).toBeTruthy();
    expect(screen.getByLabelText("Interactive Australian postcode map")).toBeTruthy();
    expect(screen.queryByText("GSHP and ASHP comparison")).toBeNull();
    expect(screen.getByRole("link", { name: "Read the guide" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Customise the model" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Geoscience Australia — Australian mean land-surface temperature (recommended)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "CSIRO — Hourly near-surface air temperature grids for Australia (long-term climatology)" })).toBeTruthy();
    expect(screen.getByText("Potentially suitable — review inputs")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review assumptions →" }).getAttribute("href")).toBe("#customise");

    expect(screen.queryByText("Climate records")).toBeNull();
    expect(screen.queryByText("ΔT20 prediction SE")).toBeNull();
    expect(screen.getByText(/Estimated underground warming rate:/)).toBeTruthy();

    const quickDepth = screen.getByRole("spinbutton", { name: "Depth to estimate" });
    fireEvent.change(quickDepth, { target: { value: "30" } });
    await waitFor(() => expect(screen.getByText("19.60 °C")).toBeTruthy());

    await openPage("Customise");
    expect(screen.getByRole("heading", { name: "Customise the model" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: /Surface-temperature dataset/ }), {
      target: { value: "air_t" },
    });
    await waitFor(() => expect(screen.getAllByText("17.69°C").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Export scenario" }).hasAttribute("disabled")).toBe(false);

    await openPage("Results");
    expect(screen.getByText("Ground-source and air-source comparison")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export CSV" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Data evidence and quality")).toBeTruthy();

    await openPage("Guide");
    expect(screen.getByRole("heading", { name: "How to use GeoPump Planner" })).toBeTruthy();
    expect(screen.getByText(/If annual degree-hours are zero/)).toBeTruthy();

    await openPage("Glossary");
    expect(screen.getByRole("heading", { name: "Plain-English glossary" })).toBeTruthy();
    expect(screen.getByText("Estimated underground warming rate")).toBeTruthy();
    expect(screen.getByText("Coefficient of performance (COP)")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Ground-temperature terms" }));
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Glossary" }).getAttribute("aria-current")).toBe("page"));
  });

  it("imports a validated scenario from the Customise page", async () => {
    render(<App />);
    await screen.findByText("Screening result", {}, { timeout: 10_000 });
    await openPage("Customise");
    const importedParameters = clonePaperDefaults();
    importedParameters.load.heating_balance_temperature_c = 13;
    const imported = {
      schemaVersion: "1.0.0",
      exportedAt: "2026-08-06T00:00:00.000Z",
      postcode: "3000",
      sourceSnapshot: attributes["3000"],
      inputs: {
        surfaceTemperatureC: 18.1585865,
        gradientCPerM: 0.04796821,
        boreholeTemperatureC: null,
        boreholeDepthM: null,
        directGroundTemperatureC: 19.11795074,
        annualHeatingKwhM2: 22.22222222,
        annualCoolingKwhM2: 6.11111111,
      },
      parameters: importedParameters,
      outcome: {},
    };
    const file = new File([JSON.stringify(imported)], "scenario.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(imported) });
    fireEvent.change(screen.getByLabelText("Import scenario JSON file"), {
      target: { files: [file] },
    });
    await screen.findByText(/Scenario for postcode 3000 imported/);
    expect((screen.getByRole("spinbutton", { name: /Heating demand threshold/ }) as HTMLInputElement).value)
      .toBe("13");
  }, 15_000);
});
