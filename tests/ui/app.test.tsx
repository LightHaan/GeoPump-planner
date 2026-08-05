// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("Phase 4 minimum frontend", () => {
  beforeEach(() => {
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

  it("loads postcode 3000, recalculates editable ground inputs, and exposes reset/export", async () => {
    render(<App />);
    expect(await screen.findByText("GSHP and ASHP comparison", {}, { timeout: 10_000 })).toBeTruthy();
    const depth = screen.getByRole("spinbutton", { name: /Target depth/ });
    fireEvent.change(depth, { target: { value: "30" } });
    await waitFor(() => expect(screen.getAllByText("19.60°C").length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole("combobox", { name: /Surface-temperature dataset/ }), {
      target: { value: "air_t" },
    });
    await waitFor(() => expect(screen.getAllByText("17.69°C").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Export scenario JSON" }).hasAttribute("disabled"))
      .toBe(false);
    expect(screen.getByText("Dataset 2026.08.05-phase2-web")).toBeTruthy();
    expect(screen.getByText("Not applicable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore paper defaults" }));
    await waitFor(() => expect((depth as HTMLInputElement).value).toBe("20"));
  });

  it("imports a validated scenario JSON and exposes CSV export", async () => {
    render(<App />);
    await screen.findByText("GSHP and ASHP comparison", {}, { timeout: 10_000 });
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
    expect(screen.getByRole("button", { name: "Export results CSV" }).hasAttribute("disabled"))
      .toBe(false);
  });
});
