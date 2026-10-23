import { describe, expect, it } from "vitest";
import { acceptPvpHit, meleeDamage } from "../pvp";

describe("pvp rules", () => {
  it("full charge deals the weapon's full damage", () => {
    expect(meleeDamage(7, 1, false)).toBeCloseTo(7);
  });
  it("spam-clicking (no charge) deals 20% damage", () => {
    expect(meleeDamage(7, 0, false)).toBeCloseTo(1.4);
  });
  it("critical hits deal 1.5x", () => {
    expect(meleeDamage(6, 1, true)).toBeCloseTo(9);
  });
  it("ignores hits from too far away", () => {
    expect(acceptPvpHit(5, 7, 0)).toBe(0);
  });
  it("ignores hits during invulnerability", () => {
    expect(acceptPvpHit(5, 2, 0.3)).toBe(0);
  });
  it("caps impossible damage at 12", () => {
    expect(acceptPvpHit(50, 2, 0)).toBe(12);
  });
  it("accepts a normal hit", () => {
    expect(acceptPvpHit(4, 3, 0)).toBe(4);
  });
});
