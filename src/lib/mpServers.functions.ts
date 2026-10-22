import { createServerFn } from "@tanstack/react-start";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeAddress(addr: string): string {
  return String(addr || "")
    .trim()
    .toUpperCase()
    .slice(0, 64);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

/** Create or refresh (heartbeat) a public server. Only the owner token can update an existing address. */
export const registerServer = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => ({
    address: normalizeAddress(str(d.address, 64)),
    name: str(d.name, 40) || "Servidor",
    motd: str(d.motd, 80),
    icon: str(d.icon, 60000),
    seed: Number(d.seed) || 0,
    ownerName: str(d.ownerName, 16) || "Steve",
    ownerToken: str(d.ownerToken, 100),
    password: d.password === undefined ? undefined : str(d.password, 64),
  }))
  .handler(async ({ data }) => {
    if (!data.address || !data.ownerToken) return { ok: false, error: "Datos inválidos" };
    const db = await admin();
    const tokenHash = await sha256(data.ownerToken);
    const { data: existing } = await db
      .from("mp_servers")
      .select("owner_token_hash")
      .eq("address", data.address)
      .maybeSingle();
    if (existing && existing.owner_token_hash !== tokenHash) {
      return { ok: false, error: "Esa IP ya está en uso por otro servidor. Elige otra." };
    }
    const row: Record<string, unknown> = {
      address: data.address,
      name: data.name,
      motd: data.motd,
      icon: data.icon || "diamond",
      seed: data.seed,
      owner_name: data.ownerName,
      owner_token_hash: tokenHash,
      last_seen: new Date().toISOString(),
    };
    if (data.password !== undefined) {
      row.has_password = data.password.length > 0;
      row.password_hash = data.password.length > 0 ? await sha256(data.address + ":" + data.password) : null;
    }
    const { error } = await db.from("mp_servers").upsert(row as never);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const unregisterServer = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => ({
    address: normalizeAddress(str(d.address, 64)),
    ownerToken: str(d.ownerToken, 100),
  }))
  .handler(async ({ data }) => {
    const db = await admin();
    const tokenHash = await sha256(data.ownerToken);
    await db.from("mp_servers").delete().eq("address", data.address).eq("owner_token_hash", tokenHash);
    return { ok: true };
  });

async function checkAccess(
  address: string,
  password: string,
  ownerToken: string,
  playerName?: string,
) {
  const db = await admin();
  const { data: srv } = await db
    .from("mp_servers")
    .select("*")
    .eq("address", address)
    .maybeSingle();
  if (!srv) return { ok: false as const, error: "No se encontró ningún servidor con esa IP." };
  const isOwner = !!ownerToken && (await sha256(ownerToken)) === srv.owner_token_hash;
  if (!isOwner && playerName && (srv.banned || []).includes(playerName.toLowerCase())) {
    return { ok: false as const, error: "Estás baneado de este servidor." };
  }
  if (!isOwner && srv.has_password) {
    const h = await sha256(address + ":" + password);
    if (h !== srv.password_hash) return { ok: false as const, error: "Clave de acceso incorrecta." };
  }
  return { ok: true as const, srv, isOwner, db };
}

/** Validate the access key and return the world seed + saved block edits. */
export const joinServer = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => ({
    address: normalizeAddress(str(d.address, 64)),
    password: str(d.password, 64),
    ownerToken: str(d.ownerToken, 100),
    playerName: str(d.playerName, 16),
  }))
  .handler(async ({ data }) => {
    const r = await checkAccess(data.address, data.password, data.ownerToken, data.playerName);
    if (!r.ok) return { ok: false as const, error: r.error };
    const { data: blocks } = await r.db
      .from("mp_blocks")
      .select("x,y,z,block_id")
      .eq("address", data.address)
      .limit(20000);
    return {
      ok: true as const,
      address: r.srv.address,
      name: r.srv.name,
      icon: r.srv.icon,
      seed: Number(r.srv.seed),
      ownerName: r.srv.owner_name,
      isOwner: r.isOwner,
      blocks: (blocks || []).map((b) => ({ x: b.x, y: b.y, z: b.z, id: b.block_id })),
    };
  });

export const saveBlocks = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => ({
    address: normalizeAddress(str(d.address, 64)),
    password: str(d.password, 64),
    ownerToken: str(d.ownerToken, 100),
    changes: (Array.isArray(d.changes) ? d.changes : []).slice(0, 500).map((c) => {
      const o = c as Record<string, unknown>;
      return {
        x: Math.trunc(Number(o.x)) || 0,
        y: Math.trunc(Number(o.y)) || 0,
        z: Math.trunc(Number(o.z)) || 0,
        id: Math.trunc(Number(o.id)) || 0,
      };
    }),
  }))
  .handler(async ({ data }) => {
    if (data.changes.length === 0) return { ok: true };
    const r = await checkAccess(data.address, data.password, data.ownerToken);
    if (!r.ok) return { ok: false, error: r.error };
    const dedup = new Map<string, (typeof data.changes)[number]>();
    for (const c of data.changes) dedup.set(`${c.x},${c.y},${c.z}`, c);
    const rows = [...dedup.values()].map((c) => ({
      address: data.address,
      x: c.x,
      y: c.y,
      z: c.z,
      block_id: c.id,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await r.db.from("mp_blocks").upsert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const setBan = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => ({
    address: normalizeAddress(str(d.address, 64)),
    ownerToken: str(d.ownerToken, 100),
    name: str(d.name, 16).toLowerCase(),
    banned: !!d.banned,
  }))
  .handler(async ({ data }) => {
    const r = await checkAccess(data.address, "", data.ownerToken);
    if (!r.ok || !r.isOwner) return { ok: false };
    const set = new Set<string>(r.srv.banned || []);
    if (data.banned) set.add(data.name);
    else set.delete(data.name);
    await r.db.from("mp_servers").update({ banned: [...set] }).eq("address", data.address);
    return { ok: true };
  });
