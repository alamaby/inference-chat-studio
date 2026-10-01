import { describe, expect, it } from "vitest";
import {
  isMaxOutputValid,
  isTemperatureValid,
  isTimeoutValid
} from "./SettingsSimple";

describe("isTemperatureValid", () => {
  it("accepts null (auto)", () => {
    expect(isTemperatureValid(null)).toBe(true);
  });

  it("accepts values within -2..2", () => {
    expect(isTemperatureValid(-2)).toBe(true);
    expect(isTemperatureValid(0)).toBe(true);
    expect(isTemperatureValid(0.7)).toBe(true);
    expect(isTemperatureValid(2)).toBe(true);
  });

  it("rejects values outside -2..2", () => {
    expect(isTemperatureValid(-2.1)).toBe(false);
    expect(isTemperatureValid(99)).toBe(false);
  });
});

describe("isMaxOutputValid", () => {
  it("accepts null (auto)", () => {
    expect(isMaxOutputValid(null)).toBe(true);
  });

  it("accepts positive integers", () => {
    expect(isMaxOutputValid(1)).toBe(true);
    expect(isMaxOutputValid(1024)).toBe(true);
    expect(isMaxOutputValid(128000)).toBe(true);
  });

  it("rejects zero, negative, and non-integer values", () => {
    expect(isMaxOutputValid(0)).toBe(false);
    expect(isMaxOutputValid(-5)).toBe(false);
    expect(isMaxOutputValid(1.5)).toBe(false);
  });
});

describe("isTimeoutValid", () => {
  it("accepts null (auto)", () => {
    expect(isTimeoutValid(null)).toBe(true);
  });

  it("accepts integers within 1000..120000", () => {
    expect(isTimeoutValid(1000)).toBe(true);
    expect(isTimeoutValid(30000)).toBe(true);
    expect(isTimeoutValid(120000)).toBe(true);
  });

  it("rejects values outside range and non-integers", () => {
    expect(isTimeoutValid(50)).toBe(false);
    expect(isTimeoutValid(999)).toBe(false);
    expect(isTimeoutValid(120001)).toBe(false);
    expect(isTimeoutValid(1500.5)).toBe(false);
  });
});
