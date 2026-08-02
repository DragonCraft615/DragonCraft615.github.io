import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface ViewerHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Register a per-frame callback (dt in seconds). Returns an unsubscribe fn. */
  onFrame(cb: (dt: number) => void): () => void;
  dispose(): void;
}

/** Mount a Three.js scene with orbit controls + a resize observer into `container`. */
export function createViewer(container: HTMLElement, opts?: { background?: string }): ViewerHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts?.background ?? "#FAFBF9");

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.set(6.5, 5.5, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 30;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(4, 8, 6);
  scene.add(dir);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const callbacks = new Set<(dt: number) => void>();
  let last = performance.now();
  let raf = 0;
  function tick() {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    // Skip real work while hidden (stage switched away, tab backgrounded) —
    // still reschedule cheaply so rendering resumes as soon as it's visible again.
    if (container.offsetParent !== null && !document.hidden) {
      controls.update();
      callbacks.forEach((cb) => cb(dt));
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    scene,
    camera,
    renderer,
    controls,
    onFrame(cb) {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
