import { sitePath } from "@/lib/site-path";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useTexture, Environment, Bounds, useBounds, Html } from "@react-three/drei";
import * as THREE from "three";

function DoorInterior() {
  const anchor = useRef<THREE.Group>(null);
  const height = useThree((state) => state.size.height);
  const scale = (height * 0.3) / 264;
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const center = useMemo(() => new THREE.Vector2(0, 0), []);
  const backdrop = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.25), []);

  useFrame(({ camera }) => {
    if (!anchor.current) return;
    // Follow the canvas center at a depth behind the door, including after resizing.
    ray.setFromCamera(center, camera);
    ray.ray.intersectPlane(backdrop, anchor.current.position);
    anchor.current.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={anchor}>
      <Html
        center
        prepend
        occlude="blending"
        zIndexRange={[2, 0]}
        className="door-interior-art"
        style={{
          width: 264 * scale,
          height: 234 * scale,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <img
          src={sitePath("/animations/fred-mopping.webp")}
          alt="A cleaner mopping behind the door"
          width={360}
          height={360}
          draggable={false}
          // Exclude the source image's transparent padding from the centered box.
          style={{
            position: "absolute",
            width: 360 * scale,
            height: 360 * scale,
            maxWidth: "none",
            left: -66 * scale,
            top: -92 * scale,
          }}
        />
      </Html>
    </group>
  );
}

function DoorBackdrop() {
  const { scene } = useGLTF(sitePath("/models/door.glb"));
  const texture = useTexture(sitePath("/images/concrete-wall.avif"));
  texture.colorSpace = THREE.SRGBColorSpace;
  const placement = useMemo(() => {
    scene.updateMatrixWorld(true);
    const frame = scene.getObjectByName("DoorFrame") as THREE.Mesh;
    frame.geometry.computeBoundingBox();
    const box = frame.geometry.boundingBox!.clone().applyMatrix4(frame.matrixWorld);
    const size = box.getSize(new THREE.Vector3());
    // The image is 740×564. Its transparent opening is x=254..485, y=0..474.
    const width = (size.x * 740) / 231;
    const height = (size.y * 564) / 474;
    return {
      width,
      height,
      position: new THREE.Vector3(
        (box.min.x + box.max.x) / 2 + (0.5 - 369.5 / 740) * width,
        box.max.y - height / 2,
        box.min.z - 0.001,
      ),
    };
  }, [scene]);

  return (
    <mesh position={placement.position}>
      <planeGeometry args={[placement.width, placement.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
        onBeforeCompile={(shader) => {
          // Feather the wall's outer edges while retaining its transparent doorway.
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <alphamap_fragment>",
            `#include <alphamap_fragment>
            vec2 edgeDistance = min(vMapUv, 1.0 - vMapUv);
            vec2 edgeOpacity = smoothstep(vec2(0.0), vec2(0.04), edgeDistance);
            diffuseColor.a *= edgeOpacity.x * edgeOpacity.y;`,
          );
        }}
      />
    </mesh>
  );
}

function DoorModel({
  progress,
  manual,
}: {
  progress: React.MutableRefObject<number>;
  manual: React.MutableRefObject<boolean | null>;
}) {
  const { scene, animations } = useGLTF(sitePath("/models/door.glb"));
  const bounds = useBounds();
  const { width, height } = useThree((state) => state.size);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const action = useMemo(() => {
    // The supplied 24 fps clip holds still before 2.5s and after 7s.
    // Scrub only its opening sequence so the first scroll moves the handle.
    const fps = 24;
    const clip = THREE.AnimationUtils.subclip(
      animations[0],
      "Door opening",
      2.5 * fps,
      7 * fps,
      fps,
    );
    const a = mixer.clipAction(clip);
    a.play();
    a.paused = true;
    a.clampWhenFinished = true;
    a.setLoop(THREE.LoopOnce, 1);
    return a;
  }, [mixer, animations]);

  const closedBounds = useMemo(() => {
    action.time = 0;
    mixer.update(0);
    return new THREE.Box3().setFromObject(scene);
  }, [action, mixer, scene]);
  const duration = action.getClip().duration;

  useLayoutEffect(() => {
    // Canvas also measures its scroll position. Refit only when its dimensions
    // change, using the same bounds regardless of the door's current pose.
    bounds.refresh(closedBounds).clip().fit();
  }, [bounds, closedBounds, width, height]);

  useFrame((_, delta) => {
    const p = THREE.MathUtils.clamp(progress.current, 0, 1);
    // Smooth between endpoints, but reach the exact final pose at 100%.
    const target = p * duration;
    if (manual.current !== null) {
      // A full button-driven opening or closing takes two seconds.
      const step = (duration * delta) / 2;
      action.time += THREE.MathUtils.clamp(target - action.time, -step, step);
    } else if (p === 1 || (p === 0 && window.scrollY <= 0)) {
      action.time = target;
    } else {
      action.time += (target - action.time) * 0.15;
    }
    mixer.update(0);
  });

  return <primitive object={scene} />;
}

useGLTF.preload(sitePath("/models/door.glb"));

export function DoorScrollScene({
  manualOpen = null,
  onManualReset,
}: {
  manualOpen?: boolean | null;
  onManualReset?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const manual = useRef(manualOpen);
  const resetManual = useRef(onManualReset);
  manual.current = manualOpen;
  resetManual.current = onManualReset;

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = wrapRef.current;
      const rect = el?.getBoundingClientRect();
      const vh = window.innerHeight;
      if (manual.current !== null && rect && (rect.bottom <= 0 || rect.top >= vh)) {
        manual.current = null;
        resetManual.current?.();
      }
      if (manual.current !== null) {
        progress.current = manual.current ? 1 : 0;
      } else if (window.scrollY <= 0) {
        progress.current = 0;
      } else if (rect) {
        const elCenter = rect.top + rect.height / 2;
        // Start closed at the page top, or when the model enters the viewport
        // if it initially sits below the fold.
        const initialCenter = elCenter + window.scrollY;
        const start = Math.min(vh + rect.height / 2, initialCenter);
        const end = rect.height / 2; // model's top edge reaches the viewport top
        const raw = (start - elCenter) / Math.max(1, start - end);
        progress.current = Math.max(0, Math.min(1, raw));
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} className="door-render relative h-full w-full overflow-hidden rounded-2xl">
      <Canvas
        camera={{ position: [0, 1.2, 4.5], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <Suspense fallback={null}>
          <DoorInterior />
          <DoorBackdrop />
          <Bounds fit clip margin={1.15}>
            <DoorModel progress={progress} manual={manual} />
          </Bounds>
          <Environment preset="apartment" />
        </Suspense>
      </Canvas>
    </div>
  );
}
