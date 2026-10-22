import { useState, useEffect, useRef } from "react";
import {
  getAllWorlds,
  saveWorld,
  deleteWorld,
  createNewWorldRecord,
  exportWorldJson,
  importWorldJson,
  ensureDefaultWorld,
  convertWorldToServer,
  revertServerToWorld,
  getSavedExternalServers,
  saveExternalServer,
  deleteExternalServer,
  type WorldRecord,
  type ServerConfig,
  type ExternalServer,
} from "@/game/worldsDb";
import { sfx } from "@/game/audio";
import { getStoredPlayerName } from "@/game/skinStorage";
import {
  getOwnerToken,
  getSavedPassword,
  savePassword,
  listPublicServers,
  isOnline,
  fileToServerIcon,
  isImageIcon,
  normAddr,
  type PublicServer,
} from "@/game/mpClient";
import { registerServer, unregisterServer, joinServer } from "@/lib/mpServers.functions";

export interface JoinInfo {
  seed: number;
  name: string;
  icon: string;
  password: string;
  ownerName: string;
  isOwner: boolean;
  blocks: { x: number; y: number; z: number; id: number }[];
}

export function serverAddress(cfg: { ip: string; port: number }): string {
  return normAddr(cfg.port ? `${cfg.ip}:${cfg.port}` : cfg.ip);
}

export function ServerIcon({ icon, className = "" }: { icon?: string; className?: string }) {
  if (isImageIcon(icon)) {
    return (
      <img
        src={icon}
        alt="Icono del servidor"
        className={`object-cover ${className}`}
        style={{ imageRendering: "pixelated" }}
      />
    );
  }
  return <span className={`flex items-center justify-center ${className}`}>{getServerIconEmoji(icon)}</span>;
}

export const SERVER_ICONS = [
  { id: "diamond", emoji: "💎", label: "Diamante" },
  { id: "sword", emoji: "🗡️", label: "Espada" },
  { id: "grass", emoji: "🌿", label: "Césped" },
  { id: "pickaxe", emoji: "⛏️", label: "Pico" },
  { id: "creeper", emoji: "💥", label: "Creeper" },
  { id: "zombie", emoji: "🧟", label: "Zombie" },
  { id: "castle", emoji: "🏰", label: "Castillo" },
  { id: "shield", emoji: "🛡️", label: "Escudo" },
  { id: "fire", emoji: "🔥", label: "Fuego" },
  { id: "potion", emoji: "🧪", label: "Poción" },
];

export function getServerIconEmoji(iconId?: string): string {
  const found = SERVER_ICONS.find((i) => i.id === iconId);
  return found?.emoji || "🌐";
}

interface WorldsMenuProps {
  onSelectWorld: (world: WorldRecord) => void;
  onJoinServer?: (roomCode: string, name: string, info?: JoinInfo) => void;
  onBack: () => void;
}

