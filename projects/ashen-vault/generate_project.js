const fs = require("fs");
const path = require("path");

const projectSchema = require("../../Koz_Engine_Lib/Project/projectSchema");
const { generateDungeonMaze } = require("../../Koz_Engine_Lib/World/dungeonMaze");
const { SeededRNG } = require("../../Koz_Engine_Lib/World/seededRng");

const CELL_SIZE = 24;
const PROJECT_NAME = "Ashen Vault";
const PROJECT_VERSION = "0.1.0";
const BASE_SEED = 0xa51e0a1;
const OUTPUT_PATH = path.join(__dirname, "project.json");

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function base64Svg(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeWaveSample(phase, kind) {
  if (kind === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  if (kind === "triangle") return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (kind === "saw") {
    const wrapped = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
    return (wrapped * 2) - 1;
  }
  return Math.sin(phase);
}

function createToneDataUri({ duration, notes, sampleRate = 11025, gain = 0.34, noise = 0 }) {
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const dataSize = length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  function writeString(text) {
    buffer.write(text, offset, "ascii");
    offset += text.length;
  }

  function writeUint32(value) {
    buffer.writeUInt32LE(value >>> 0, offset);
    offset += 4;
  }

  function writeUint16(value) {
    buffer.writeUInt16LE(value >>> 0, offset);
    offset += 2;
  }

  writeString("RIFF");
  writeUint32(36 + dataSize);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(1);
  writeUint32(sampleRate);
  writeUint32(sampleRate * 2);
  writeUint16(2);
  writeUint16(16);
  writeString("data");
  writeUint32(dataSize);

  const sequence = Array.isArray(notes) ? notes : [];
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    let layers = 0;

    for (const note of sequence) {
      if (!note || t < note.start || t > note.end) continue;
      const local = (t - note.start) / Math.max(0.0001, note.end - note.start);
      const envelope = Math.sin(Math.PI * clamp(local, 0, 1));
      const harmonic = Number(note.harmonic || 0);
      const waveform = note.waveform || "sine";
      const noteGain = Number(note.gain ?? 1);
      const wobble = Number(note.wobble || 0);
      const wobbleFreq = Number(note.wobbleFreq || 0);
      const freq = Number(note.freq || 220) + (wobble ? Math.sin(t * wobbleFreq * Math.PI * 2) * wobble : 0);
      const base = makeWaveSample(Math.PI * 2 * freq * t, waveform);
      const overtone = harmonic ? makeWaveSample(Math.PI * 2 * freq * (1 + harmonic) * t, waveform) * 0.35 : 0;
      sample += (base + overtone) * envelope * noteGain;
      layers += 1;
    }

    if (layers > 0) sample /= layers;
    if (noise) {
      sample += ((Math.random() * 2) - 1) * noise * (1 - (t / Math.max(0.0001, duration)));
    }

    const finalSample = clamp(sample * gain, -1, 1);
    buffer.writeInt16LE(Math.round(finalSample * 32767), 44 + (i * 2));
  }

  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

function pixelSvg({ background = "#000000", strokes = [] }) {
  const body = strokes.map((stroke) => {
    const size = stroke.size || 4;
    return `<rect x="${stroke.x}" y="${stroke.y}" width="${size}" height="${size}" fill="${stroke.fill}" rx="${stroke.rx || 0}" />`;
  }).join("");
  return base64Svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <rect width="32" height="32" fill="${background}" fill-opacity="0"/>
      ${body}
    </svg>`
  );
}

function createAssets() {
  return [
    {
      id: "img_player_iron",
      name: "Lantern Bearer - Iron",
      kind: "image",
      previewUrl: pixelSvg({
        strokes: [
          { x: 12, y: 4, fill: "#f5f3ef", size: 4 },
          { x: 8, y: 8, fill: "#a855f7", size: 4 },
          { x: 12, y: 8, fill: "#e2e8f0", size: 4 },
          { x: 16, y: 8, fill: "#ca8a04", size: 4 },
          { x: 8, y: 12, fill: "#7c2d12", size: 4 },
          { x: 12, y: 12, fill: "#334155", size: 4 },
          { x: 16, y: 12, fill: "#f59e0b", size: 4 },
          { x: 8, y: 16, fill: "#475569", size: 4 },
          { x: 12, y: 16, fill: "#0f172a", size: 4 },
          { x: 16, y: 16, fill: "#facc15", size: 4 },
          { x: 8, y: 20, fill: "#475569", size: 4 },
          { x: 12, y: 20, fill: "#0f172a", size: 4 },
          { x: 16, y: 20, fill: "#713f12", size: 4 },
          { x: 12, y: 24, fill: "#94a3b8", size: 4 },
          { x: 16, y: 24, fill: "#94a3b8", size: 4 },
        ],
      }),
    },
    {
      id: "img_player_thread",
      name: "Lantern Bearer - Thread",
      kind: "image",
      previewUrl: pixelSvg({
        strokes: [
          { x: 12, y: 4, fill: "#f8fafc", size: 4 },
          { x: 8, y: 8, fill: "#0f766e", size: 4 },
          { x: 12, y: 8, fill: "#e2e8f0", size: 4 },
          { x: 16, y: 8, fill: "#38bdf8", size: 4 },
          { x: 8, y: 12, fill: "#164e63", size: 4 },
          { x: 12, y: 12, fill: "#082f49", size: 4 },
          { x: 16, y: 12, fill: "#93c5fd", size: 4 },
          { x: 8, y: 16, fill: "#155e75", size: 4 },
          { x: 12, y: 16, fill: "#082f49", size: 4 },
          { x: 16, y: 16, fill: "#7dd3fc", size: 4 },
          { x: 8, y: 20, fill: "#0f766e", size: 4 },
          { x: 12, y: 20, fill: "#082f49", size: 4 },
          { x: 16, y: 20, fill: "#0f766e", size: 4 },
          { x: 12, y: 24, fill: "#94a3b8", size: 4 },
          { x: 16, y: 24, fill: "#94a3b8", size: 4 },
        ],
      }),
    },
    {
      id: "img_player_ash",
      name: "Lantern Bearer - Ash",
      kind: "image",
      previewUrl: pixelSvg({
        strokes: [
          { x: 12, y: 4, fill: "#f8fafc", size: 4 },
          { x: 8, y: 8, fill: "#7c3aed", size: 4 },
          { x: 12, y: 8, fill: "#e2e8f0", size: 4 },
          { x: 16, y: 8, fill: "#fb7185", size: 4 },
          { x: 8, y: 12, fill: "#581c87", size: 4 },
          { x: 12, y: 12, fill: "#111827", size: 4 },
          { x: 16, y: 12, fill: "#f97316", size: 4 },
          { x: 8, y: 16, fill: "#581c87", size: 4 },
          { x: 12, y: 16, fill: "#111827", size: 4 },
          { x: 16, y: 16, fill: "#fb7185", size: 4 },
          { x: 8, y: 20, fill: "#581c87", size: 4 },
          { x: 12, y: 20, fill: "#111827", size: 4 },
          { x: 16, y: 20, fill: "#581c87", size: 4 },
          { x: 12, y: 24, fill: "#94a3b8", size: 4 },
          { x: 16, y: 24, fill: "#94a3b8", size: 4 },
        ],
      }),
    },
    {
      id: "img_enemy_guard",
      name: "Cinder Guard",
      kind: "image",
      previewUrl: pixelSvg({
        strokes: [
          { x: 12, y: 4, fill: "#d6d3d1", size: 4 },
          { x: 8, y: 8, fill: "#78350f", size: 4 },
          { x: 12, y: 8, fill: "#cbd5e1", size: 4 },
          { x: 16, y: 8, fill: "#991b1b", size: 4 },
          { x: 8, y: 12, fill: "#1f2937", size: 4 },
          { x: 12, y: 12, fill: "#334155", size: 4 },
          { x: 16, y: 12, fill: "#f97316", size: 4 },
          { x: 8, y: 16, fill: "#1f2937", size: 4 },
          { x: 12, y: 16, fill: "#0f172a", size: 4 },
          { x: 16, y: 16, fill: "#f97316", size: 4 },
          { x: 12, y: 20, fill: "#475569", size: 4 },
          { x: 16, y: 20, fill: "#475569", size: 4 },
        ],
      }),
    },
    {
      id: "img_enemy_acolyte",
      name: "Glass Acolyte",
      kind: "image",
      previewUrl: pixelSvg({
        strokes: [
          { x: 12, y: 4, fill: "#f1f5f9", size: 4 },
          { x: 8, y: 8, fill: "#4c1d95", size: 4 },
          { x: 12, y: 8, fill: "#cbd5e1", size: 4 },
          { x: 16, y: 8, fill: "#06b6d4", size: 4 },
          { x: 8, y: 12, fill: "#312e81", size: 4 },
          { x: 12, y: 12, fill: "#1e293b", size: 4 },
          { x: 16, y: 12, fill: "#67e8f9", size: 4 },
          { x: 8, y: 16, fill: "#312e81", size: 4 },
          { x: 12, y: 16, fill: "#0f172a", size: 4 },
          { x: 16, y: 16, fill: "#22d3ee", size: 4 },
          { x: 12, y: 20, fill: "#4c1d95", size: 4 },
          { x: 16, y: 20, fill: "#4c1d95", size: 4 },
        ],
      }),
    },
    {
      id: "img_relic_shrine",
      name: "Relic Shrine",
      kind: "image",
      previewUrl: base64Svg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40" shape-rendering="crispEdges">
          <rect x="10" y="28" width="12" height="8" fill="#3f3f46"/>
          <rect x="12" y="18" width="8" height="10" fill="#52525b"/>
          <rect x="8" y="12" width="16" height="8" fill="#71717a"/>
          <rect x="12" y="4" width="8" height="8" fill="#fde68a"/>
          <rect x="14" y="0" width="4" height="4" fill="#f97316"/>
        </svg>`
      ),
    },
    {
      id: "img_exit_gate",
      name: "Ash Gate",
      kind: "image",
      previewUrl: base64Svg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" shape-rendering="crispEdges">
          <rect x="2" y="4" width="4" height="28" fill="#3f3f46"/>
          <rect x="22" y="4" width="4" height="28" fill="#3f3f46"/>
          <rect x="6" y="2" width="16" height="4" fill="#52525b"/>
          <rect x="8" y="10" width="12" height="18" fill="#111827"/>
          <rect x="10" y="14" width="8" height="10" fill="#f59e0b"/>
        </svg>`
      ),
    },
    {
      id: "img_brazier",
      name: "Brazier",
      kind: "image",
      previewUrl: base64Svg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="26" viewBox="0 0 18 26" shape-rendering="crispEdges">
          <rect x="4" y="16" width="10" height="6" fill="#3f3f46"/>
          <rect x="7" y="22" width="4" height="4" fill="#52525b"/>
          <rect x="5" y="10" width="8" height="6" fill="#f97316"/>
          <rect x="7" y="4" width="4" height="6" fill="#fde68a"/>
        </svg>`
      ),
    },
    {
      id: "img_sigil",
      name: "Vault Sigil",
      kind: "image",
      previewUrl: base64Svg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="28" fill="none" stroke="#fb923c" stroke-width="2"/>
          <circle cx="36" cy="36" r="18" fill="none" stroke="#facc15" stroke-width="2"/>
          <path d="M36 10 L44 28 L62 36 L44 44 L36 62 L28 44 L10 36 L28 28 Z" fill="none" stroke="#f8fafc" stroke-width="2"/>
        </svg>`
      ),
    },
    {
      id: "asset_hub_theme",
      name: "Hub Theme",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 1.6,
        gain: 0.32,
        notes: [
          { start: 0.00, end: 1.60, freq: 174.61, waveform: "triangle", gain: 0.85, wobble: 1.1, wobbleFreq: 1.2 },
          { start: 0.00, end: 0.80, freq: 261.63, waveform: "sine", gain: 0.85 },
          { start: 0.40, end: 1.20, freq: 329.63, waveform: "sine", gain: 0.8 },
          { start: 0.80, end: 1.60, freq: 392.0, waveform: "sine", gain: 0.76 },
          { start: 1.10, end: 1.60, freq: 523.25, waveform: "sine", gain: 0.42 },
        ],
      }),
    },
    {
      id: "asset_descent_theme",
      name: "Descent Theme",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 1.25,
        gain: 0.34,
        noise: 0.012,
        notes: [
          { start: 0.00, end: 1.25, freq: 92.5, waveform: "triangle", gain: 1, wobble: 0.7, wobbleFreq: 1.9 },
          { start: 0.10, end: 0.44, freq: 138.59, waveform: "saw", gain: 0.72, harmonic: 1 },
          { start: 0.48, end: 0.80, freq: 164.81, waveform: "saw", gain: 0.7, harmonic: 1 },
          { start: 0.84, end: 1.18, freq: 123.47, waveform: "saw", gain: 0.68, harmonic: 1 },
        ],
      }),
    },
    {
      id: "asset_swing",
      name: "Blade Swing",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 0.13,
        gain: 0.38,
        noise: 0.03,
        notes: [
          { start: 0.00, end: 0.13, freq: 420, waveform: "triangle", gain: 1.0, wobble: 60, wobbleFreq: 16 },
        ],
      }),
    },
    {
      id: "asset_dash",
      name: "Dash Burst",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 0.12,
        gain: 0.36,
        noise: 0.025,
        notes: [
          { start: 0.00, end: 0.12, freq: 220, waveform: "saw", gain: 1.0, wobble: 50, wobbleFreq: 12 },
        ],
      }),
    },
    {
      id: "asset_hit",
      name: "Impact",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 0.09,
        gain: 0.38,
        noise: 0.03,
        notes: [
          { start: 0.00, end: 0.09, freq: 120, waveform: "square", gain: 0.9 },
          { start: 0.01, end: 0.07, freq: 180, waveform: "triangle", gain: 0.75 },
        ],
      }),
    },
    {
      id: "asset_chime",
      name: "Relic Chime",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 0.42,
        gain: 0.34,
        notes: [
          { start: 0.00, end: 0.16, freq: 523.25, waveform: "sine", gain: 0.85 },
          { start: 0.08, end: 0.24, freq: 659.25, waveform: "sine", gain: 0.75 },
          { start: 0.18, end: 0.42, freq: 783.99, waveform: "sine", gain: 0.65 },
        ],
      }),
    },
    {
      id: "asset_alarm",
      name: "Alarm Tell",
      kind: "audio",
      previewUrl: createToneDataUri({
        duration: 0.24,
        gain: 0.34,
        notes: [
          { start: 0.00, end: 0.09, freq: 294, waveform: "square", gain: 0.95 },
          { start: 0.12, end: 0.24, freq: 392, waveform: "square", gain: 0.92 },
        ],
      }),
    },
  ];
}

function createGrid(cols, rows, fill) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function createRingWorld(cols, rows, floorId) {
  const grid = createGrid(cols, rows, floorId);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) grid[y][x] = "wall";
    }
  }
  return {
    cols,
    rows,
    offsetX: 0,
    offsetY: 0,
    defaultCell: "empty",
    grid,
    elements: [],
    meta: {},
  };
}

function cellToPosition(cellX, cellY, width = 18, height = 18) {
  return {
    x: (cellX * CELL_SIZE) + Math.floor((CELL_SIZE - width) * 0.5),
    y: (cellY * CELL_SIZE) + Math.floor((CELL_SIZE - height) * 0.5),
  };
}

function addBinding(object, scriptId, properties = {}) {
  object.components.ScriptBinding = { scriptId: null };
  object.components.ScriptBindings = [
    {
      scriptId,
      active: true,
      properties,
    },
  ];
  return object;
}

function addSoundComponent(object, config) {
  object.components.Sound = {
    assetId: null,
    category: "sfx",
    autoplay: false,
    loop: false,
    volume: 1,
    maxDistance: 0,
    ...config,
  };
  return object;
}

function createMusicSource(id, assetId) {
  const object = projectSchema.createGameObject("Scene Music", 0, 0, { type: "music_source", width: 12, height: 12 });
  object.id = id;
  object.components.Render.visible = false;
  object.components.Collision.enabled = false;
  object.components.Sound.assetId = assetId;
  object.components.Sound.volume = 0.42;
  object.components.Sound.autoplay = true;
  object.components.Sound.loop = true;
  return object;
}

function createLight(id, name, cellX, cellY, lightColor, radius) {
  const object = projectSchema.createGameObject(name, 0, 0, { type: "light", width: 18, height: 26 });
  const position = cellToPosition(cellX, cellY, 18, 26);
  object.id = id;
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = "img_brazier";
  object.components.Sprite.width = 18;
  object.components.Sprite.height = 26;
  object.components.Light.color = lightColor;
  object.components.Light.radius = radius;
  object.components.Light.intensity = 1.15;
  object.components.Light.falloff = 0.68;
  object.components.Light.height = 24;
  object.components.Render.zIndex = 2;
  object.components.ParticleEmitter = {
    enabled: true,
    count: 5,
    rate: 0,
    burst: false,
    life: 780,
    speed: 16,
    spreadAngle: 84,
    direction: 270,
    color: "#fb923c",
    size: 4,
    sizeEnd: 1,
    gravity: -6,
    drag: 0.96,
    loop: true,
    interval: 520,
    worldSpace: true,
  };
  return object;
}

function createMenuSigil(cellX, cellY) {
  const object = projectSchema.createGameObject("Vault Sigil", 0, 0, { type: "generic", width: 72, height: 72 });
  const position = cellToPosition(cellX, cellY, 72, 72);
  object.id = "obj_menu_sigil";
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = "img_sigil";
  object.components.Sprite.width = 72;
  object.components.Sprite.height = 72;
  object.components.Collision.enabled = false;
  object.components.Render.layerId = "obj-fx";
  object.components.Render.zIndex = 1;
  return object;
}

function createPlayer(id, cellX, cellY) {
  const object = projectSchema.createGameObject("Lantern Bearer", 0, 0, { type: "player", width: 18, height: 18 });
  const position = cellToPosition(cellX, cellY, 18, 18);
  object.id = id;
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = "img_player_iron";
  object.components.Sprite.width = 18;
  object.components.Sprite.height = 18;
  object.components.Collider.width = 16;
  object.components.Collider.height = 16;
  object.components.Collision.enabled = true;
  object.components.Collision.isTrigger = false;
  object.components.Render.zIndex = 3;
  return object;
}

function createPlayerPreview(id, cellX, cellY, options = {}) {
  const width = Number.isFinite(options.width) ? options.width : 24;
  const height = Number.isFinite(options.height) ? options.height : 24;
  const object = projectSchema.createGameObject(options.name || "Lantern Bearer Preview", 0, 0, {
    type: options.type || "player",
    width,
    height,
  });
  const position = cellToPosition(cellX, cellY, width, height);
  object.id = id;
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = options.assetId || "img_player_iron";
  object.components.Sprite.width = width;
  object.components.Sprite.height = height;
  object.components.Collider.width = Math.max(16, width - 4);
  object.components.Collider.height = Math.max(16, height - 4);
  object.components.Collision.enabled = false;
  object.components.Collision.isTrigger = false;
  object.components.RigidBody.enabled = false;
  object.components.Render.zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 3;
  return object;
}

function createLanternLight(id, cellX, cellY, options = {}) {
  const width = Number.isFinite(options.width) ? options.width : 8;
  const height = Number.isFinite(options.height) ? options.height : 8;
  const object = projectSchema.createGameObject(options.name || "Lantern Glow", 0, 0, {
    type: options.type || "light",
    width,
    height,
  });
  const position = cellToPosition(cellX, cellY, width, height);
  object.id = id;
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.color = options.spriteColor || "#fbbf24";
  object.components.Sprite.width = width;
  object.components.Sprite.height = height;
  object.components.Collision.enabled = false;
  object.components.Collision.isTrigger = false;
  object.components.RigidBody.enabled = false;
  object.components.Light.color = options.lightColor || "#ffd27a";
  object.components.Light.radius = Number.isFinite(options.radius) ? options.radius : 152;
  object.components.Light.intensity = Number.isFinite(options.intensity) ? options.intensity : 1.08;
  object.components.Light.falloff = Number.isFinite(options.falloff) ? options.falloff : 0.62;
  object.components.Render.layerId = options.layerId || "obj-fx";
  object.components.Render.zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 4;
  return object;
}

function createLanternFollower(cellX, cellY) {
  return createLanternLight("obj_player_lantern", cellX, cellY);
}

function createEnemy(id, name, assetId, cellX, cellY, role, tone, extra = {}) {
  const object = projectSchema.createGameObject(name, 0, 0, { type: "enemy", width: 18, height: 18 });
  const position = cellToPosition(cellX, cellY, 18, 18);
  object.id = id;
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = assetId;
  object.components.Sprite.width = 18;
  object.components.Sprite.height = 18;
  object.components.Sprite.color = tone;
  object.components.Collider.width = 16;
  object.components.Collider.height = 16;
  object.components.Render.zIndex = 3;
  addBinding(object, "script_enemy_brain", {
    role,
    maxHealth: extra.maxHealth || 3,
    moveSpeed: extra.moveSpeed || 46,
    attackDamage: extra.attackDamage || 11,
    attackRange: extra.attackRange || 26,
    visionRange: extra.visionRange || 210,
    hearRange: extra.hearRange || 180,
    flankBias: extra.flankBias || 0,
    bloodColor: extra.bloodColor || "#fb7185",
  });
  return object;
}

function createShrine(cellX, cellY) {
  const object = projectSchema.createGameObject("Cinder Shrine", 0, 0, { type: "relic", width: 28, height: 34 });
  const position = cellToPosition(cellX, cellY, 28, 34);
  object.id = "obj_relic_shrine";
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = "img_relic_shrine";
  object.components.Sprite.width = 28;
  object.components.Sprite.height = 34;
  object.components.Collider.width = 24;
  object.components.Collider.height = 28;
  object.components.Collision.enabled = true;
  object.components.Collision.isTrigger = true;
  object.components.Render.zIndex = 2;
  object.components.ParticleEmitter = {
    enabled: true,
    count: 7,
    rate: 0,
    burst: false,
    life: 920,
    speed: 18,
    spreadAngle: 240,
    direction: 270,
    color: "#fde68a",
    size: 5,
    sizeEnd: 1,
    gravity: -8,
    drag: 0.96,
    loop: true,
    interval: 640,
    worldSpace: true,
  };
  addSoundComponent(object, {
    assetId: "asset_chime",
    volume: 0.56,
    maxDistance: 0,
  });
  addBinding(object, "script_shrine_pickup");
  return object;
}

function createExit(cellX, cellY) {
  const object = projectSchema.createGameObject("Ash Gate", 0, 0, { type: "goal", width: 28, height: 36 });
  const position = cellToPosition(cellX, cellY, 28, 36);
  object.id = "obj_exit_gate";
  object.x = position.x;
  object.y = position.y;
  object.components.Transform.x = position.x;
  object.components.Transform.y = position.y;
  object.components.Sprite.assetId = "img_exit_gate";
  object.components.Sprite.width = 28;
  object.components.Sprite.height = 36;
  object.components.Sprite.color = "#a1a1aa";
  object.components.Collider.width = 24;
  object.components.Collider.height = 28;
  object.components.Collision.enabled = true;
  object.components.Collision.isTrigger = true;
  object.components.Render.zIndex = 2;
  object.components.ParticleEmitter = {
    enabled: true,
    count: 5,
    rate: 0,
    burst: false,
    life: 860,
    speed: 14,
    spreadAngle: 220,
    direction: 270,
    color: "#f59e0b",
    size: 4,
    sizeEnd: 1,
    gravity: -12,
    drag: 0.94,
    loop: true,
    interval: 760,
    worldSpace: true,
  };
  addSoundComponent(object, {
    assetId: "asset_alarm",
    volume: 0.48,
    maxDistance: 0,
  });
  addBinding(object, "script_exit_gate");
  return object;
}

function applyCameraTarget(scene, targetObjectId) {
  const camera = scene.objects.find((entry) => entry && entry.components && entry.components.Camera);
  if (camera) {
    camera.components.Camera.targetObjectId = targetObjectId;
    camera.components.Camera.deadZoneWidth = 120;
    camera.components.Camera.deadZoneHeight = 84;
    camera.components.Camera.speed = 8;
    camera.components.Camera.clampToWorld = true;
  }
}

function decorateSanctuaryWorld(world) {
  const midY = Math.floor(world.rows / 2);
  for (let x = 4; x < world.cols - 4; x += 1) {
    if (x % 2 === 0) world.grid[midY][x] = "ember";
  }
  for (let y = 5; y < world.rows - 5; y += 1) {
    world.grid[y][Math.floor(world.cols * 0.25)] = "wall";
    world.grid[y][Math.floor(world.cols * 0.75)] = "wall";
  }
  return world;
}

function buildDescentWorld() {
  SeededRNG.startRun(BASE_SEED, { installGlobalMathRandom: false });
  const stream = SeededRNG.stream("descent");
  const dungeon = generateDungeonMaze({
    cols: 39,
    rows: 21,
    rng: () => stream.random(),
    roomAttempts: 18,
    roomMinSize: 3,
    roomMaxSize: 7,
    roomPadding: 1,
    roomConnectors: 2,
    wallTile: "wall",
    floorTile: "flagstone",
  });
  const world = {
    cols: dungeon.cols,
    rows: dungeon.rows,
    offsetX: 0,
    offsetY: 0,
    defaultCell: "empty",
    grid: dungeon.grid.map((row) => row.slice()),
    elements: [
      { id: "element_spawn", kind: "spawn", x: dungeon.start.x, y: dungeon.start.y },
      { id: "element_exit", kind: "goal", x: dungeon.exit.x, y: dungeon.exit.y },
    ],
    meta: {
      seed: BASE_SEED,
      roomCount: dungeon.rooms.length,
    },
  };

  dungeon.rooms.forEach((room, index) => {
    if (index % 3 !== 1) return;
    const x = Math.min(world.cols - 2, room.x + Math.floor(room.width / 2));
    const y = Math.min(world.rows - 2, room.y + Math.floor(room.height / 2));
    if (world.grid[y] && world.grid[y][x] === "flagstone") {
      world.grid[y][x] = "ember";
    }
  });

  return { world, dungeon };
}

function createScripts() {
  const scripts = [];

  function addScript(id, name, source, filePath) {
    const script = projectSchema.createScript(name, source, { id });
    script.filePath = filePath;
    scripts.push(script);
  }

  addScript(
    "script_menu_system",
    "AshenVaultMenuSystem",
    `function getStorage(engine) {
  return (engine && (engine.storage || engine.save)) || null;
}

function loadState(engine, key, fallback) {
  var storage = getStorage(engine);
  var value = storage && typeof storage.load === "function" ? storage.load(key) : null;
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function saveState(engine, key, payload) {
  var storage = getStorage(engine);
  if (storage && typeof storage.save === "function") storage.save(payload, key);
}

function readMeta(engine) {
  return loadState(engine, "meta", {
    selectedVow: "iron",
    relicsUnlocked: 1,
    codexPages: 3,
    totalRuns: 0,
    bestClear: false,
    lastSeed: 0,
    lastOutcome: "No descent recorded",
    lastRelic: null
  });
}

function readSettings(engine) {
  return loadState(engine, "settings", { volume: 0.55 });
}

function applyVolume(engine) {
  var settings = readSettings(engine);
  var volume = Number(settings.volume);
  if (!Number.isFinite(volume)) volume = 0.55;
  volume = Math.max(0, Math.min(1, volume));
  if (engine && engine.audio && typeof engine.audio.setMasterVolume === "function") {
    engine.audio.setMasterVolume(volume);
  }
  return volume;
}

function buildButton(label, styleText, onClick) {
  var button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = styleText;
  button.onclick = onClick;
  return button;
}

function onInit(self, engine) {
  var manager = engine.uiManager || window.KozUIManager || window.uiManager;
  if (!manager) return;
  applyVolume(engine);
  manager.registerScreen(self.id + "_menu", {
    layer: "hud",
    layerOrder: 140,
    isVisible: function() { return true; },
    create: function() {
      var meta = readMeta(engine);
      var currentVolume = applyVolume(engine);
      var root = document.createElement("div");
      root.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:28px;background:radial-gradient(circle at top, rgba(251,146,60,0.18), rgba(15,23,42,0.96) 58%), linear-gradient(180deg, rgba(10,12,18,0.72), rgba(2,6,23,0.96));pointer-events:auto;font-family:Garamond,Georgia,serif;";
      var shell = document.createElement("div");
      shell.style.cssText = "width:min(880px,96vw);display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,0.9fr);gap:18px;";
      var hero = document.createElement("section");
      hero.style.cssText = "padding:28px 30px;border:1px solid rgba(253,186,116,0.22);border-radius:26px;background:linear-gradient(180deg, rgba(36,22,18,0.9), rgba(15,23,42,0.96));box-shadow:0 24px 90px rgba(0,0,0,0.45);color:#f8fafc;";
      var eyebrow = document.createElement("div");
      eyebrow.textContent = "Koz Engine Prototype";
      eyebrow.style.cssText = "letter-spacing:0.28em;font-size:11px;text-transform:uppercase;color:#fdba74;margin-bottom:14px;";
      var title = document.createElement("h1");
      title.textContent = "Ashen Vault";
      title.style.cssText = "margin:0;font-size:56px;line-height:0.92;font-weight:700;";
      var subtitle = document.createElement("p");
      subtitle.textContent = "A seeded action roguelike scaffold built on Koz Engine scene scripts, lighting, particles, and audio.";
      subtitle.style.cssText = "margin:18px 0 0;max-width:44ch;color:#e2e8f0;font-size:18px;line-height:1.5;";
      var bullets = document.createElement("div");
      bullets.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px;";
      ["AI-driven enemy squads", "Seeded first descent floor", "Sanctuary vow selection", "Inline art and sound assets"].forEach(function(text) {
        var item = document.createElement("div");
        item.textContent = text;
        item.style.cssText = "padding:12px 14px;border-radius:16px;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.18);color:#cbd5e1;font-size:14px;";
        bullets.appendChild(item);
      });
      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:24px;";
      actions.appendChild(buildButton("Enter Sanctuary", "padding:13px 18px;border:none;border-radius:999px;background:linear-gradient(135deg,#fb923c,#f97316);color:#1c0f09;font-weight:700;cursor:pointer;box-shadow:0 10px 30px rgba(249,115,22,0.35);", function() {
        var manager = (engine && engine.sceneManager) || window.sceneManager;
        if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_sanctuary");
      }));
      actions.appendChild(buildButton("Drop Into Descent", "padding:13px 18px;border:1px solid rgba(251,191,36,0.28);border-radius:999px;background:rgba(15,23,42,0.72);color:#fde68a;font-weight:700;cursor:pointer;", function() {
        var meta = readMeta(engine);
        if (!meta.selectedVow) meta.selectedVow = "iron";
        meta.lastSeed = Date.now() % 100000;
        saveState(engine, "meta", meta);
        var manager = (engine && engine.sceneManager) || window.sceneManager;
        if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_descent_01");
      }));
      var foot = document.createElement("div");
      foot.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:18px;color:#94a3b8;font-size:13px;";
      foot.textContent = "Latest outcome: " + meta.lastOutcome;
      hero.appendChild(eyebrow);
      hero.appendChild(title);
      hero.appendChild(subtitle);
      hero.appendChild(bullets);
      hero.appendChild(actions);
      hero.appendChild(foot);

      var panel = document.createElement("aside");
      panel.style.cssText = "padding:24px;border-radius:24px;border:1px solid rgba(148,163,184,0.18);background:rgba(9,12,20,0.92);box-shadow:0 24px 90px rgba(0,0,0,0.4);color:#e2e8f0;";
      var panelTitle = document.createElement("h2");
      panelTitle.textContent = "Vault Ledger";
      panelTitle.style.cssText = "margin:0 0 12px;font-size:26px;";
      var stats = document.createElement("div");
      stats.style.cssText = "display:grid;gap:10px;";
      [
        "Selected vow: " + String(meta.selectedVow || "iron"),
        "Relics catalogued: " + String(meta.relicsUnlocked || 1),
        "Codex pages: " + String(meta.codexPages || 0),
        "Recorded descents: " + String(meta.totalRuns || 0)
      ].forEach(function(text) {
        var row = document.createElement("div");
        row.textContent = text;
        row.style.cssText = "padding:11px 12px;border-radius:14px;background:rgba(30,41,59,0.5);border:1px solid rgba(148,163,184,0.14);font-size:14px;";
        stats.appendChild(row);
      });
      var settingsLabel = document.createElement("label");
      settingsLabel.textContent = "Master volume";
      settingsLabel.style.cssText = "display:block;margin:18px 0 8px;color:#fdba74;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;";
      var volume = document.createElement("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "100";
      volume.value = String(Math.round(currentVolume * 100));
      volume.style.cssText = "width:100%;accent-color:#fb923c;";
      volume.oninput = function() {
        var next = Math.max(0, Math.min(1, Number(volume.value) / 100));
        if (engine && engine.audio && typeof engine.audio.setMasterVolume === "function") {
          engine.audio.setMasterVolume(next);
        }
        saveState(engine, "settings", { volume: next });
      };
      var note = document.createElement("p");
      note.textContent = "Prototype controls in the descent: move with WASD, attack with Space, dash with Shift, interact with E.";
      note.style.cssText = "margin:16px 0 0;color:#94a3b8;line-height:1.6;font-size:14px;";
      panel.appendChild(panelTitle);
      panel.appendChild(stats);
      panel.appendChild(settingsLabel);
      panel.appendChild(volume);
      panel.appendChild(note);
      shell.appendChild(hero);
      shell.appendChild(panel);
      root.appendChild(shell);
      return root;
    }
  });
}
`,
    "scripts/menu_system.js"
  );

  addScript(
    "script_sanctuary_director",
    "AshenVaultSanctuaryDirector",
    `function getStorage(engine) {
  return (engine && (engine.storage || engine.save)) || null;
}

function loadState(engine, key, fallback) {
  var storage = getStorage(engine);
  var value = storage && typeof storage.load === "function" ? storage.load(key) : null;
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function saveState(engine, key, payload) {
  var storage = getStorage(engine);
  if (storage && typeof storage.save === "function") storage.save(payload, key);
}

function defaultMeta() {
  return {
    selectedVow: "iron",
    relicsUnlocked: 1,
    codexPages: 3,
    totalRuns: 0,
    bestClear: false,
    lastSeed: 0,
    lastOutcome: "No descent recorded",
    lastRelic: null
  };
}

function paintCards(cards, selected) {
  cards.forEach(function(entry) {
    var active = entry.key === selected;
    entry.node.style.borderColor = active ? "rgba(251,146,60,0.65)" : "rgba(148,163,184,0.16)";
    entry.node.style.background = active ? "linear-gradient(180deg, rgba(124,45,18,0.84), rgba(15,23,42,0.92))" : "rgba(15,23,42,0.72)";
    entry.badge.textContent = active ? "Selected" : "Vow";
    entry.badge.style.color = active ? "#fdba74" : "#94a3b8";
  });
}

function onInit(self, engine) {
  var manager = engine.uiManager || window.KozUIManager || window.uiManager;
  if (!manager) return;
  manager.registerScreen(self.id + "_sanctuary", {
    layer: "hud",
    layerOrder: 120,
    isVisible: function() { return true; },
    create: function() {
      var meta = loadState(engine, "meta", defaultMeta());
      var wrap = document.createElement("div");
      wrap.style.cssText = "position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:20px;background:linear-gradient(180deg, rgba(2,6,23,0.06), rgba(2,6,23,0.3) 60%, rgba(2,6,23,0.72));pointer-events:auto;font-family:Garamond,Georgia,serif;";
      var panel = document.createElement("div");
      panel.style.cssText = "width:min(960px,98vw);padding:18px 18px 20px;border-radius:26px;border:1px solid rgba(251,191,36,0.16);background:rgba(9,12,20,0.78);backdrop-filter:blur(10px);box-shadow:0 24px 80px rgba(0,0,0,0.35);color:#e2e8f0;";
      var top = document.createElement("div");
      top.style.cssText = "display:flex;align-items:end;justify-content:space-between;gap:18px;flex-wrap:wrap;";
      var heading = document.createElement("div");
      heading.innerHTML = "<div style='letter-spacing:0.22em;font-size:11px;text-transform:uppercase;color:#fdba74;margin-bottom:8px;'>Surface Sanctuary</div><h2 style='margin:0;font-size:34px;'>Choose A Vow And Re-enter The Vault</h2><p style='margin:8px 0 0;color:#94a3b8;font-size:15px;line-height:1.55;'>This hub is the run setup shell. It stores your selected vow, last seed, and completion state through the runtime storage API.</p>";
      var metaBox = document.createElement("div");
      metaBox.style.cssText = "padding:12px 14px;border-radius:18px;background:rgba(15,23,42,0.66);border:1px solid rgba(148,163,184,0.14);font-size:14px;line-height:1.6;color:#cbd5e1;";
      metaBox.innerHTML = "Best clear: " + (meta.bestClear ? "Recorded" : "Not yet") + "<br/>Last relic: " + String(meta.lastRelic || "None");
      top.appendChild(heading);
      top.appendChild(metaBox);
      var cards = document.createElement("div");
      cards.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px;";
      var cardRefs = [];
      [
        { key: "iron", title: "Vow of Iron", note: "Close guard, shield-weighted pressure, safest first descent.", color: "#fb923c" },
        { key: "thread", title: "Vow of Thread", note: "Mobile bow-chain style, long reach, best room control.", color: "#38bdf8" },
        { key: "ash", title: "Vow of Ash", note: "Hex lantern bursts, higher risk, stronger room clears.", color: "#f472b6" }
      ].forEach(function(vow) {
        var card = document.createElement("button");
        card.type = "button";
        card.style.cssText = "text-align:left;padding:16px 16px 18px;border-radius:20px;border:1px solid rgba(148,163,184,0.16);background:rgba(15,23,42,0.72);color:#f8fafc;cursor:pointer;";
        var badge = document.createElement("div");
        badge.textContent = "Vow";
        badge.style.cssText = "font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;";
        var title = document.createElement("div");
        title.textContent = vow.title;
        title.style.cssText = "font-size:24px;color:" + vow.color + ";";
        var note = document.createElement("p");
        note.textContent = vow.note;
        note.style.cssText = "margin:8px 0 0;color:#cbd5e1;line-height:1.55;font-size:14px;";
        card.appendChild(badge);
        card.appendChild(title);
        card.appendChild(note);
        card.onclick = function() {
          meta.selectedVow = vow.key;
          saveState(engine, "meta", meta);
          paintCards(cardRefs, meta.selectedVow);
        };
        cards.appendChild(card);
        cardRefs.push({ key: vow.key, node: card, badge: badge });
      });
      paintCards(cardRefs, meta.selectedVow);
      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:18px;";
      var start = document.createElement("button");
      start.type = "button";
      start.textContent = "Begin Descent";
      start.style.cssText = "padding:12px 18px;border:none;border-radius:999px;background:linear-gradient(135deg,#facc15,#fb923c);color:#23120a;font-weight:700;cursor:pointer;";
      start.onclick = function() {
        meta.lastSeed = Date.now() % 100000;
        saveState(engine, "meta", meta);
        var manager = (engine && engine.sceneManager) || window.sceneManager;
        if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_descent_01");
      };
      var back = document.createElement("button");
      back.type = "button";
      back.textContent = "Return To Title";
      back.style.cssText = "padding:12px 18px;border-radius:999px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.7);color:#e2e8f0;font-weight:700;cursor:pointer;";
      back.onclick = function() {
        var manager = (engine && engine.sceneManager) || window.sceneManager;
        if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_menu");
      };
      var hint = document.createElement("div");
      hint.textContent = "Prototype descent contains a generated floor, a shrine relic pickup, two enemy behaviors, and an ending screen.";
      hint.style.cssText = "margin-top:14px;color:#94a3b8;font-size:14px;line-height:1.55;";
      actions.appendChild(start);
      actions.appendChild(back);
      panel.appendChild(top);
      panel.appendChild(cards);
      panel.appendChild(actions);
      panel.appendChild(hint);
      wrap.appendChild(panel);
      return wrap;
    }
  });
}
`,
    "scripts/sanctuary_director.js"
  );

  addScript(
    "script_run_director",
    "AshenVaultRunDirector",
    `function getStorage(engine) {
  return (engine && (engine.storage || engine.save)) || null;
}

function loadState(engine, key, fallback) {
  var storage = getStorage(engine);
  var value = storage && typeof storage.load === "function" ? storage.load(key) : null;
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function saveState(engine, key, payload) {
  var storage = getStorage(engine);
  if (storage && typeof storage.save === "function") storage.save(payload, key);
}

function centerX(obj) {
  var sprite = obj && obj.components && obj.components.Sprite;
  return (Number(obj && obj.x) || 0) + ((sprite && sprite.width) || 18) * 0.5;
}

function centerY(obj) {
  var sprite = obj && obj.components && obj.components.Sprite;
  return (Number(obj && obj.y) || 0) + ((sprite && sprite.height) || 18) * 0.5;
}

function activeEnemies(engine) {
  var enemies = engine && typeof engine.findObjectsByType === "function" ? engine.findObjectsByType("enemy") : [];
  return (enemies || []).filter(function(enemy) { return enemy && enemy.dead !== true; });
}

function applyVow(player, vow) {
  if (!player || !player.components || !player.components.Sprite) return;
  player.vow = vow || "iron";
  if (player.vow === "thread") {
    player.components.Sprite.assetId = "img_player_thread";
    player.moveSpeed = 126;
    player.attackDamage = 1.35;
    player.attackRange = 108;
    player.attackSpread = 0.72;
    player.attackColor = "#38bdf8";
    player.dashDistance = 52;
  } else if (player.vow === "ash") {
    player.components.Sprite.assetId = "img_player_ash";
    player.moveSpeed = 112;
    player.attackDamage = 1.65;
    player.attackRange = 78;
    player.attackSpread = 1.4;
    player.attackColor = "#f472b6";
    player.dashDistance = 44;
  } else {
    player.components.Sprite.assetId = "img_player_iron";
    player.moveSpeed = 118;
    player.attackDamage = 1.8;
    player.attackRange = 38;
    player.attackSpread = 0.95;
    player.attackColor = "#fb923c";
    player.dashDistance = 48;
  }
}

function onInit(self, engine) {
  var meta = loadState(engine, "meta", {
    selectedVow: "iron",
    relicsUnlocked: 1,
    codexPages: 3,
    totalRuns: 0,
    bestClear: false,
    lastSeed: 0,
    lastOutcome: "No descent recorded",
    lastRelic: null
  });
  var player = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player") : null;
  var camera = engine && typeof engine.findObjectByType === "function" ? engine.findObjectByType("camera") : null;
  var exit = engine && typeof engine.findObject === "function" ? engine.findObject("obj_exit_gate") : null;
  var lantern = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player_lantern") : null;
  self.seed = meta.lastSeed || (Date.now() % 100000);
  self.objective = "Find the relic shrine and clear the wardens.";
  self.completed = false;
  self.failureHandled = false;
  window.__ashenVaultRun = {
    seed: self.seed,
    noise: null,
    relicClaimed: false,
    roomClear: false,
    startedAt: engine && engine.elapsed ? engine.elapsed : 0
  };
  if (player) {
    player.maxHealth = 100;
    player.health = 100;
    player.attackCooldown = 0;
    player.dashCooldown = 0;
    player.hitCooldown = 0;
    player.relicBonus = 0;
    player.lastDirX = 1;
    player.lastDirY = 0;
    player.dead = false;
    applyVow(player, meta.selectedVow || "iron");
  }
  if (camera && camera.components && camera.components.Camera && player) {
    camera.components.Camera.targetObjectId = player.id;
  }
  if (exit) exit.locked = true;
  if (lantern && player) {
    lantern.x = player.x + 5;
    lantern.y = player.y + 4;
    lantern.components.Transform.x = lantern.x;
    lantern.components.Transform.y = lantern.y;
  }
  var manager = engine.uiManager || window.KozUIManager || window.uiManager;
  if (!manager) return;
  manager.registerScreen(self.id + "_hud", {
    layer: "hud",
    layerOrder: 60,
    isVisible: function() { return true; },
    create: function() {
      var root = document.createElement("div");
      root.style.cssText = "position:absolute;inset:0;pointer-events:none;font-family:Garamond,Georgia,serif;color:#f8fafc;";
      var top = document.createElement("div");
      top.style.cssText = "position:absolute;top:16px;left:16px;display:grid;gap:10px;width:min(360px,calc(100vw - 32px));";
      var plaque = document.createElement("div");
      plaque.style.cssText = "padding:14px 16px;border-radius:18px;background:rgba(9,12,20,0.72);border:1px solid rgba(251,191,36,0.14);box-shadow:0 12px 32px rgba(0,0,0,0.26);";
      var title = document.createElement("div");
      title.textContent = "Descent 01";
      title.style.cssText = "font-size:26px;";
      var objective = document.createElement("div");
      objective.style.cssText = "margin-top:6px;color:#cbd5e1;font-size:15px;line-height:1.45;";
      var healthWrap = document.createElement("div");
      healthWrap.style.cssText = "margin-top:12px;height:10px;border-radius:999px;background:rgba(71,85,105,0.5);overflow:hidden;";
      var healthFill = document.createElement("div");
      healthFill.style.cssText = "height:100%;width:100%;background:linear-gradient(90deg,#f97316,#facc15);";
      var line = document.createElement("div");
      line.style.cssText = "display:flex;justify-content:space-between;gap:12px;margin-top:10px;color:#94a3b8;font-size:13px;";
      var vow = document.createElement("span");
      var enemies = document.createElement("span");
      var hint = document.createElement("div");
      hint.textContent = "WASD move, Space attack, Shift dash, E interact.";
      hint.style.cssText = "position:absolute;right:16px;bottom:16px;padding:12px 14px;border-radius:16px;background:rgba(9,12,20,0.68);border:1px solid rgba(148,163,184,0.12);color:#cbd5e1;font-size:13px;";
      healthWrap.appendChild(healthFill);
      line.appendChild(vow);
      line.appendChild(enemies);
      plaque.appendChild(title);
      plaque.appendChild(objective);
      plaque.appendChild(healthWrap);
      plaque.appendChild(line);
      top.appendChild(plaque);
      root.appendChild(top);
      root.appendChild(hint);
      self._hudRefs = { objective: objective, healthFill: healthFill, vow: vow, enemies: enemies };
      return root;
    },
    update: function() {
      var refs = self._hudRefs;
      var player = engine.findObject("obj_player");
      if (!refs || !player) return;
      var enemiesLeft = activeEnemies(engine).length;
      refs.objective.textContent = self.objective;
      refs.healthFill.style.width = String(Math.max(0, Math.min(100, (player.health / Math.max(1, player.maxHealth)) * 100))) + "%";
      refs.vow.textContent = "Vow: " + String(player.vow || "iron");
      refs.enemies.textContent = "Wardens: " + String(enemiesLeft);
    }
  });
}

function onUpdate(self, engine, dt) {
  var run = window.__ashenVaultRun || {};
  var player = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player") : null;
  var exit = engine && typeof engine.findObject === "function" ? engine.findObject("obj_exit_gate") : null;
  var lantern = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player_lantern") : null;
  var liveEnemies = activeEnemies(engine);
  if (run.noise && typeof run.noise.time === "number" && engine.elapsed - run.noise.time > 1.3) {
    run.noise = null;
  }
  if (player && lantern) {
    lantern.x = player.x + 5;
    lantern.y = player.y + 4;
    lantern.components.Transform.x = lantern.x;
    lantern.components.Transform.y = lantern.y;
  }
  if (!run.roomClear && liveEnemies.length === 0) {
    run.roomClear = true;
    self.objective = run.relicClaimed ? "The Ash Gate is open. Step through it." : "Claim the shrine relic, then leave through the gate.";
    if (exit) exit.locked = false;
    if (engine && engine.audio && typeof engine.audio.play === "function") {
      engine.audio.play("asset_alarm", { volume: 0.3 });
    }
  }
  if (run.roomClear && run.relicClaimed) {
    self.objective = "The Ash Gate is open. Step through it.";
  }
  if (player && player.health <= 0 && !self.failureHandled) {
    self.failureHandled = true;
    var meta = loadState(engine, "meta", {
      selectedVow: "iron",
      relicsUnlocked: 1,
      codexPages: 3,
      totalRuns: 0,
      bestClear: false,
      lastSeed: self.seed,
      lastOutcome: "No descent recorded",
      lastRelic: null
    });
    meta.totalRuns = Number(meta.totalRuns || 0) + 1;
    meta.lastSeed = self.seed;
    meta.lastOutcome = "Fell in the first descent";
    saveState(engine, "meta", meta);
    saveState(engine, "outcome", { result: "failure", seed: self.seed, vow: player.vow || "iron", relic: run.relicName || null });
    var manager = (engine && engine.sceneManager) || window.sceneManager;
    if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_ending");
  }
}
`,
    "scripts/run_director.js"
  );

  addScript(
    "script_player_controller",
    "AshenVaultPlayerController",
    `function spriteWidth(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.width) || 18;
}

function spriteHeight(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.height) || 18;
}

function centerX(obj) {
  return (Number(obj && obj.x) || 0) + spriteWidth(obj) * 0.5;
}

function centerY(obj) {
  return (Number(obj && obj.y) || 0) + spriteHeight(obj) * 0.5;
}

function distance(a, b) {
  var dx = centerX(a) - centerX(b);
  var dy = centerY(a) - centerY(b);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function normalize(x, y) {
  var length = Math.sqrt((x * x) + (y * y));
  if (!length) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

function wouldHitWall(obj, engine, nextX, nextY) {
  if (!engine || !engine.world || typeof engine.world.worldToCell !== "function" || typeof engine.world.isSolidCell !== "function") return false;
  var width = ((obj && obj.components && obj.components.Collider && obj.components.Collider.width) || spriteWidth(obj));
  var height = ((obj && obj.components && obj.components.Collider && obj.components.Collider.height) || spriteHeight(obj));
  var points = [
    { x: nextX + 2, y: nextY + 2 },
    { x: nextX + width - 2, y: nextY + 2 },
    { x: nextX + 2, y: nextY + height - 2 },
    { x: nextX + width - 2, y: nextY + height - 2 }
  ];
  for (var i = 0; i < points.length; i += 1) {
    var cell = engine.world.worldToCell(points[i].x, points[i].y);
    if (engine.world.isSolidCell(cell.x, cell.y)) return true;
  }
  return false;
}

function setNoise(self, engine, intensity) {
  window.__ashenVaultRun = window.__ashenVaultRun || {};
  window.__ashenVaultRun.noise = {
    x: centerX(self),
    y: centerY(self),
    power: intensity || 1,
    time: engine && typeof engine.elapsed === "number" ? engine.elapsed : 0
  };
}

function canHit(self, enemy) {
  if (!enemy || enemy.dead) return false;
  if (distance(self, enemy) > (Number(self.attackRange) || 36)) return false;
  var dx = centerX(enemy) - centerX(self);
  var dy = centerY(enemy) - centerY(self);
  var dir = normalize(self.lastDirX || 1, self.lastDirY || 0);
  var target = normalize(dx, dy);
  var dot = (dir.x * target.x) + (dir.y * target.y);
  return dot >= -(Number(self.attackSpread) || 0.1);
}

function isKeyPressed(engine, code) {
  if (typeof keyIsDown === "function" && keyIsDown(code)) return true;
  return !!(engine && typeof engine.keyIsDown === "function" && engine.keyIsDown(code));
}

function onInit(self, engine) {
  self.maxHealth = 100;
  self.health = 100;
  self.moveSpeed = self.moveSpeed || 118;
  self.attackDamage = self.attackDamage || 1.8;
  self.attackRange = self.attackRange || 38;
  self.attackSpread = self.attackSpread || 0.95;
  self.attackColor = self.attackColor || "#fb923c";
  self.dashDistance = self.dashDistance || 48;
  self.attackCooldown = 0;
  self.dashCooldown = 0;
  self.hitCooldown = 0;
  self.attackLatch = false;
  self.dashLatch = false;
  self.lastDirX = 1;
  self.lastDirY = 0;
}

function onUpdate(self, engine, dt) {
  if (self.health <= 0) {
    self.dead = true;
    self.components.Render.visible = false;
    return;
  }

  self.attackCooldown = Math.max(0, Number(self.attackCooldown || 0) - dt);
  self.dashCooldown = Math.max(0, Number(self.dashCooldown || 0) - dt);
  self.hitCooldown = Math.max(0, Number(self.hitCooldown || 0) - dt);

  var moveX = 0;
  var moveY = 0;
  if (isKeyPressed(engine, 65) || isKeyPressed(engine, LEFT_ARROW)) moveX -= 1;
  if (isKeyPressed(engine, 68) || isKeyPressed(engine, RIGHT_ARROW)) moveX += 1;
  if (isKeyPressed(engine, 87) || isKeyPressed(engine, UP_ARROW)) moveY -= 1;
  if (isKeyPressed(engine, 83) || isKeyPressed(engine, DOWN_ARROW)) moveY += 1;
  var move = normalize(moveX, moveY);
  if (move.x || move.y) {
    self.lastDirX = move.x;
    self.lastDirY = move.y;
  }
  var stepX = move.x * Number(self.moveSpeed || 118) * dt;
  var stepY = move.y * Number(self.moveSpeed || 118) * dt;
  if (!wouldHitWall(self, engine, self.x + stepX, self.y)) self.x += stepX;
  if (!wouldHitWall(self, engine, self.x, self.y + stepY)) self.y += stepY;

  var attackPressed = isKeyPressed(engine, SPACE);
  if (attackPressed && !self.attackLatch && self.attackCooldown <= 0) {
    self.attackLatch = true;
    self.attackCooldown = self.vow === "thread" ? 0.3 : 0.38;
    setNoise(self, engine, 1);
    if (engine && engine.audio && typeof engine.audio.play === "function") {
      engine.audio.play("asset_swing", { volume: self.vow === "ash" ? 0.3 : 0.26 });
    }
    var enemies = engine && typeof engine.findObjectsByType === "function" ? engine.findObjectsByType("enemy") : [];
    (enemies || []).forEach(function(enemy) {
      if (!canHit(self, enemy)) return;
      enemy.health = Number(enemy.health || enemy.maxHealth || 3) - (Number(self.attackDamage) || 1);
      if (enemy.health <= 0) enemy.dead = true;
      if (engine && engine.particles && typeof engine.particles.burstAt === "function") {
        engine.particles.burstAt(centerX(enemy), centerY(enemy), {
          count: self.vow === "ash" ? 18 : 12,
          speed: self.vow === "thread" ? 72 : 58,
          life: 520,
          color: self.attackColor || "#fb923c",
          size: 6,
          sizeEnd: 1,
          gravity: 14
        });
      }
      if (engine && engine.audio && typeof engine.audio.play === "function") {
        engine.audio.play("asset_hit", { volume: 0.28 });
      }
    });
  }
  if (!attackPressed) self.attackLatch = false;

  var dashPressed = isKeyPressed(engine, 16);
  if (dashPressed && !self.dashLatch && self.dashCooldown <= 0) {
    self.dashLatch = true;
    self.dashCooldown = 1.05;
    var dash = normalize(self.lastDirX || 1, self.lastDirY || 0);
    var dashX = dash.x * Number(self.dashDistance || 48);
    var dashY = dash.y * Number(self.dashDistance || 48);
    if (!wouldHitWall(self, engine, self.x + dashX, self.y)) self.x += dashX;
    if (!wouldHitWall(self, engine, self.x, self.y + dashY)) self.y += dashY;
    self.hitCooldown = 0.22;
    setNoise(self, engine, 1.2);
    if (engine && engine.audio && typeof engine.audio.play === "function") {
      engine.audio.play("asset_dash", { volume: 0.26 });
    }
    if (engine && engine.particles && typeof engine.particles.burstAt === "function") {
      engine.particles.burstAt(centerX(self), centerY(self), {
        count: 16,
        speed: 68,
        life: 420,
        color: "#f8fafc",
        size: 5,
        sizeEnd: 0.6,
        gravity: 0
      });
    }
  }
  if (!dashPressed) self.dashLatch = false;
}
`,
    "scripts/player_controller.js"
  );

  addScript(
    "script_enemy_brain",
    "AshenVaultEnemyBrain",
    `function spriteWidth(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.width) || 18;
}

function spriteHeight(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.height) || 18;
}

function centerX(obj) {
  return (Number(obj && obj.x) || 0) + spriteWidth(obj) * 0.5;
}

function centerY(obj) {
  return (Number(obj && obj.y) || 0) + spriteHeight(obj) * 0.5;
}

function normalize(x, y) {
  var length = Math.sqrt((x * x) + (y * y));
  if (!length) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

function distanceBetween(a, b) {
  var dx = centerX(a) - centerX(b);
  var dy = centerY(a) - centerY(b);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function lineOfSight(engine, a, b) {
  if (!engine || !engine.world || typeof engine.world.worldToCell !== "function" || typeof engine.world.isSolidCell !== "function") return true;
  var startX = centerX(a);
  var startY = centerY(a);
  var endX = centerX(b);
  var endY = centerY(b);
  var dx = endX - startX;
  var dy = endY - startY;
  var dist = Math.sqrt((dx * dx) + (dy * dy));
  var steps = Math.max(1, Math.floor(dist / 10));
  for (var i = 1; i < steps; i += 1) {
    var sampleX = startX + (dx * (i / steps));
    var sampleY = startY + (dy * (i / steps));
    var cell = engine.world.worldToCell(sampleX, sampleY);
    if (engine.world.isSolidCell(cell.x, cell.y)) return false;
  }
  return true;
}

function wouldHitWall(self, engine, nextX, nextY) {
  if (!engine || !engine.world || typeof engine.world.worldToCell !== "function" || typeof engine.world.isSolidCell !== "function") return false;
  var width = ((self && self.components && self.components.Collider && self.components.Collider.width) || spriteWidth(self));
  var height = ((self && self.components && self.components.Collider && self.components.Collider.height) || spriteHeight(self));
  var points = [
    { x: nextX + 2, y: nextY + 2 },
    { x: nextX + width - 2, y: nextY + 2 },
    { x: nextX + 2, y: nextY + height - 2 },
    { x: nextX + width - 2, y: nextY + height - 2 }
  ];
  for (var i = 0; i < points.length; i += 1) {
    var cell = engine.world.worldToCell(points[i].x, points[i].y);
    if (engine.world.isSolidCell(cell.x, cell.y)) return true;
  }
  return false;
}

function stepToward(self, engine, targetX, targetY, speed, dt) {
  var dir = normalize(targetX - centerX(self), targetY - centerY(self));
  var stepX = dir.x * speed * dt;
  var stepY = dir.y * speed * dt;
  if (!wouldHitWall(self, engine, self.x + stepX, self.y)) self.x += stepX;
  if (!wouldHitWall(self, engine, self.x, self.y + stepY)) self.y += stepY;
}

function onInit(self, engine) {
  self.maxHealth = Number(props.maxHealth || 3);
  self.health = self.maxHealth;
  self.role = String(props.role || "guard");
  self.moveSpeed = Number(props.moveSpeed || 46);
  self.attackDamage = Number(props.attackDamage || 11);
  self.attackRange = Number(props.attackRange || 26);
  self.visionRange = Number(props.visionRange || 210);
  self.hearRange = Number(props.hearRange || 180);
  self.aiState = "idle";
  self.lastSeenX = centerX(self);
  self.lastSeenY = centerY(self);
  self.memoryUntil = 0;
  self.attackCooldown = 0;
  self.stride = (Math.random() > 0.5 ? 1 : -1) * (props.flankBias || 0);
}

function onUpdate(self, engine, dt) {
  if (self.dead || self.health <= 0) {
    if (!self._deathHandled) {
      self._deathHandled = true;
      self.dead = true;
      self.components.Render.visible = false;
      self.components.Collision.enabled = false;
      if (engine && engine.particles && typeof engine.particles.burstAt === "function") {
        engine.particles.burstAt(centerX(self), centerY(self), {
          count: 18,
          speed: 54,
          life: 540,
          color: props.bloodColor || "#fb7185",
          size: 5,
          sizeEnd: 1,
          gravity: 20
        });
      }
    }
    return;
  }

  var player = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player") : null;
  if (!player || player.dead) return;

  self.attackCooldown = Math.max(0, Number(self.attackCooldown || 0) - dt);
  var dist = distanceBetween(self, player);
  var canSee = dist <= self.visionRange && lineOfSight(engine, self, player);
  var run = window.__ashenVaultRun || {};
  var heardNoise = run.noise && typeof run.noise.time === "number" && (engine.elapsed - run.noise.time) < 1.2 && dist <= self.hearRange;

  if (canSee) {
    self.lastSeenX = centerX(player);
    self.lastSeenY = centerY(player);
    self.memoryUntil = engine.elapsed + 1.6;
  } else if (heardNoise) {
    self.lastSeenX = Number(run.noise.x || centerX(self));
    self.lastSeenY = Number(run.noise.y || centerY(self));
    self.memoryUntil = engine.elapsed + 0.95;
  }

  if (dist <= self.attackRange + 2 && self.attackCooldown <= 0 && canSee) {
    self.aiState = "attack";
    self.attackCooldown = self.role === "acolyte" ? 1.18 : 0.92;
    if (Number(player.hitCooldown || 0) <= 0) {
      player.health = Number(player.health || 0) - self.attackDamage;
      player.hitCooldown = 0.36;
      if (engine && engine.audio && typeof engine.audio.play === "function") {
        engine.audio.play("asset_hit", { volume: 0.26 });
      }
    }
    return;
  }

  if (self.health / Math.max(1, self.maxHealth) < 0.4 && canSee) {
    self.aiState = "retreat";
    var retreat = normalize(centerX(self) - centerX(player), centerY(self) - centerY(player));
    stepToward(self, engine, centerX(self) + retreat.x * 64, centerY(self) + retreat.y * 64, self.moveSpeed * 0.95, dt);
    return;
  }

  if (canSee) {
    if (self.role === "flanker") {
      self.aiState = "flank";
      var dx = centerX(player) - centerX(self);
      var dy = centerY(player) - centerY(self);
      var flank = normalize(-dy, dx);
      var targetX = centerX(player) + flank.x * (42 + (self.stride * 18));
      var targetY = centerY(player) + flank.y * (42 + (self.stride * 18));
      stepToward(self, engine, targetX, targetY, self.moveSpeed, dt);
    } else {
      self.aiState = "pursue";
      stepToward(self, engine, centerX(player), centerY(player), self.moveSpeed, dt);
    }
    return;
  }

  if (self.memoryUntil > engine.elapsed) {
    self.aiState = "investigate";
    stepToward(self, engine, self.lastSeenX, self.lastSeenY, self.moveSpeed * 0.82, dt);
    return;
  }

  self.aiState = "idle";
}
`,
    "scripts/enemy_brain.js"
  );

  addScript(
    "script_shrine_pickup",
    "AshenVaultShrinePickup",
    `function spriteWidth(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.width) || 24;
}

function spriteHeight(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.height) || 24;
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + spriteWidth(b) && a.x + spriteWidth(a) > b.x && a.y < b.y + spriteHeight(b) && a.y + spriteHeight(a) > b.y;
}

function isKeyPressed(engine, code) {
  if (typeof keyIsDown === "function" && keyIsDown(code)) return true;
  return !!(engine && typeof engine.keyIsDown === "function" && engine.keyIsDown(code));
}

function onInit(self, engine) {
  self.claimed = false;
  self.interactLatch = false;
}

function onUpdate(self, engine, dt) {
  if (self.claimed) return;
  var player = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player") : null;
  if (!player || !overlaps(self, player)) return;
  var interact = isKeyPressed(engine, 69);
  if (interact && !self.interactLatch) {
    self.interactLatch = true;
    self.claimed = true;
    player.health = Math.min(Number(player.maxHealth || 100), Number(player.health || 0) + 25);
    player.relicBonus = Number(player.relicBonus || 0) + 0.45;
    player.attackDamage = Number(player.attackDamage || 1.8) + 0.45;
    self.components.Sprite.color = "#a3a3a3";
    if (self.components.ParticleEmitter) self.components.ParticleEmitter.loop = false;
    window.__ashenVaultRun = window.__ashenVaultRun || {};
    window.__ashenVaultRun.relicClaimed = true;
    window.__ashenVaultRun.relicName = "Coal Halo";
    if (engine && engine.audio && typeof engine.audio.playObjectSound === "function") {
      engine.audio.playObjectSound(self);
    }
    if (engine && engine.particles && typeof engine.particles.emitObject === "function") {
      engine.particles.emitObject(self, { count: 26, speed: 78, life: 820, color: "#fde68a", size: 6, sizeEnd: 1 });
    }
  }
  if (!interact) self.interactLatch = false;
}
`,
    "scripts/shrine_pickup.js"
  );

  addScript(
    "script_exit_gate",
    "AshenVaultExitGate",
    `function spriteWidth(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.width) || 24;
}

function spriteHeight(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.height) || 24;
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + spriteWidth(b) && a.x + spriteWidth(a) > b.x && a.y < b.y + spriteHeight(b) && a.y + spriteHeight(a) > b.y;
}

function getStorage(engine) {
  return (engine && (engine.storage || engine.save)) || null;
}

function loadState(engine, key, fallback) {
  var storage = getStorage(engine);
  var value = storage && typeof storage.load === "function" ? storage.load(key) : null;
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function saveState(engine, key, payload) {
  var storage = getStorage(engine);
  if (storage && typeof storage.save === "function") storage.save(payload, key);
}

function isKeyPressed(engine, code) {
  if (typeof keyIsDown === "function" && keyIsDown(code)) return true;
  return !!(engine && typeof engine.keyIsDown === "function" && engine.keyIsDown(code));
}

function onInit(self, engine) {
  self.locked = true;
  self.interactLatch = false;
}

function onUpdate(self, engine, dt) {
  self.rotation = Math.sin((engine.elapsed || 0) * 1.4) * 1.8;
  if (self.locked) {
    self.components.Sprite.color = "#71717a";
  } else {
    self.components.Sprite.color = "#facc15";
  }
  var player = engine && typeof engine.findObject === "function" ? engine.findObject("obj_player") : null;
  if (!player || self.locked || !overlaps(self, player)) return;
  var interact = isKeyPressed(engine, 69);
  if (interact && !self.interactLatch) {
    self.interactLatch = true;
    var run = window.__ashenVaultRun || {};
    var meta = loadState(engine, "meta", {
      selectedVow: "iron",
      relicsUnlocked: 1,
      codexPages: 3,
      totalRuns: 0,
      bestClear: false,
      lastSeed: 0,
      lastOutcome: "No descent recorded",
      lastRelic: null
    });
    meta.totalRuns = Number(meta.totalRuns || 0) + 1;
    meta.bestClear = true;
    meta.lastSeed = Number(run.seed || 0);
    meta.lastOutcome = "Secured the Ash Gate prototype clear";
    meta.lastRelic = run.relicName || "Coal Halo";
    meta.relicsUnlocked = Math.max(Number(meta.relicsUnlocked || 1), 2);
    saveState(engine, "meta", meta);
    saveState(engine, "outcome", {
      result: "victory",
      seed: run.seed || 0,
      vow: player.vow || "iron",
      relic: run.relicName || "Coal Halo"
    });
    if (engine && engine.audio && typeof engine.audio.play === "function") {
      engine.audio.play("asset_chime", { volume: 0.44 });
    }
    var manager = (engine && engine.sceneManager) || window.sceneManager;
    if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_ending");
  }
  if (!interact) self.interactLatch = false;
}
`,
    "scripts/exit_gate.js"
  );

  addScript(
    "script_ending_screen",
    "AshenVaultEndingScreen",
    `function getStorage(engine) {
  return (engine && (engine.storage || engine.save)) || null;
}

function loadState(engine, key, fallback) {
  var storage = getStorage(engine);
  var value = storage && typeof storage.load === "function" ? storage.load(key) : null;
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function onInit(self, engine) {
  var manager = engine.uiManager || window.KozUIManager || window.uiManager;
  if (!manager) return;
  manager.registerScreen(self.id + "_ending", {
    layer: "hud",
    layerOrder: 140,
    isVisible: function() { return true; },
    create: function() {
      var outcome = loadState(engine, "outcome", { result: "failure", seed: 0, vow: "iron", relic: null });
      var meta = loadState(engine, "meta", {
        selectedVow: "iron",
        relicsUnlocked: 1,
        codexPages: 3,
        totalRuns: 0,
        bestClear: false,
        lastSeed: 0,
        lastOutcome: "No descent recorded",
        lastRelic: null
      });
      var success = outcome.result === "victory";
      var root = document.createElement("div");
      root.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at center, rgba(250,204,21,0.12), rgba(2,6,23,0.96));pointer-events:auto;font-family:Garamond,Georgia,serif;";
      var card = document.createElement("div");
      card.style.cssText = "width:min(640px,94vw);padding:28px 30px;border-radius:26px;background:rgba(9,12,20,0.94);border:1px solid rgba(148,163,184,0.18);box-shadow:0 24px 90px rgba(0,0,0,0.42);color:#f8fafc;";
      var heading = document.createElement("div");
      heading.textContent = success ? "Prototype Clear" : "The Vault Claimed You";
      heading.style.cssText = "font-size:42px;color:" + (success ? "#facc15" : "#f97316") + ";";
      var body = document.createElement("p");
      body.textContent = success
        ? "You reached the exit with the room cleared and the Coal Halo claimed. The wider four-act run remains to be built, but this scaffold now covers the full loop from title to hub to descent to ending."
        : "You fell before completing the first descent. The run loop persisted your result and returned you to an ending state instead of dropping context.";
      body.style.cssText = "margin:14px 0 0;color:#cbd5e1;line-height:1.65;font-size:16px;";
      var ledger = document.createElement("div");
      ledger.style.cssText = "display:grid;gap:10px;margin-top:18px;";
      [
        "Outcome: " + String(meta.lastOutcome || outcome.result),
        "Seed: " + String(outcome.seed || meta.lastSeed || 0),
        "Vow: " + String(outcome.vow || meta.selectedVow || "iron"),
        "Relic: " + String(outcome.relic || meta.lastRelic || "None")
      ].forEach(function(text) {
        var row = document.createElement("div");
        row.textContent = text;
        row.style.cssText = "padding:11px 12px;border-radius:14px;background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.12);font-size:14px;";
        ledger.appendChild(row);
      });
      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:22px;";
      var sanctuary = document.createElement("button");
      sanctuary.type = "button";
      sanctuary.textContent = "Return To Sanctuary";
      sanctuary.style.cssText = "padding:12px 18px;border:none;border-radius:999px;background:linear-gradient(135deg,#facc15,#fb923c);color:#2b1608;font-weight:700;cursor:pointer;";
      sanctuary.onclick = function() {
        var manager = (engine && engine.sceneManager) || window.sceneManager;
        if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_sanctuary");
      };
      var title = document.createElement("button");
      title.type = "button";
      title.textContent = "Title Screen";
      title.style.cssText = "padding:12px 18px;border-radius:999px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.72);color:#f8fafc;font-weight:700;cursor:pointer;";
      title.onclick = function() {
        var manager = (engine && engine.sceneManager) || window.sceneManager;
        if (manager && typeof manager.loadScene === "function") manager.loadScene("scene_menu");
      };
      actions.appendChild(sanctuary);
      actions.appendChild(title);
      card.appendChild(heading);
      card.appendChild(body);
      card.appendChild(ledger);
      card.appendChild(actions);
      root.appendChild(card);
      return root;
    }
  });
}
`,
    "scripts/ending_screen.js"
  );

  return scripts;
}

function buildProject() {
  const project = projectSchema.createDefaultProject({
    name: PROJECT_NAME,
    cols: 40,
    rows: 22,
  });

  project.meta = {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    resolution: {
      width: 960,
      height: 540,
    },
    engineVersion: "0.1.0",
    renderMode: "2d",
    display: {
      scaleMode: "contain",
      allowFullscreen: true,
      showFullscreenButton: true,
      backgroundColor: "#05070d",
    },
  };

  project.layers = {
    cells: [
      { id: "cell-base", name: "Cell Base", order: 0, visible: true },
      { id: "cell-detail", name: "Cell Detail", order: 1, visible: true },
    ],
    objects: [
      { id: "obj-main", name: "Main Objects", order: 0, visible: true },
      { id: "obj-fx", name: "FX Objects", order: 1, visible: true },
    ],
  };

  project.settings = {
    preferredEditor: "vscode",
    editorCommand: "",
    editorArgs: [],
    autoSaveScripts: true,
    formatOnSave: false,
    confirmBeforeScriptDelete: true,
  };

  project.build = {
    profile: "web-prod",
    target: "html-zip",
    targets: {
      electronExe: false,
      pwa: false,
      htmlZip: true,
      tarball: false,
    },
    pwa: false,
  };

  project.cellTypes = [
    {
      id: "empty",
      name: "Empty",
      color: "#06080f",
      imageAssetId: null,
      collision: false,
      layerId: "cell-base",
      rigidBody: { enabled: false, weight: 0, friction: 0 },
    },
    {
      id: "flagstone",
      name: "Flagstone",
      color: "#1f2430",
      imageAssetId: null,
      collision: false,
      layerId: "cell-base",
      rigidBody: { enabled: false, weight: 0, friction: 0.1 },
    },
    {
      id: "wall",
      name: "Wall",
      color: "#141821",
      imageAssetId: null,
      collision: true,
      layerId: "cell-base",
      rigidBody: { enabled: true, weight: 1, friction: 0.8 },
    },
    {
      id: "ember",
      name: "Ember Sigil",
      color: "#4a1d19",
      imageAssetId: null,
      collision: false,
      layerId: "cell-detail",
      rigidBody: { enabled: false, weight: 0, friction: 0 },
    },
  ];

  project.assets = createAssets();
  project.animations = [];
  project.scripts = createScripts();

  const menuWorld = createRingWorld(40, 22, "flagstone");
  for (let x = 8; x < 32; x += 1) {
    menuWorld.grid[5][x] = x % 2 === 0 ? "ember" : "flagstone";
    menuWorld.grid[16][x] = x % 2 === 0 ? "ember" : "flagstone";
  }
  const menuObjects = [
    addBinding(projectSchema.createGameObject("Menu State", 120, 96, { type: "controller", width: 20, height: 20 }), "script_menu_system"),
    createMenuSigil(17, 4),
    createPlayerPreview("obj_menu_player_preview", 19, 10, { name: "Lantern Bearer Preview" }),
    createLanternLight("obj_menu_player_lantern", 19, 10, { name: "Menu Lantern", radius: 168, intensity: 1.14 }),
    createLight("obj_menu_left_brazier", "Left Brazier", 8, 14, "#fb923c", 160),
    createLight("obj_menu_right_brazier", "Right Brazier", 30, 14, "#fb923c", 160),
  ];
  const menuScene = projectSchema.createScene("scene_menu", "Main Menu", menuWorld, menuObjects, {
    renderMode: "2d",
    lighting: {
      enabled: true,
      mode: "pixel",
      flicker: true,
      volumetric: false,
      fogBoost: 0.24,
      dither: true,
      vignette: 0.16,
      colorPreset: "warm",
      ambientColor: "#090b13",
      ambientIntensity: 0.24,
      overlayOpacity: 0.7,
      fogColor: "#090b13",
      fogDensity: 0.62,
    },
  });

  const sanctuaryWorld = decorateSanctuaryWorld(createRingWorld(40, 22, "flagstone"));
  const sanctuaryObjects = [
    addBinding(projectSchema.createGameObject("Sanctuary Director", 96, 96, { type: "controller", width: 20, height: 20 }), "script_sanctuary_director"),
    createPlayerPreview("obj_sanctuary_player_preview", 19, 11, { name: "Lantern Bearer Preview" }),
    createLanternLight("obj_sanctuary_player_lantern", 19, 11, { name: "Sanctuary Lantern", radius: 164, intensity: 1.12 }),
    createLight("obj_sanctuary_left_brazier", "Sanctuary Brazier Left", 7, 9, "#fb923c", 152),
    createLight("obj_sanctuary_right_brazier", "Sanctuary Brazier Right", 31, 9, "#fb923c", 152),
    createLight("obj_sanctuary_rear_left", "Rear Brazier Left", 10, 4, "#fde68a", 118),
    createLight("obj_sanctuary_rear_right", "Rear Brazier Right", 28, 4, "#fde68a", 118),
    createMusicSource("obj_sanctuary_music", "asset_hub_theme"),
  ];
  const sanctuarySigil = createMenuSigil(18, 8);
  sanctuarySigil.id = "obj_sanctuary_sigil";
  sanctuaryObjects.push(sanctuarySigil);
  const sanctuaryScene = projectSchema.createScene("scene_sanctuary", "Surface Sanctuary", sanctuaryWorld, sanctuaryObjects, {
    renderMode: "2d",
    lighting: {
      enabled: true,
      mode: "pixel",
      flicker: true,
      volumetric: false,
      fogBoost: 0.18,
      dither: true,
      vignette: 0.12,
      colorPreset: "warm",
      ambientColor: "#0a0d15",
      ambientIntensity: 0.22,
      overlayOpacity: 0.68,
      fogColor: "#070b13",
      fogDensity: 0.54,
    },
  });

  const descent = buildDescentWorld();
  const startRoom = descent.dungeon.rooms[0];
  const spawnCell = startRoom
    ? {
        x: startRoom.x + Math.floor(startRoom.width / 2),
        y: startRoom.y + Math.floor(startRoom.height / 2),
      }
    : {
        x: descent.dungeon.start.x,
        y: descent.dungeon.start.y,
      };
  const exitCell = descent.dungeon.exit;
  const remainingRooms = descent.dungeon.rooms.slice(1);
  const enemyRooms = remainingRooms.slice(0, 4);
  const shrineRoom = remainingRooms[Math.max(1, Math.floor(remainingRooms.length / 2))] || startRoom;
  const spawnElement = descent.world.elements.find((entry) => entry && entry.id === "element_spawn");

  if (spawnElement) {
    spawnElement.x = spawnCell.x;
    spawnElement.y = spawnCell.y;
  }

  const player = addBinding(createPlayer("obj_player", spawnCell.x, spawnCell.y), "script_player_controller");
  const playerLantern = createLanternFollower(spawnCell.x, spawnCell.y);
  const shrine = createShrine(
    shrineRoom.x + Math.floor(shrineRoom.width / 2),
    shrineRoom.y + Math.floor(shrineRoom.height / 2)
  );
  const exitGate = createExit(exitCell.x, exitCell.y);
  const descentObjects = [
    addBinding(projectSchema.createGameObject("Run Director", 64, 64, { type: "controller", width: 20, height: 20 }), "script_run_director"),
    player,
    playerLantern,
    createMusicSource("obj_descent_music", "asset_descent_theme"),
    createLight("obj_descent_start_brazier", "Entry Brazier", Math.max(1, spawnCell.x - 2), Math.max(1, spawnCell.y), "#fde68a", 130),
    createLight("obj_descent_exit_brazier", "Exit Brazier", Math.max(1, exitCell.x - 1), Math.max(1, exitCell.y), "#fb923c", 126),
    shrine,
    exitGate,
  ];

  enemyRooms.forEach((room, index) => {
    const x = room.x + Math.floor(room.width / 2);
    const y = room.y + Math.floor(room.height / 2);
    if (index % 2 === 0) {
      descentObjects.push(createEnemy(`obj_guard_${index}`, "Cinder Guard", "img_enemy_guard", x, y, index === 2 ? "flanker" : "guard", "#f97316", {
        maxHealth: 3,
        moveSpeed: 48,
        attackDamage: 10,
        attackRange: 24,
      }));
    } else {
      descentObjects.push(createEnemy(`obj_acolyte_${index}`, "Glass Acolyte", "img_enemy_acolyte", x, y, "acolyte", "#67e8f9", {
        maxHealth: 2,
        moveSpeed: 44,
        attackDamage: 13,
        attackRange: 30,
        visionRange: 228,
      }));
    }
  });

  const descentScene = projectSchema.createScene("scene_descent_01", "Descent 01", descent.world, descentObjects, {
    renderMode: "2d",
    lighting: {
      enabled: true,
      mode: "pixel",
      flicker: true,
      volumetric: false,
      fogBoost: 0.34,
      dither: true,
      vignette: 0.2,
      colorPreset: "noir",
      ambientColor: "#05070d",
      ambientIntensity: 0.15,
      overlayOpacity: 0.78,
      fogColor: "#05070d",
      fogDensity: 0.7,
    },
  });
  applyCameraTarget(descentScene, "obj_player");

  const endingWorld = createRingWorld(40, 22, "flagstone");
  const endingObjects = [
    addBinding(projectSchema.createGameObject("Ending State", 120, 96, { type: "controller", width: 20, height: 20 }), "script_ending_screen"),
    createMenuSigil(17, 6),
    createLight("obj_ending_left_brazier", "Ending Brazier Left", 10, 15, "#fb923c", 150),
    createLight("obj_ending_right_brazier", "Ending Brazier Right", 28, 15, "#fb923c", 150),
    createMusicSource("obj_ending_music", "asset_hub_theme"),
  ];
  const endingScene = projectSchema.createScene("scene_ending", "Ending", endingWorld, endingObjects, {
    renderMode: "2d",
    lighting: {
      enabled: true,
      mode: "pixel",
      flicker: true,
      volumetric: false,
      fogBoost: 0.22,
      dither: true,
      vignette: 0.14,
      colorPreset: "warm",
      ambientColor: "#090b13",
      ambientIntensity: 0.22,
      overlayOpacity: 0.7,
      fogColor: "#090b13",
      fogDensity: 0.58,
    },
  });

  project.scenes = [menuScene, sanctuaryScene, descentScene, endingScene];
  project.activeSceneId = "scene_menu";
  project.world = project.scenes[0].world;
  project.objects = project.scenes[0].objects;

  return projectSchema.migrate(project);
}

writeJson(OUTPUT_PATH, buildProject());
console.log(`Generated ${OUTPUT_PATH}`);
