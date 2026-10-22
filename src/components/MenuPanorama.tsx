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
    // three order: +x, -x, +y, -y, +z, -z  ← Minecraft: 1 right, 3 left, 4 top, 5 bottom, 2 back, 0 front
    const cube = new THREE.CubeTextureLoader().load([1, 3, 4, 5, 2, 0].map((i) => `${P}${i}.png`));
    cube.colorSpace = THREE.SRGBColorSpace;
    scene.background = cube;

    const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 10);
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
