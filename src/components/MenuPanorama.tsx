import { useEffect, useRef } from "react";
import * as THREE from "three";

interface MenuPanoramaProps {
  blurred?: boolean;
}

const P = "/resourcepack/assets/minecraft/textures/gui/title/background/panorama_";

/** Official rotating title panorama (6 cube faces from the Faithful 32x pack). */
export function MenuPanorama({ blurred = false }: MenuPanoramaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    // Inside-facing cube built face by face so every edge lines up exactly like Minecraft:
    // 0 front (-Z), 1 right (+X), 2 back (+Z), 3 left (-X), 4 top, 5 bottom.
    const loader = new THREE.TextureLoader();
    const faces: [number, [number, number, number], [number, number, number]][] = [
      [0, [0, 0, -1], [0, 0, 0]],
      [1, [1, 0, 0], [0, -Math.PI / 2, 0]],
      [2, [0, 0, 1], [0, Math.PI, 0]],
      [3, [-1, 0, 0], [0, Math.PI / 2, 0]],
      [4, [0, 1, 0], [Math.PI / 2, 0, 0]],
      [5, [0, -1, 0], [-Math.PI / 2, 0, 0]],
    ];
    const geo = new THREE.PlaneGeometry(2.004, 2.004);
    const disposables: { dispose(): void }[] = [geo];
    for (const [i, pos, rot] of faces) {
      const tex = loader.load(`${P}${i}.png`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.rotation.set(...rot);
      scene.add(mesh);
      disposables.push(tex, mat);
    }
    const cube = { dispose: () => disposables.forEach((d) => d.dispose()) };

    const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.01, 10);
    camera.rotation.order = "YXZ";

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      camera.rotation.y = -t * 0.04;
      camera.rotation.x = Math.sin(t * 0.05) * 0.08 - 0.05;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      cube.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
      <canvas
        ref={canvasRef}
        className={`w-full h-full block transition-all duration-500 ease-out ${
          blurred ? "blur-md brightness-50 scale-105" : ""
        }`}
      />
    </div>
  );
}
