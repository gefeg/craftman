// Shared Minecraft-style melee rules used for both mobs and player-vs-player hits.

/** Damage of one melee hit: charge (0..1) scales it like the Java attack cooldown, critical = x1.5. */
export function meleeDamage(base: number, charge: number, crit: boolean): number {
  const c = Math.max(0, Math.min(1, charge));
  const dmg = base * (0.2 + c * c * 0.8);
  return crit ? dmg * 1.5 : dmg;
}

/** Highest damage a single legit hit can deal (netherite sword 8 x crit 1.5). */
export const MAX_PVP_DAMAGE = 12;
/** Max distance (blocks) between attacker and victim for a hit to count. */
export const MAX_PVP_REACH = 6;
/** Invulnerability after being hit, like Minecraft's 10 ticks. */
export const PVP_INVULN_SECONDS = 0.5;

/** Victim-side check of an incoming hit. Returns the damage to apply, or 0 when it must be ignored. */
export function acceptPvpHit(dmg: number, distance: number, invulnLeft: number): number {
  if (!Number.isFinite(dmg) || dmg <= 0) return 0;
  if (!Number.isFinite(distance) || distance > MAX_PVP_REACH) return 0;
  if (invulnLeft > 0) return 0;
  return Math.min(dmg, MAX_PVP_DAMAGE);
}
