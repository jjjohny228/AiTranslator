import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export function HeroModel() {
  const mountRef = useRef(null);
  const dragStateRef = useRef({
    dragging: false,
    lastX: 0,
    velocityX: 0,
    targetRotationY: 0,
  });

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) {
      return undefined;
    }

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      38,
      mountNode.clientWidth / Math.max(mountNode.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(0, 0, 6.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountNode.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xff66f7, 0.8);
    scene.add(ambientLight);

    const keyLight = new THREE.PointLight(0x00ffff, 18, 24, 2);
    keyLight.position.set(4, 5, 6);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff9900, 16, 24, 2);
    rimLight.position.set(-5, -1, 5);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xff00ff, 10, 18, 2);
    fillLight.position.set(0, 2, -5);
    scene.add(fillLight);

    const group = new THREE.Group();
    scene.add(group);

    let disposed = false;
    let modelMesh = null;
    const loader = new STLLoader();
    loader.load(
      "/assets/hero-model.stl",
      (geometry) => {
        if (disposed) {
          geometry.dispose();
          return;
        }
        geometry.center();
        geometry.computeVertexNormals();
        const material = new THREE.MeshPhysicalMaterial({
          color: 0xffd6fa,
          emissive: 0xff00ff,
          emissiveIntensity: 0.14,
          metalness: 0.78,
          roughness: 0.18,
          clearcoat: 0.92,
          clearcoatRoughness: 0.18,
        });
        modelMesh = new THREE.Mesh(geometry, material);
        const box = new THREE.Box3().setFromObject(modelMesh);
        const size = box.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.55 / maxDimension;
        modelMesh.scale.setScalar(scale);
        modelMesh.rotation.x = 0;
        modelMesh.rotation.y = 0;
        modelMesh.position.set(0, 0, 0);
        group.add(modelMesh);
      },
      undefined,
      () => {
        // Keep hero resilient if STL fails to load.
      },
    );

    let frameId = 0;
    const clock = new THREE.Clock();

    function handlePointerDown(event) {
      dragStateRef.current.dragging = true;
      dragStateRef.current.lastX = event.clientX;
      mountNode.style.cursor = "grabbing";
    }

    function handlePointerMove(event) {
      if (!dragStateRef.current.dragging) {
        return;
      }
      const deltaX = event.clientX - dragStateRef.current.lastX;
      dragStateRef.current.lastX = event.clientX;
      dragStateRef.current.velocityX = deltaX * 0.0035;
      dragStateRef.current.targetRotationY += deltaX * 0.01;
    }

    function handlePointerUp() {
      dragStateRef.current.dragging = false;
      mountNode.style.cursor = "grab";
    }

    function animate() {
      const elapsed = clock.getElapsedTime();
      if (modelMesh) {
        if (!dragStateRef.current.dragging) {
          dragStateRef.current.targetRotationY += 0.005;
          dragStateRef.current.velocityX *= 0.96;
          dragStateRef.current.targetRotationY += dragStateRef.current.velocityX;
        }
        modelMesh.rotation.y += (dragStateRef.current.targetRotationY - modelMesh.rotation.y) * 0.08;
        modelMesh.rotation.z = Math.sin(elapsed * 0.55) * 0.018;
      }
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }
    animate();

    function handleResize() {
      if (!mountNode) {
        return;
      }
      camera.aspect = mountNode.clientWidth / Math.max(mountNode.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    }

    window.addEventListener("resize", handleResize);
    mountNode.style.cursor = "grab";
    mountNode.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      mountNode.removeEventListener("pointerdown", handlePointerDown);
      renderer.dispose();
      scene.traverse((object) => {
        if (object.isMesh) {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose?.());
          } else {
            object.material?.dispose?.();
          }
        }
      });
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="hero-model-shell">
      <div className="hero-model-frame">
        <div className="hero-model-canvas" ref={mountRef} />
      </div>
    </div>
  );
}
