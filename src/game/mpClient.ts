import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const OWNER_KEY = "mc_mp_owner_tokens_v1";
const PASS_KEY = "mc_mp_passwords_v1";

function readMap(key: string): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function writeMap(key: string, m: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export const normAddr = (a: string) => String(a || "").trim().toUpperCase().slice(0, 64);

/** Owner token proves this device created the server (never leaves the browser in clear except to verify). */
export function getOwnerToken(address: string, create = false): string {
  const m = readMap(OWNER_KEY);
  const k = normAddr(address);
  if (!m[k] && create) {
    m[k] = crypto.randomUUID() + crypto.randomUUID();
    writeMap(OWNER_KEY, m);
  }
  return m[k] || "";
}

export function getSavedPassword(address: string): string {
  return readMap(PASS_KEY)[normAddr(address)] || "";
}
export function savePassword(address: string, pw: string) {
  const m = readMap(PASS_KEY);
  m[normAddr(address)] = pw;
  writeMap(PASS_KEY, m);
}

export interface PublicServer {
  address: string;
  name: string;
  motd: string;
  icon: string;
  seed: number;
  owner_name: string;
  has_password: boolean;
  last_seen: string;
}

export async function listPublicServers(): Promise<PublicServer[]> {
  const { data } = await supabase
    .from("mp_servers")
    .select("address,name,motd,icon,seed,owner_name,has_password,last_seen")
    .order("last_seen", { ascending: false })
    .limit(100);
  return (data || []) as PublicServer[];
}

export const isOnline = (s: { last_seen: string }) =>
  Date.now() - new Date(s.last_seen).getTime() < 3 * 60 * 1000;

/** Resize any uploaded image to a 64x64 PNG data URL (Minecraft server icon size). */
export function fileToServerIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext("2d")!;
      const s = Math.min(img.width, img.height);
      ctx.imageSmoothingEnabled = img.width > 128;
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 64, 64);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Imagen no válida"));
    img.src = url;
  });
}

export const isImageIcon = (icon?: string) => !!icon && icon.startsWith("data:image");

/**
 * WebSocket-like adapter over a realtime channel so the engine can keep
 * using `ws.send(JSON)` / `onmessage` semantics.
 */
export class RealtimeSocket {
  readyState = 0;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private channel: RealtimeChannel;
  private known = new Map<string, { name: string; skin: string | null }>();

  constructor(
    public room: string,
    public id: string,
    public name: string,
    public skin: string | null,
    public isOwner: boolean,
    public ownerName: string,
    private initial: () => { pos: number[]; yaw: number; pitch: number; held: string | null },
  ) {
    this.channel = supabase.channel(`mp:${room}`, {
      config: { broadcast: { self: false }, presence: { key: id } },
    });
    this.channel
      .on("broadcast", { event: "m" }, ({ payload }) => {
        const p = payload as { type: string; id?: string };
        if (p.type === "hello") {
          this.deliver({ ...p, type: "player_update" });
          return;
        }
        const out = this.filter(p);
        if (out) this.deliver(out);
      })
      .on("presence", { event: "sync" }, () => this.syncPresence())
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          this.readyState = 1;
          await this.channel.track({ id, name, skin, isOwner, t: Date.now() });
          this.deliver({
            type: "joined",
            room,
            id,
            isOwner,
            ownerName,
            players: [],
          });
          const s = this.initial();
          this.raw({ type: "hello", id, name, skin, ...s });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.onerror?.();
        } else if (status === "CLOSED") {
          this.readyState = 3;
        }
      });
  }

  private deliver(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  private raw(msg: Record<string, unknown>) {
    this.channel.send({ type: "broadcast", event: "m", payload: msg });
  }

  private syncPresence() {
    const state = this.channel.presenceState() as Record<
      string,
      { id: string; name: string; skin: string | null }[]
    >;
    const present = new Set<string>();
    for (const [key, metas] of Object.entries(state)) {
      if (key === this.id || !metas[0]) continue;
      present.add(key);
      if (!this.known.has(key)) {
        const m = metas[0];
        this.known.set(key, { name: m.name, skin: m.skin });
        this.deliver({
          type: "player_joined",
          player: { id: key, name: m.name, skin: m.skin, pos: [0, -100, 0], yaw: 0, pitch: 0 },
        });
        // let the newcomer know where we are right away
        const s = this.initial();
        this.raw({ type: "player_update", id: this.id, ...s, swing: 0 });
      }
    }
    for (const [key, v] of [...this.known]) {
      if (!present.has(key)) {
        this.known.delete(key);
        this.deliver({ type: "player_left", id: key, name: v.name });
      }
    }
  }

  /** Engine-facing API: translate client messages into broadcasts. */
  send(text: string) {
    if (this.readyState !== 1) return;
    const msg = JSON.parse(text);
    switch (msg.type) {
      case "state":
        this.raw({ type: "player_update", id: this.id, ...msg });
        break;
      case "block_change":
        this.raw({ type: "block_change", by: this.id, x: msg.x, y: msg.y, z: msg.z, id: msg.id });
        break;
      case "chat":
        this.raw({ type: "chat", from: this.name, text: String(msg.text).slice(0, 200) });
        this.deliver({ type: "chat", from: this.name, text: msg.text });
        break;
      case "kick":
      case "ban":
        if (this.isOwner) this.raw({ type: "kick_target", target: msg.target, ban: msg.type === "ban" });
        break;
      case "pvp_hit":
        this.raw({
          type: "pvp_hit",
          by: this.id,
          byName: this.name,
          target: String(msg.target),
          dmg: Number(msg.dmg) || 0,
          dir: Array.isArray(msg.dir) ? msg.dir.slice(0, 2) : [0, 0],
          kb: Number(msg.kb) || 1,
          crit: !!msg.crit,
        });
        break;
      case "hurt":
        this.raw({ type: "player_hurt", id: this.id });
        break;
      case "death":
        this.raw({ type: "player_death", id: this.id, text: String(msg.text || "").slice(0, 80) });
        this.deliver({ type: "chat", from: "Servidor", text: `§c${String(msg.text || "")}` });
        break;
      case "respawn":
        this.raw({ type: "player_respawn", id: this.id });
        break;
    }
  }

  /** Handle messages addressed to this player that are not engine-native. */
  filter(msg: { type: string; target?: string; ban?: boolean }): Record<string, unknown> | null {
    if (msg.type === "kick_target") {
      if (String(msg.target).toLowerCase() === this.name.toLowerCase()) {
        return { type: msg.ban ? "banned" : "kicked" };
      }
      return null;
    }
    return msg as Record<string, unknown>;
  }

  close() {
    this.readyState = 3;
    supabase.removeChannel(this.channel);
  }
}
