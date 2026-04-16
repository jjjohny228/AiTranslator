import { useEffect, useRef, useState } from "react";

const MAX_PARTICLES = 24;
const SPAWN_INTERVAL_MS = 140;
const PARTICLE_LIFETIME_MS = 1600;

function createParticle(x, y) {
  const driftX = (Math.random() - 0.5) * 110;
  const driftY = (Math.random() - 0.5) * 90 - 20;
  const rotate = (Math.random() - 0.5) * 80;
  const size = 28 + Math.random() * 18;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    x,
    y,
    driftX,
    driftY,
    rotate,
    size,
  };
}

export function CondomBurst() {
  const [particles, setParticles] = useState([]);
  const throttleRef = useRef(0);

  useEffect(() => {
    function handlePointerMove(event) {
      const now = Date.now();
      if (now - throttleRef.current < SPAWN_INTERVAL_MS) {
        return;
      }
      throttleRef.current = now;

      const batch = Array.from({ length: 2 }, (_, index) =>
        createParticle(
          event.clientX + (index - 0.5) * 16 + (Math.random() - 0.5) * 14,
          event.clientY + (Math.random() - 0.5) * 10,
        ),
      );

      setParticles((current) => [...current, ...batch].slice(-MAX_PARTICLES));
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  useEffect(() => {
    if (!particles.length) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setParticles((current) => current.slice(2));
    }, PARTICLE_LIFETIME_MS);

    return () => window.clearTimeout(timeout);
  }, [particles]);

  return (
    <div className="condom-layer" aria-hidden="true">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="condom-particle"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size * 1.05,
            "--drift-x": `${particle.driftX}px`,
            "--drift-y": `${particle.driftY}px`,
            "--rotate": `${particle.rotate}deg`,
          }}
        >
          <img className="condom-shape" src="/assets/condom.png" alt="" />
        </div>
      ))}
    </div>
  );
}
