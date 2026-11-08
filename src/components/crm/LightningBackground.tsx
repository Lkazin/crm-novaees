"use client";

import { useEffect, useRef } from "react";

interface NodeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  color: string;
}

export default function LightningBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = -1000;
    let mouseY = -1000;

    function onResize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    function onMouseMove(e: MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }

    function onMouseLeave() {
      mouseX = -1000;
      mouseY = -1000;
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    // 1. Partículas Inteligentes da Rede Neural
    const colors = ["#ff1744", "#ec4084", "#cd3493", "#9806bf", "#ffffff"];
    const particleCount = Math.min(75, Math.max(45, Math.floor((width * height) / 22000)));
    const particles: NodeParticle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: 1.2 + Math.random() * 2,
        baseAlpha: 0.4 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    let time = 0;

    function render() {
      if (!ctx) return;
      time += 0.008;

      ctx.clearRect(0, 0, width, height);

      // =====================================================================
      // 1. FUNDO VIVO: TRÊS LUZES ROXAS, ROSAS E VERMELHAS SE MOVENDO LENTAMENTE
      // =====================================================================

      // Luz 1: Roxa (#6B03CC / #9806BF) no quadrante esquerdo
      const light1X = width * 0.22 + Math.sin(time * 0.7) * (width * 0.16);
      const light1Y = height * 0.35 + Math.cos(time * 0.5) * (height * 0.18);
      const gradPurple = ctx.createRadialGradient(light1X, light1Y, 0, light1X, light1Y, Math.max(300, width * 0.32));
      gradPurple.addColorStop(0, "rgba(107, 3, 204, 0.42)");
      gradPurple.addColorStop(0.45, "rgba(152, 6, 191, 0.16)");
      gradPurple.addColorStop(1, "transparent");
      ctx.fillStyle = gradPurple;
      ctx.fillRect(0, 0, width, height);

      // Luz 2: Rosa (#EC4084 / #CD3493) no quadrante direito/inferior
      const light2X = width * 0.78 + Math.cos(time * 0.6) * (width * 0.16);
      const light2Y = height * 0.62 + Math.sin(time * 0.8) * (height * 0.18);
      const gradPink = ctx.createRadialGradient(light2X, light2Y, 0, light2X, light2Y, Math.max(320, width * 0.34));
      gradPink.addColorStop(0, "rgba(236, 64, 132, 0.38)");
      gradPink.addColorStop(0.5, "rgba(205, 52, 147, 0.14)");
      gradPink.addColorStop(1, "transparent");
      ctx.fillStyle = gradPink;
      ctx.fillRect(0, 0, width, height);

      // Luz 3: Vermelha (#FF1744 / #FF0055) no topo/centro
      const light3X = width * 0.5 + Math.sin(time * 0.9) * (width * 0.22);
      const light3Y = height * 0.18 + Math.cos(time * 0.65) * (height * 0.14);
      const gradRed = ctx.createRadialGradient(light3X, light3Y, 0, light3X, light3Y, Math.max(280, width * 0.3));
      gradRed.addColorStop(0, "rgba(255, 23, 68, 0.36)");
      gradRed.addColorStop(0.48, "rgba(255, 0, 85, 0.12)");
      gradRed.addColorStop(1, "transparent");
      ctx.fillStyle = gradRed;
      ctx.fillRect(0, 0, width, height);

      // =====================================================================
      // 2. PARTÍCULAS INTELIGENTES (REDE NEURAL CONECTADA)
      // =====================================================================
      const connectionDist = 135;

      // Atualiza posições das partículas
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Rebate suavemente nas bordas
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Interação sutil com o mouse
        const dxMouse = p.x - mouseX;
        const dyMouse = p.y - mouseY;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        if (distMouse < 140) {
          const force = (1 - distMouse / 140) * 0.8;
          p.x += (dxMouse / (distMouse || 1)) * force * 2;
          p.y += (dyMouse / (distMouse || 1)) * force * 2;
        }
      }

      // Conexões neurais entre pontos
      ctx.save();
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.32;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(236, 64, 132, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        // Conexão neural com o cursor se próximo
        if (mouseX > 0 && mouseY > 0) {
          const dxM = p1.x - mouseX;
          const dyM = p1.y - mouseY;
          const distM = Math.sqrt(dxM * dxM + dyM * dyM);
          if (distM < 160) {
            const alphaM = (1 - distM / 160) * 0.45;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.strokeStyle = `rgba(255, 23, 68, ${alphaM})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // Renderização dos pontos luminosos (nós neurais)
      ctx.save();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Brilho exterior sutil
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.baseAlpha * 0.35;
        ctx.fill();

        // Núcleo nítido e luminoso
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = p.baseAlpha;
        ctx.fill();
      }
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 0,
        display: "block"
      }}
    />
  );
}
