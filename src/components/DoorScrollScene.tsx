import { sitePath } from "@/lib/site-path";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, Bounds } from "@react-three/drei";
import * as THREE from "three";

function DoorModel({ progress }: { progress: React.MutableRefObject<number> }) {
  const { scene, animations } = useGLTF(sitePath("/models/door.glb"));
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const action = useMemo(() => {
    const clip = animations[0];
    const a = mixer.clipAction(clip);
    a.play();
    a.paused = true;
    a.clampWhenFinished = true;
    a.setLoop(THREE.LoopOnce, 1);
    return a;
  }, [mixer, animations]);

  const duration = animations[0]?.duration ?? 1;

  useFrame(() => {
    const p = THREE.MathUtils.clamp(progress.current, 0, 1);
    // smooth toward target
    const target = p * duration;
    action.time += (target - action.time) * 0.15;
    mixer.update(0);
  });

  return <primitive object={scene} />;
}

useGLTF.preload(sitePath("/models/door.glb"));

export function DoorScrollScene({ manualOpen = null }: { manualOpen?: boolean | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const manual = useRef(manualOpen);
  manual.current = manualOpen;

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = wrapRef.current;
      if (manual.current !== null) {
        progress.current = manual.current ? 1 : 0;
      } else if (el) {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const elCenter = rect.top + rect.height / 2;
        // 0 when element center enters from the bottom of the viewport,
        // 1 when element center has almost left through the top.
        const start = vh + rect.height / 2; // fully below
        const end = -rect.height * 0.4; // almost scrolled past the top
        const raw = (start - elCenter) / (start - end);
        progress.current = Math.max(0, Math.min(1, raw));
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 1.2, 4.5], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.15}>
            <DoorModel progress={progress} />
          </Bounds>
          <Environment preset="apartment" />
        </Suspense>
      </Canvas>
    </div>
  );
}
