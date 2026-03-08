(function initParticleSystemCoreLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createParticleSystemCoreApi() {
  class Particle {
    constructor() {
      this.alive = false;
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.life = 0;
      this.maxLife = 0;
      this.size = 4;
      this.color = "#fff";
      this.alpha = 1;
      this.frame = null;
      this.screen = false;
      this.drag = 0.98;
      this.gravity = 0;
      this.tag = null;
    }
  }

  class ParticleSystemCore {
    constructor(options) {
      const opts = options || {};
      this.poolSize = Math.max(1, Number(opts.poolSize) || 300);
      this.random = typeof opts.random === "function" ? opts.random : Math.random;
      this.particles = new Array(this.poolSize);
      for (let i = 0; i < this.poolSize; i++) this.particles[i] = new Particle();
      this._next = 0;
    }

    _alloc() {
      const p = this.particles[this._next];
      this._next = (this._next + 1) % this.poolSize;
      return p;
    }

    spawn(x, y, opts) {
      const cfg = opts || {};
      const p = this._alloc();
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = cfg.vx != null ? cfg.vx : ((this.random() - 0.5) * (cfg.spreadX || 60));
      p.vy = cfg.vy != null ? cfg.vy : ((this.random() - 0.5) * (cfg.spreadY || 60));
      p.maxLife = cfg.life || (300 + this.random() * 400);
      p.life = p.maxLife;
      p.size = cfg.size || (2 + this.random() * 6);
      p.color = cfg.color || "#fff";
      p.alpha = 1;
      p.frame = cfg.frame || null;
      p.screen = !!cfg.screen;
      p.drag = cfg.drag || 0.98;
      p.gravity = cfg.gravity || 0;
      p.tag = cfg.tag || null;
      return p;
    }

    spawnBurst(x, y, opts) {
      const cfg = opts || {};
      const count = cfg.count || 24;
      for (let i = 0; i < count; i++) {
        const angle = this.random() * Math.PI * 2;
        const speed = (cfg.speed || 80) * (0.3 + this.random());
        this.spawn(x, y, Object.assign({}, cfg, {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        }));
      }
    }

    update(dtMs) {
      const dt = Number(dtMs) || 0;
      for (let i = 0; i < this.poolSize; i++) {
        const p = this.particles[i];
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          continue;
        }
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += p.gravity * (dt / 1000);
        p.x += p.vx * (dt / 1000);
        p.y += p.vy * (dt / 1000);
        p.alpha = Math.max(0, p.life / p.maxLife);
      }
    }

    activeParticles() {
      return this.particles.filter(function (p) { return p.alive; });
    }

    activeCount() {
      let n = 0;
      for (let i = 0; i < this.poolSize; i++) if (this.particles[i].alive) n++;
      return n;
    }

    clear() {
      for (let i = 0; i < this.poolSize; i++) this.particles[i].alive = false;
    }
  }

  return {
    Particle: Particle,
    ParticleSystemCore: ParticleSystemCore,
  };
});