export function WorldsMenu({ onSelectWorld, onJoinServer, onBack }: WorldsMenuProps) {
  const [worlds, setWorlds] = useState<WorldRecord[]>([]);
  const [externalServers, setExternalServers] = useState<ExternalServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"worlds" | "friends" | "servers">("worlds");

  // Create world modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("Mi mundo");
  const [newMode, setNewMode] = useState<"survival" | "creative">("survival");
  const [newSeed, setNewSeed] = useState("");

  // Delete confirm modal state
  const [deleteTarget, setDeleteTarget] = useState<WorldRecord | null>(null);

  // Convert to server modal state
  const [serverModalTarget, setServerModalTarget] = useState<WorldRecord | null>(null);
  const [srvName, setSrvName] = useState("");
  const [srvIp, setSrvIp] = useState("127.0.0.1");
  const [srvPort, setSrvPort] = useState("19132");
  const [srvIcon, setSrvIcon] = useState("diamond");
  const [srvPassword, setSrvPassword] = useState("");
  const [srvMotd, setSrvMotd] = useState("");
  const [srvError, setSrvError] = useState<string | null>(null);
  const [srvSaving, setSrvSaving] = useState(false);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const joinIconFileRef = useRef<HTMLInputElement>(null);

  // Public servers
  const [publicServers, setPublicServers] = useState<PublicServer[]>([]);
  const [pwPrompt, setPwPrompt] = useState<{ address: string; name: string } | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinPassword, setJoinPassword] = useState("");

  // Join external server modal state (ONLY IP and Port)
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinIp, setJoinIp] = useState("127.0.0.1");
  const [joinPort, setJoinPort] = useState("19132");
  const [joinIcon, setJoinIcon] = useState("grass");
  const [joinError, setJoinError] = useState<string | null>(null);

  const refreshPublic = async () => {
    try {
      setPublicServers(await listPublicServers());
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    if (activeTab !== "servers") return;
    refreshPublic();
    const iv = setInterval(refreshPublic, 15000);
    return () => clearInterval(iv);
  }, [activeTab]);

  /** Validate access key on the server then enter the world. Returns an error message or null. */
  const attemptJoin = async (address: string, password: string): Promise<string | null> => {
    const addr = normAddr(address);
    setJoinBusy(true);
    try {
      const res = await joinServer({
        data: {
          address: addr,
          password,
          ownerToken: getOwnerToken(addr),
          playerName: getStoredPlayerName(),
        },
      });
      if (!res.ok) return res.error;
      savePassword(addr, password);
      onJoinServer?.(addr, getStoredPlayerName(), {
        seed: res.seed,
        name: res.name,
        icon: res.icon,
        password,
        ownerName: res.ownerName,
        isOwner: res.isOwner,
        blocks: res.blocks,
      });
      return null;
    } catch (e) {
      console.error("joinServer failed", e);
      return `No se pudo conectar al servidor (${e instanceof Error ? e.message : "error"}). Inténtalo de nuevo.`;
    } finally {
      setJoinBusy(false);
    }
  };

  const handleUploadIcon = async (
    e: React.ChangeEvent<HTMLInputElement>,
    set: (v: string) => void,
  ) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      set(await fileToServerIcon(f));
    } catch {
      setSrvError("No se pudo leer la imagen");
    }
  };

  const importFileRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    await ensureDefaultWorld();
    const list = await getAllWorlds();
    setWorlds(list);
    setExternalServers(getSavedExternalServers());
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    sfx.click();
    const parsedSeed = newSeed.trim() ? parseInt(newSeed.trim(), 10) : undefined;
    const world = createNewWorldRecord(newName, newMode, parsedSeed);
    await saveWorld(world);
    setShowCreateModal(false);
    setNewName("Mi mundo");
    setNewSeed("");
    await loadData();
  };

  const handleDelete = async (id: string) => {
    sfx.click();
    const w = worlds.find((x) => x.id === id);
    if (w?.isServer && w.serverConfig) {
      const addr = serverAddress(w.serverConfig);
      unregisterServer({ data: { address: addr, ownerToken: getOwnerToken(addr) } }).catch(() => {});
    }
    await deleteWorld(id);
    setDeleteTarget(null);
    await loadData();
  };

  const handleOpenServerModal = (world: WorldRecord) => {
    sfx.click();
    setServerModalTarget(world);
    setSrvName(world.serverConfig?.serverName || world.name);
    setSrvIp(
      world.serverConfig?.ip ||
        `${(getStoredPlayerName() || "steve").toLowerCase().replace(/[^a-z0-9]/g, "") || "steve"}-${Math.floor(1000 + Math.random() * 9000)}.voxel`,
    );
    setSrvPort(String(world.serverConfig?.port || 19132));
    setSrvIcon(world.serverConfig?.icon || "diamond");
    setSrvMotd(world.serverConfig?.motd || "");
    setSrvPassword(world.serverConfig ? getSavedPassword(serverAddress(world.serverConfig)) : "");
    setSrvError(null);
  };

  const handleNewServer = async () => {
    sfx.click();
    const name = `Servidor de ${getStoredPlayerName() || "Steve"}`;
    const world = createNewWorldRecord(name, "survival");
    await saveWorld(world);
    await loadData();
    handleOpenServerModal(world);
  };

  const handleSaveWorldAsServer = async () => {
    if (!serverModalTarget) return;
    sfx.click();
    const cleanIp = srvIp.trim() || "127.0.0.1";
    const cleanPort = parseInt(srvPort.trim(), 10) || 19132;
    const cleanName = srvName.trim() || serverModalTarget.name;

    const config: ServerConfig = {
      ip: cleanIp,
      port: cleanPort,
      icon: srvIcon,
      serverName: cleanName,
      motd: srvMotd.trim(),
      isOwner: true,
      ownerName: getStoredPlayerName(),
    };
    const addr = serverAddress(config);
    setSrvSaving(true);
    setSrvError(null);
    try {
      const res = await registerServer({
        data: {
          address: addr,
          name: cleanName,
          motd: config.motd,
          icon: srvIcon,
          seed: serverModalTarget.seed,
          ownerName: getStoredPlayerName(),
          ownerToken: getOwnerToken(addr, true),
          password: srvPassword,
        },
      });
      if (!res.ok) {
        setSrvError(res.error || "No se pudo publicar el servidor");
        return;
      }
      // address changed: remove the old public entry
      const prev = serverModalTarget.serverConfig;
      if (prev && serverAddress(prev) !== addr && getOwnerToken(serverAddress(prev))) {
        unregisterServer({
          data: { address: serverAddress(prev), ownerToken: getOwnerToken(serverAddress(prev)) },
        }).catch(() => {});
      }
      savePassword(addr, srvPassword);
    } catch (e) {
      console.error("registerServer failed", e);
      setSrvError(`No se pudo publicar (${e instanceof Error ? e.message : "error"}). Inténtalo de nuevo.`);
      return;
    } finally {
      setSrvSaving(false);
    }

    await convertWorldToServer(serverModalTarget.id, config);
    refreshPublic();
    setServerModalTarget(null);
    await loadData();
    setActiveTab("servers");
  };

  const handleRevertServer = async (world: WorldRecord) => {
    sfx.click();
    if (world.serverConfig) {
      const addr = serverAddress(world.serverConfig);
      unregisterServer({ data: { address: addr, ownerToken: getOwnerToken(addr) } }).catch(() => {});
    }
    await revertServerToWorld(world.id);
    await loadData();
  };

  const handleJoinExternalSubmit = async () => {
    const cleanIp = joinIp.trim();
    const cleanPort = parseInt(joinPort.trim(), 10);
    if (!cleanIp) {
      setJoinError("Introduce la dirección IP del servidor");
      return;
    }
    if (!cleanPort || isNaN(cleanPort)) {
      setJoinError("Introduce un puerto válido (ej: 19132)");
      return;
    }

    sfx.click();
    setJoinError(null);
    const err = await attemptJoin(`${cleanIp}:${cleanPort}`, joinPassword);
    if (err) {
      setJoinError(err);
      return;
    }
    saveExternalServer({
      ip: cleanIp,
      port: cleanPort,
      icon: joinIcon,
      name: `Servidor ${cleanIp}:${cleanPort}`,
    });

    setShowJoinModal(false);
  };

  const handleConnectDirectly = async (ip: string, port: number) => {
    sfx.click();
    await handlePublicJoin(normAddr(port ? `${ip}:${port}` : ip), `${ip}:${port}`);
  };

  const handlePublicJoin = async (address: string, name: string) => {
    const saved = getSavedPassword(address);
    const err = await attemptJoin(address, saved);
    if (err && /clave/i.test(err)) {
      setPwValue("");
      setPwPrompt({ address, name });
    } else if (err) {
      alert(err);
    }
  };

  const handleDeleteExternal = (id: string) => {
    sfx.click();
    deleteExternalServer(id);
    setExternalServers(getSavedExternalServers());
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      sfx.click();
      await importWorldJson(text);
      await loadData();
    } catch {
      alert("Error al importar mundo: archivo JSON no válido.");
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const worldsOnly = worlds.filter((w) => !w.isServer);
  const serverWorlds = worlds.filter((w) => !!w.isServer);
  const totalServersCount = serverWorlds.length + externalServers.length;
  const currentCentralName = getStoredPlayerName();

  return (
    <div className="fixed inset-0 z-40 flex flex-col font-pixel select-none mc-dirt-bg animate-in fade-in duration-200">
      {/* Top Header & Tabs Bar */}
      <div className="bg-[#1f1f1f]/90 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="mc-badge-btn text-2xl px-4 py-1 flex items-center gap-1.5 text-white"
            onClick={() => {
              sfx.click();
              onBack();
            }}
          >
            ← Volver
          </button>
          <h1 className="text-4xl text-white font-bold tracking-wider drop-shadow-[2px_2px_0_#000000]">
            JUGAR
          </h1>
        </div>

        {/* Top Tabs (Bedrock layout) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`mc-tab px-6 py-1.5 text-2xl font-bold tracking-wide min-w-0 ${
              activeTab === "worlds" ? "mc-tab-selected" : ""
            }`}
            onClick={() => {
              sfx.click();
              setActiveTab("worlds");
            }}
          >
            Mundos ({worldsOnly.length})
          </button>
          <button
            type="button"
            className={`mc-tab px-6 py-1.5 text-2xl font-bold tracking-wide min-w-0 opacity-60 cursor-not-allowed ${
              activeTab === "friends" ? "mc-tab-selected" : ""
            }`}
            onClick={() => sfx.click()}
            title="Próximamente"
          >
            Amigos (0)
          </button>
          <button
            type="button"
            className={`mc-tab px-6 py-1.5 text-2xl font-bold tracking-wide min-w-0 ${
              activeTab === "servers" ? "mc-tab-selected" : ""
            }`}
            onClick={() => {
              sfx.click();
              setActiveTab("servers");
            }}
          >
            Servidores ({totalServersCount})
          </button>
        </div>
      </div>
      <div className="mc-header-sep" />

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        {/* ===================== TAB MUNDOS ===================== */}
        {activeTab === "worlds" && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#242424] p-4 border-2 border-black/40 shadow-sm">
              <button
                type="button"
                className="mc-button text-2xl py-2 px-6 bg-[#3a752a] hover:bg-[#488e35] text-white border-green-950 font-bold"
                onClick={() => {
                  sfx.click();
                  setShowCreateModal(true);
                }}
              >
                + Crear nuevo mundo
              </button>

              <div className="flex items-center gap-2">
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  type="button"
                  className="mc-button text-xl py-2 px-4 min-w-0 bg-[#424242]"
                  onClick={() => {
                    sfx.click();
                    importFileRef.current?.click();
                  }}
                  title="Importar un archivo JSON de mundo"
                >
                  📥 Importar mundo
                </button>
              </div>
            </div>

            {/* World List */}
            {loading ? (
              <div className="text-center py-16 text-3xl text-neutral-400 animate-pulse">
                Cargando mundos guardados...
              </div>
            ) : worldsOnly.length === 0 ? (
              <div className="text-center py-16 bg-[#222222] border-2 border-black/30 p-8">
                <p className="text-3xl text-yellow-300 font-bold mb-2">
                  No tienes mundos normales creados
                </p>
                <p className="text-xl text-neutral-400 mb-6">
                  {serverWorlds.length > 0
                    ? "Tus mundos configurados como servidor están en la pestaña 'Servidores'."
                    : "Crea tu primer mundo para comenzar tu aventura en VoxelCraft."}
                </p>
                <button
                  type="button"
                  className="mc-button text-2xl py-2 px-8"
                  onClick={() => setShowCreateModal(true)}
                >
                  Crear nuevo mundo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {worldsOnly.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-col md:flex-row items-stretch justify-between bg-[#2a2a2a] hover:bg-[#323232] border-2 border-black/50 p-3 gap-4 transition-all shadow-[2px_2px_0_#000000]"
                  >
                    {/* Left: Thumbnail & Details */}
                    <div
                      className="flex items-center gap-4 flex-1 cursor-pointer"
                      onClick={() => {
                        sfx.click();
                        onSelectWorld(w);
                      }}
                    >
                      {/* Thumbnail */}
                      <div className="w-24 h-24 bg-[#151515] border-2 border-black flex-shrink-0 flex items-center justify-center overflow-hidden relative shadow-inner">
                        {w.thumbnailDataUrl ? (
                          <img
                            src={w.thumbnailDataUrl}
                            alt={w.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-800 to-amber-950 p-2 text-center text-xs text-white/80">
                            <span className="text-2xl mb-0.5">🌲</span>
                            <span className="truncate w-full font-mono">{w.name}</span>
                          </div>
                        )}
                        <span className="absolute bottom-0.5 right-1 text-[10px] bg-black/70 px-1 text-white font-mono">
                          {w.size}
                        </span>
                      </div>

                      {/* Info */}
                      <div>
                        <h3 className="text-2xl md:text-3xl font-bold text-white tracking-wide drop-shadow-[2px_2px_0_#000000] hover:text-yellow-300">
                          {w.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-lg">
                          <span
                            className={`px-2 py-0.5 text-base font-bold border border-black/40 ${
                              w.gameMode === "creative"
                                ? "bg-cyan-900/80 text-cyan-200"
                                : "bg-emerald-900/80 text-emerald-200"
                            }`}
                          >
                            {w.gameMode === "creative" ? "Creativo" : "Supervivencia"}
                          </span>
                          <span className="text-neutral-400">· {formatDate(w.lastPlayed)}</span>
                          <span className="text-neutral-500 text-sm">Semilla: {w.seed}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-center md:self-auto flex-wrap">
                      <button
                        type="button"
                        className="mc-button text-2xl py-2 px-6 min-w-0 bg-[#3a752a] hover:bg-[#488e35] text-white"
                        onClick={() => {
                          sfx.click();
                          onSelectWorld(w);
                        }}
                      >
                        ▶ Jugar
                      </button>

                      <button
                        type="button"
                        className="mc-button text-xl py-2 px-4 min-w-0 bg-[#2b4c6f] hover:bg-[#386290] text-cyan-100 font-bold"
                        onClick={() => handleOpenServerModal(w)}
                        title="Configurar este mundo como servidor (se moverá a la pestaña Servidores)"
                      >
                        ⚙️ Crear Servidor
                      </button>

                      <button
                        type="button"
                        className="mc-badge-btn text-xl px-3 py-2 text-neutral-300 hover:text-white"
                        onClick={() => {
                          sfx.click();
                          exportWorldJson(w);
                        }}
                        title="Exportar archivo de respaldo"
                      >
                        💾 Exportar
                      </button>

                      <button
                        type="button"
                        className="mc-badge-btn text-xl px-3 py-2 text-red-400 hover:bg-red-900/50 hover:text-red-200"
                        onClick={() => {
                          sfx.click();
                          setDeleteTarget(w);
                        }}
                        title="Eliminar mundo permanentemente"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB SERVIDORES ===================== */}
        {activeTab === "servers" && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#242424] p-4 border-2 border-black/40 shadow-sm">
              <div>
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                  <span>🌐</span> SERVIDORES Y MULTIJUGADOR
                </h2>
                <p className="text-base text-neutral-300 mt-0.5">
                  Conéctate con tu nombre central{" "}
                  <span className="text-yellow-300 font-bold font-mono">
                    [{currentCentralName}]
                  </span>{" "}
                  (configurable en Ajustes &gt; Perfil).
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="mc-button text-2xl py-2 px-6 font-bold"
                onClick={handleNewServer}
              >
                + Crear servidor
              </button>
              <button
                type="button"
                className="mc-button text-2xl py-2 px-6 font-bold"
                onClick={() => {
                  sfx.click();
                  setShowJoinModal(true);
                }}
              >
                + Unirse a Servidor (IP y Puerto)
              </button>
              </div>
            </div>

            {/* Section 1: Mundos Configurados como Servidor */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-2xl font-bold text-yellow-300 tracking-wide flex items-center gap-2">
                  <span>👑</span> TUS SERVIDORES (Mundos convertidos a Servidor)
                </h3>
                <span className="text-sm text-neutral-400">
                  {serverWorlds.length} servidor(es) creados
                </span>
              </div>

              {serverWorlds.length === 0 ? (
                <div className="bg-[#202020] border-2 border-black/30 p-6 text-center text-neutral-400">
                  <p className="text-xl mb-2">
                    No has convertido ningún mundo en servidor todavía.
                  </p>
                  <p className="text-base text-neutral-500">
                    Ve a la pestaña <strong>"Mundos"</strong> y haz clic en{" "}
                    <span className="text-cyan-300 font-bold">"⚙️ Crear Servidor"</span> en el mundo
                    que desees para que pase aquí.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {serverWorlds.map((w) => {
                    const cfg = w.serverConfig;
                    return (
                      <div
                        key={w.id}
                        className="flex flex-col md:flex-row items-stretch justify-between bg-[#282d33] hover:bg-[#2d333a] border-2 border-cyan-900/60 p-4 gap-4 transition-all shadow-[2px_2px_0_#000000]"
                      >
                        {/* Left: Icon & Info */}
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-20 h-20 bg-[#161a1f] border-2 border-cyan-700/60 flex items-center justify-center text-4xl shadow-inner flex-shrink-0 overflow-hidden">
                            <ServerIcon icon={cfg?.icon} className="w-full h-full" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-3xl font-bold text-white tracking-wide drop-shadow-[2px_2px_0_#000000]">
                                {cfg?.serverName || w.name}
                              </h4>
                              <span className="px-2 py-0.5 text-sm font-bold bg-amber-600/90 text-amber-100 border border-amber-950">
                                👑 ERES EL DUEÑO
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-lg">
                              <span className="font-mono text-cyan-300 font-bold bg-black/40 px-2 py-0.5 border border-cyan-900/40">
                                {cfg?.ip || "127.0.0.1"}:{cfg?.port || 19132}
                              </span>
                              <span className="text-emerald-400 font-bold">
                                ● Público
                              </span>
                              {cfg && getSavedPassword(serverAddress(cfg)) && (
                                <span className="text-amber-300 font-bold">🔒 Con clave</span>
                              )}
                              <span className="text-neutral-400 text-sm">
                                · {formatDate(w.lastPlayed)}
                              </span>
                            </div>
                            <div className="text-sm text-neutral-400 mt-1">
                              Comandos disponibles para ti:{" "}
                              <span className="font-mono text-yellow-300">
                                /ban, /kick, /sethome, /home
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0 self-center md:self-auto flex-wrap">
                          <button
                            type="button"
                            className="mc-button text-2xl py-2 px-6 min-w-0 bg-[#3a752a] hover:bg-[#488e35] text-white font-bold"
                            onClick={() => {
                              sfx.click();
                              onSelectWorld(w);
                            }}
                          >
                            ▶ Iniciar Servidor
                          </button>
                          <button
                            type="button"
                            className="mc-button text-lg py-2 px-3 min-w-0 bg-[#38424d] text-cyan-200"
                            onClick={() => handleOpenServerModal(w)}
                            title="Editar IP, Puerto o Icono"
                          >
                            ⚙️ Editar
                          </button>
                          <button
                            type="button"
                            className="mc-button text-lg py-2 px-3 min-w-0 bg-[#504030] text-amber-200"
                            onClick={() => handleRevertServer(w)}
                            title="Revertir a Mundo normal (volverá a la pestaña Mundos)"
                          >
                            ↩ A Mundos
                          </button>
                          <button
                            type="button"
                            className="mc-badge-btn text-xl px-3 py-2 text-red-400 hover:bg-red-900/50 hover:text-red-200"
                            onClick={() => {
                              sfx.click();
                              setDeleteTarget(w);
                            }}
                            title="Eliminar mundo servidor"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section: Public servers from everyone */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-2xl font-bold text-emerald-300 tracking-wide flex items-center gap-2">
                  <span>🌍</span> SERVIDORES PÚBLICOS
                </h3>
                <button
                  type="button"
                  className="mc-badge-btn text-base px-3 py-1"
                  onClick={() => {
                    sfx.click();
                    refreshPublic();
                  }}
                >
                  ⟳ Actualizar
                </button>
              </div>
              {publicServers.length === 0 ? (
                <div className="bg-[#202020] border-2 border-black/30 p-6 text-center text-neutral-400 text-lg">
                  Todavía no hay servidores públicos. ¡Crea el primero desde la pestaña Mundos!
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {publicServers.map((ps) => {
                    const online = isOnline(ps);
                    const mine = !!getOwnerToken(ps.address);
                    return (
                      <div
                        key={ps.address}
                        className="flex flex-col sm:flex-row items-stretch justify-between bg-[#242424] hover:bg-[#2b2b2b] border-2 border-black/50 p-3 gap-3"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-16 h-16 bg-[#181818] border-2 border-black/40 flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden">
                            <ServerIcon icon={ps.icon} className="w-full h-full" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-2xl font-bold text-white tracking-wide truncate">
                              {ps.name}
                              {ps.has_password && <span className="ml-2 text-amber-300">🔒</span>}
                            </h4>
                            {ps.motd && <p className="text-base text-neutral-300 truncate">{ps.motd}</p>}
                            <div className="flex flex-wrap items-center gap-2 text-base mt-0.5">
                              <span className="font-mono text-cyan-300 bg-black/40 px-2">{ps.address}</span>
                              <span className={online ? "text-emerald-400 font-bold" : "text-neutral-500"}>
                                {online ? "● En línea" : "○ Desconectado"}
                              </span>
                              <span className="text-neutral-400 text-sm">
                                · Dueño: {ps.owner_name}
                                {mine ? " (tú)" : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={joinBusy}
                          className="mc-button text-2xl py-2 px-6 min-w-0 bg-[#3a752a] text-white self-center"
                          onClick={() => {
                            sfx.click();
                            handlePublicJoin(ps.address, ps.name);
                          }}
                        >
                          ▶ Entrar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 2: Servidores Guardados / Externos */}
            {externalServers.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-white tracking-wide mb-3 flex items-center gap-2">
                  <span>🌐</span> SERVIDORES GUARDADOS (Uniones recientes)
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  {externalServers.map((srv) => (
                    <div
                      key={srv.id}
                      className="flex flex-col md:flex-row items-stretch justify-between bg-[#242424] hover:bg-[#2b2b2b] border-2 border-black/50 p-4 gap-4 transition-all"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-16 h-16 bg-[#181818] border-2 border-black/40 flex items-center justify-center text-3xl flex-shrink-0">
                          <ServerIcon icon={srv.icon} className="w-full h-full" />
                        </div>
                        <div>
                          <h4 className="text-2xl font-bold text-white tracking-wide">
                            {srv.name}
                          </h4>
                          <div className="flex items-center gap-2 text-lg mt-0.5">
                            <span className="font-mono text-emerald-400 font-bold bg-black/40 px-2 py-0.5">
                              {srv.ip}:{srv.port}
                            </span>
                            <span className="text-emerald-400 text-sm font-bold">● En línea</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 self-center md:self-auto">
                        <button
                          type="button"
                          className="mc-button text-2xl py-2 px-6 min-w-0 bg-[#3a752a] text-white"
                          onClick={() => handleConnectDirectly(srv.ip, srv.port)}
                        >
                          ▶ Entrar al Servidor
                        </button>
                        <button
                          type="button"
                          className="mc-badge-btn text-xl px-3 py-2 text-red-400 hover:bg-red-900/50"
                          onClick={() => handleDeleteExternal(srv.id)}
                          title="Eliminar de servidores guardados"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mc-footer-sep" />

      {/* ===================== MODAL CREAR NUEVO MUNDO ===================== */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-in fade-in"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#282828] border-3 border-[#1a1a1a] shadow-[inset_2px_2px_0_#505050,inset_-2px_-2px_0_#151515,0_10px_30px_rgba(0,0,0,0.85)] p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black/40 pb-2">
              <h3 className="text-3xl font-bold text-white tracking-wide drop-shadow-[2px_2px_0_#000000]">
                CREAR NUEVO MUNDO
              </h3>
              <button
                type="button"
                className="mc-cross-btn"
                onClick={() => setShowCreateModal(false)}
                title="Cerrar"
              />
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">Nombre del mundo:</label>
              <input
                type="text"
                maxLength={30}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mc-input-field text-xl"
                placeholder="Mi nuevo mundo"
              />
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">Modo de juego:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`py-2 text-xl font-bold border-2 border-black ${
                    newMode === "survival"
                      ? "bg-[#4a8a3a] text-yellow-200 border-yellow-300"
                      : "bg-[#3c3c3c] text-neutral-400"
                  }`}
                  onClick={() => {
                    sfx.click();
                    setNewMode("survival");
                  }}
                >
                  ⚔️ Supervivencia
                </button>
                <button
                  type="button"
                  className={`py-2 text-xl font-bold border-2 border-black ${
                    newMode === "creative"
                      ? "bg-[#4a8a3a] text-yellow-200 border-yellow-300"
                      : "bg-[#3c3c3c] text-neutral-400"
                  }`}
                  onClick={() => {
                    sfx.click();
                    setNewMode("creative");
                  }}
                >
                  🧱 Creativo
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">Semilla (opcional):</label>
              <input
                type="number"
                value={newSeed}
                onChange={(e) => setNewSeed(e.target.value)}
                className="mc-input-field text-xl font-mono"
                placeholder="Dejar vacío para semilla aleatoria"
              />
            </div>

            <div className="pt-3 border-t-2 border-black/30 flex justify-end gap-3">
              <button
                type="button"
                className="mc-button text-xl py-2 px-6 min-w-0 bg-[#444444]"
                onClick={() => setShowCreateModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="mc-button text-xl py-2 px-8 min-w-0 bg-[#3a752a] text-white"
                onClick={handleCreate}
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL CONFIGURAR COMO SERVIDOR ===================== */}
      {serverModalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in"
          onClick={() => setServerModalTarget(null)}
        >
          <div
            className="mc-bedrock-panel w-full max-w-xl max-h-[92vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black/40 pb-2">
              <h3 className="text-3xl font-bold text-white tracking-wide drop-shadow-[2px_2px_0_#000]">
                {serverModalTarget.isServer ? "EDITAR SERVIDOR" : "AÑADIR SERVIDOR"}
              </h3>
              <button
                type="button"
                className="mc-cross-btn"
                onClick={() => setServerModalTarget(null)}
                title="Cerrar"
              />
            </div>

            <p className="text-base text-neutral-300">
              Al configurar este mundo como servidor,{" "}
              <strong>
                pasará automáticamente de la pestaña de Mundos a la pestaña de Servidores
              </strong>
              . Tú serás el <strong>dueño del servidor</strong> con acceso exclusivo a los comandos{" "}
              <span className="font-mono text-yellow-300">/ban</span> y{" "}
              <span className="font-mono text-yellow-300">/kick</span>.
            </p>

            <div>
              <label className="block text-xl font-bold text-white mb-1">
                Nombre del servidor:
              </label>
              <input
                type="text"
                maxLength={30}
                value={srvName}
                onChange={(e) => setSrvName(e.target.value)}
                className="mc-input-field text-xl"
                placeholder="Servidor de Supervivencia"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xl font-bold text-white mb-1">IP del servidor:</label>
                <input
                  type="text"
                  maxLength={40}
                  value={srvIp}
                  onChange={(e) => setSrvIp(e.target.value)}
                  className="mc-input-field text-xl font-mono"
                  placeholder="127.0.0.1"
                />
              </div>

              <div>
                <label className="block text-xl font-bold text-white mb-1">Puerto:</label>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={srvPort}
                  onChange={(e) => setSrvPort(e.target.value)}
                  className="mc-input-field text-xl font-mono"
                  placeholder="19132"
                />
              </div>
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">Mensaje (MOTD):</label>
              <input
                type="text"
                maxLength={80}
                value={srvMotd}
                onChange={(e) => setSrvMotd(e.target.value)}
                className="mc-input-field text-xl"
                placeholder="¡Bienvenidos a mi servidor!"
              />
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">
                Clave de acceso (opcional):
              </label>
              <input
                type="text"
                maxLength={64}
                value={srvPassword}
                onChange={(e) => setSrvPassword(e.target.value)}
                className="mc-input-field text-xl font-mono"
                placeholder="Déjala vacía para que entre cualquiera"
              />
              <p className="text-sm text-neutral-400 mt-1">
                El servidor aparecerá en la lista pública. Solo entrarán quienes conozcan la clave.
              </p>
            </div>

            {srvError && (
              <div className="p-2 bg-red-900/60 border border-red-500 text-red-200 text-base font-bold">
                ⚠️ {srvError}
              </div>
            )}

            <div>
              <label className="block text-xl font-bold text-white mb-1">Icono del servidor:</label>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-16 h-16 bg-[#181818] border-2 border-black/50 text-3xl overflow-hidden flex items-center justify-center">
                  <ServerIcon icon={srvIcon} className="w-full h-full" />
                </div>
                <button
                  type="button"
                  className="mc-button text-lg py-1 px-4 min-w-0"
                  onClick={() => iconFileRef.current?.click()}
                >
                  📁 Subir imagen desde mi dispositivo
                </button>
                <input
                  ref={iconFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadIcon(e, setSrvIcon)}
                />
              </div>
              <div className="grid grid-cols-5 gap-2">
                {SERVER_ICONS.map((ic) => (
                  <button
                    key={ic.id}
                    type="button"
                    className={`p-2 flex flex-col items-center justify-center border-2 transition-all ${
                      srvIcon === ic.id
                        ? "bg-cyan-900 border-yellow-300 shadow-[0_0_8px_rgba(255,255,0,0.5)]"
                        : "bg-[#181818] border-black/50 hover:bg-[#202020]"
                    }`}
                    onClick={() => {
                      sfx.click();
                      setSrvIcon(ic.id);
                    }}
                    title={ic.label}
                  >
                    <span className="text-3xl">{ic.emoji}</span>
                    <span className="text-xs text-neutral-300 mt-1 truncate w-full text-center">
                      {ic.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t-2 border-black/30 flex justify-end gap-3">
              <button
                type="button"
                className="mc-button text-xl py-2 px-6 min-w-0 bg-[#444444]"
                onClick={() => setServerModalTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="mc-button text-xl py-2 px-8 min-w-0 bg-[#2b6a3a] text-white font-bold"
                onClick={handleSaveWorldAsServer}
                disabled={srvSaving}
              >
                {srvSaving ? "Publicando..." : "✓ Publicar servidor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL UNIRSE A SERVIDOR (SOLO IP Y PUERTO) ===================== */}
      {showJoinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in"
          onClick={() => setShowJoinModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#252525] border-3 border-[#1a1a1a] shadow-[inset_2px_2px_0_#505050,inset_-2px_-2px_0_#151515,0_10px_35px_rgba(0,0,0,0.85)] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black/40 pb-2">
              <h3 className="text-3xl font-bold text-white tracking-wide flex items-center gap-2">
                <span>🌐</span> UNIRSE A SERVIDOR
              </h3>
              <button
                type="button"
                className="mc-cross-btn"
                onClick={() => setShowJoinModal(false)}
                title="Cerrar"
              />
            </div>

            <div className="bg-[#1b1b1b] p-3 border border-neutral-700 text-neutral-300 text-base">
              Conectándote con tu nombre central:{" "}
              <span className="font-bold text-yellow-300 font-mono">[{currentCentralName}]</span>
              <p className="text-xs text-neutral-400 mt-0.5">
                (El nombre se guarda automáticamente en la Configuración Central)
              </p>
            </div>

            {joinError && (
              <div className="p-2 bg-red-900/60 border border-red-500 text-red-200 text-base font-bold">
                ⚠️ {joinError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xl font-bold text-white mb-1">IP del servidor:</label>
                <input
                  type="text"
                  maxLength={40}
                  value={joinIp}
                  onChange={(e) => {
                    setJoinIp(e.target.value);
                    setJoinError(null);
                  }}
                  className="mc-input-field text-xl font-mono"
                  placeholder="127.0.0.1"
                />
              </div>

              <div>
                <label className="block text-xl font-bold text-white mb-1">Puerto:</label>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={joinPort}
                  onChange={(e) => {
                    setJoinPort(e.target.value);
                    setJoinError(null);
                  }}
                  className="mc-input-field text-xl font-mono"
                  placeholder="19132"
                />
              </div>
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">Clave de acceso:</label>
              <input
                type="password"
                maxLength={64}
                value={joinPassword}
                onChange={(e) => {
                  setJoinPassword(e.target.value);
                  setJoinError(null);
                }}
                className="mc-input-field text-xl font-mono"
                placeholder="Si el servidor tiene clave"
              />
            </div>

            <div>
              <label className="block text-xl font-bold text-white mb-1">Icono de guardado:</label>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-14 h-14 bg-[#181818] border-2 border-black/50 text-2xl overflow-hidden flex items-center justify-center">
                  <ServerIcon icon={joinIcon} className="w-full h-full" />
                </div>
                <button
                  type="button"
                  className="mc-button text-lg py-1 px-4 min-w-0"
                  onClick={() => joinIconFileRef.current?.click()}
                >
                  📁 Subir imagen
                </button>
                <input
                  ref={joinIconFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadIcon(e, setJoinIcon)}
                />
              </div>
              <div className="grid grid-cols-5 gap-2">
                {SERVER_ICONS.map((ic) => (
                  <button
                    key={ic.id}
                    type="button"
                    className={`p-2 flex flex-col items-center justify-center border-2 ${
                      joinIcon === ic.id
                        ? "bg-[#3a752a] border-yellow-300 shadow-[0_0_8px_rgba(255,255,0,0.5)]"
                        : "bg-[#181818] border-black/50 hover:bg-[#202020]"
                    }`}
                    onClick={() => {
                      sfx.click();
                      setJoinIcon(ic.id);
                    }}
                    title={ic.label}
                  >
                    <span className="text-2xl">{ic.emoji}</span>
                    <span className="text-[10px] text-neutral-300 mt-0.5 truncate w-full text-center">
                      {ic.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t-2 border-black/30 flex justify-end gap-3">
              <button
                type="button"
                className="mc-button text-xl py-2 px-6 min-w-0 bg-[#444444]"
                onClick={() => setShowJoinModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="mc-button text-xl py-2 px-8 min-w-0 bg-[#3a752a] text-white font-bold"
                onClick={handleJoinExternalSubmit}
                disabled={joinBusy}
              >
                {joinBusy ? "Conectando..." : "▶ Entrar al Servidor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pwPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={() => setPwPrompt(null)}
        >
          <form
            className="w-full max-w-md bg-[#252525] border-3 border-[#1a1a1a] p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              sfx.click();
              const err = await attemptJoin(pwPrompt.address, pwValue);
              if (err) setJoinError(err);
              else setPwPrompt(null);
            }}
          >
            <h3 className="text-3xl font-bold text-white">🔒 {pwPrompt.name}</h3>
            <p className="text-lg text-neutral-300">Este servidor necesita una clave de acceso.</p>
            {joinError && (
              <div className="p-2 bg-red-900/60 border border-red-500 text-red-200 font-bold">
                ⚠️ {joinError}
              </div>
            )}
            <input
              autoFocus
              type="password"
              maxLength={64}
              value={pwValue}
              onChange={(e) => {
                setPwValue(e.target.value);
                setJoinError(null);
              }}
              className="mc-input-field text-xl font-mono"
              placeholder="Clave de acceso"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="mc-button text-xl py-2 px-6 min-w-0 bg-[#444444]"
                onClick={() => setPwPrompt(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={joinBusy}
                className="mc-button text-xl py-2 px-8 min-w-0 bg-[#3a752a] text-white font-bold"
              >
                {joinBusy ? "Conectando..." : "▶ Entrar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================== MODAL ELIMINAR MUNDO ===================== */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md bg-[#282828] border-3 border-red-800 p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-3xl font-bold text-red-400 tracking-wide">
              ¿Eliminar "{deleteTarget.name}"?
            </h3>
            <p className="text-xl text-neutral-200 leading-relaxed">
              ¿Estás seguro de que deseas eliminar este{" "}
              {deleteTarget.isServer ? "servidor" : "mundo"}? Esta acción es irreversible y se
              perderán todos los datos.
            </p>
            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                className="mc-button text-xl py-2 px-6 min-w-0 bg-[#444444]"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="mc-button text-xl py-2 px-6 min-w-0 bg-red-800 hover:bg-red-700 text-white"
                onClick={() => handleDelete(deleteTarget.id)}
              >
                Eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
