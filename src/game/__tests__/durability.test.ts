import { describe, expect, it } from "vitest";
import { matchGrid, normalizeSlot, repairResult } from "../engine";

describe("tool durability", () => {
  it("two damaged wooden pickaxes repair into one with summed durability + 5% bonus", () => {
    const g = [
      { id: "wood_pickaxe", count: 1, durability: 20 },
      { id: "wood_pickaxe", count: 1, durability: 10 },
      null,
      null,
    ];
    // 20 + 10 + floor(59 * 0.05) = 32
    expect(repairResult(g, null)?.durability).toBe(32);
    expect(matchGrid(g, null)?.out).toBe("wood_pickaxe");
  });

  it("repair never exceeds the tool's max durability", () => {
    const g = [
      { id: "wood_sword", count: 1, durability: 50 },
      { id: "wood_sword", count: 1, durability: 50 },
    ];
    expect(repairResult(g, null)?.durability).toBe(59);
  });

  it("different tools cannot be combined", () => {
    const g = [
      { id: "wood_sword", count: 1, durability: 5 },
      { id: "wood_pickaxe", count: 1, durability: 5 },
    ];
    expect(repairResult(g, null)).toBeNull();
  });

  it("old starter ids load as real tools with durability", () => {
    expect(normalizeSlot({ id: "wooden_pickaxe", count: 1 })).toEqual({
      id: "wood_pickaxe",
      count: 1,
      durability: 59,
    });
  });
});
