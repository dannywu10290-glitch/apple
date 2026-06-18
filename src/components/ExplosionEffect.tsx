import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

export interface ExplosionRef {
  trigger: (x: number, y: number, theme: 'cyberpunk' | 'retro' | 'aurora') => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  decay: number;
  gravity: number;
  spin: number;
  spinSpeed: number;
  type: 'spark' | 'smoke' | 'debris';
}

interface ExplosionEffectProps {
  className?: string;
}

export const ExplosionEffect = forwardRef<ExplosionRef, ExplosionEffectProps>(({ className }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number | null>(null);

  // Expose trigger method to parent components
  useImperativeHandle(ref, () => ({
    trigger: (x: number, y: number, theme: 'cyberpunk' | 'retro' | 'aurora') => {
      createExplosion(x, y, theme);
    }
  }));

  const getThemeColors = (theme: 'cyberpunk' | 'retro' | 'aurora') => {
    switch (theme) {
      case 'cyberpunk':
        return ['#ff007f', '#00f0ff', '#ffe600', '#ffffff', '#b500ff'];
      case 'retro':
        return ['#ff3b30', '#ff9500', '#ffcc00', '#777777', '#333333'];
      case 'aurora':
      default:
        return ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];
    }
  };

  const createExplosion = (x: number, y: number, theme: 'cyberpunk' | 'retro' | 'aurora') => {
    const colors = getThemeColors(theme);
    const particles: Particle[] = [];

    // Create central flash / sparks
    const sparkCount = 30 + Math.random() * 20;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (1 + Math.random() * 2), // slightly upward bias
        color: colors[Math.floor(Math.random() * colors.length)],
        radius: 1.5 + Math.random() * 2.5,
        alpha: 1,
        decay: 0.015 + Math.random() * 0.02,
        gravity: 0.15,
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 0.2,
        type: 'spark'
      });
    }

    // Create smoke clouds
    const smokeCount = 10 + Math.random() * 5;
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        color: theme === 'cyberpunk' ? 'rgba(128, 0, 128, 0.4)' : 'rgba(100, 100, 100, 0.4)',
        radius: 8 + Math.random() * 12,
        alpha: 0.6,
        decay: 0.01 + Math.random() * 0.01,
        gravity: -0.02, // rise slightly
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 0.05,
        type: 'smoke'
      });
    }

    // Add to main particles list
    particlesRef.current.push(...particles);

    // Start render loop if not already running
    if (!animationRef.current) {
      tick();
    }
  };

  const tick = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const particles = particlesRef.current;
    if (particles.length === 0) {
      animationRef.current = null;
      return;
    }

    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Update position
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= p.decay;
      p.spin += p.spinSpeed;

      // Draw depending on type
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);

      if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        // Draw small glowing diamonds/squares for sparklers
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.radius);
        ctx.lineTo(p.radius, 0);
        ctx.lineTo(0, p.radius);
        ctx.lineTo(-p.radius, 0);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Remove faded particles
      if (p.alpha <= 0 || p.radius <= 0.2) {
        particles.splice(i, 1);
      }
    }

    animationRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions to match container client bounds
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initial resize trigger to wait for layout settles
    const timer = setTimeout(resizeCanvas, 200);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      clearTimeout(timer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10
      }}
    />
  );
});

ExplosionEffect.displayName = 'ExplosionEffect';
