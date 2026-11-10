import { useEffect, useState } from "react";

export function RotatingWord({ words }: { words: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (!motion.matches && words.length > 1) {
        timer = setInterval(() => setIndex((value) => (value + 1) % words.length), 2200);
      }
    };
    update();
    motion.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      motion.removeEventListener("change", update);
    };
  }, [words]);

  return (
    <>
      <span className="sr-only">{words.join(", ")}</span>
      <span className="rotating-word" aria-hidden="true">
        {words.map((word) => (
          <span className="rotating-word-sizer" key={word}>
            {word}
          </span>
        ))}
        <span className="rotating-word-current" key={index}>
          {words[index % words.length]}
        </span>
      </span>
    </>
  );
}
