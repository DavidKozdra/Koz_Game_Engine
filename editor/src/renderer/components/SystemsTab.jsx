import React, { useMemo, useState } from 'react';
import AssetsSceneBrowser from './AssetsSceneBrowser.jsx';
import {
  buildDisplayStageLayout,
  createPrefabFromObject,
  getProjectDisplaySettings,
  getProjectResolution,
} from '../state/projectModel.js';

function idFromName(name, fallback) {
  return (name || fallback || 'item').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback || 'item';
}

function parseEditorArgs(value) {
  if (!value || !value.trim()) return [];
  const args = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(value)) !== null) {
    args.push(match[1] || match[2] || match[3]);
  }
  return args;
}

function stringifyEditorArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return '';
  return args.map((arg) => {
    const value = String(arg || '');
    if (/\s/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
    return value;
  }).join(' ');
}

const DISPLAY_PRESETS = [
  { id: '360p', label: '360p', width: 640, height: 360 },
  { id: '540p', label: '540p', width: 960, height: 540 },
  { id: '720p', label: '720p', width: 1280, height: 720 },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '4-3', label: '4:3', width: 1024, height: 768 },
];

const DISPLAY_MODE_OPTIONS = [
  { id: 'contain', label: 'Fit', description: 'Keep the whole game visible inside the window.' },
  { id: 'cover', label: 'Fill', description: 'Fill the window and crop the overflow.' },
  { id: 'stretch', label: 'Stretch', description: 'Stretch to the window without preserving aspect.' },
  { id: 'native', label: 'Native', description: 'Keep the canvas at its logical pixel size.' },
];

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function formatAspectRatio(width, height) {
  const safeWidth = Math.max(1, Math.round(width || 1));
  const safeHeight = Math.max(1, Math.round(height || 1));
  const divisor = gcd(safeWidth, safeHeight);
  return `${safeWidth / divisor}:${safeHeight / divisor}`;
}

function getDisplayPreviewLayout(resolution, scaleMode) {
  if (scaleMode === 'native') {
    const scale = Math.min(1, 118 / Math.max(1, resolution.width), 74 / Math.max(1, resolution.height));
    return {
      width: Math.max(16, Math.round(resolution.width * scale)),
      height: Math.max(12, Math.round(resolution.height * scale)),
    };
  }
  return buildDisplayStageLayout(118, 74, resolution, { scaleMode });
}

function replaceCellTypeInWorld(world, removedId) {
  return {
    ...world,
    grid: ((world && world.grid) || []).map((row) => row.map((cell) => {
      if (cell === removedId) return 'empty';
      if (cell && typeof cell === 'object' && cell.typeId === removedId) return { ...cell, typeId: 'empty' };
      return cell;
    })),
  };
}

function clearSceneWorld(world) {
  return {
    ...world,
    grid: ((world && world.grid) || []).map((row) => row.map(() => 'empty')),
    elements: [],
  };
}

export default function SystemsTab({
  mode = 'assets',
  project,
  selectedObjectId,
  selectedSceneId,
  onPatchProject,
  onSelectObject,
  onSelectScene,
  onSetStartScene,
  onEditPrefabSource,
  onRenamePrefabVariant,
  onDeletePrefabVariant,
  onSavePrefabVariantFromObject,
}) {
  const [cellTypeName, setCellTypeName] = useState('');
  const [themeName, setThemeName] = useState((project && project.editorTheme) || 'slate');
  const [pluginName, setPluginName] = useState('');

  const objects = project.objects || [];
  const selectedObject = useMemo(() => objects.find((o) => o.id === selectedObjectId) || null, [objects, selectedObjectId]);

  function patch(patchData) {
    onPatchProject(patchData);
  }

  function addCellType() {
    const name = cellTypeName.trim() || `Type ${project.cellTypes.length + 1}`;
    const id = idFromName(name, `type-${Date.now().toString(36)}`);
    patch({
      cellTypes: [...project.cellTypes, {
        id,
        name,
        color: '#64748b',
        image: null,
        collision: false,
        layerId: (project.layers.cells[0] && project.layers.cells[0].id) || 'cell-base',
        rigidBody: { enabled: false, weight: 1, friction: 0.5 },
      }],
    });
    setCellTypeName('');
  }

  function updateCellType(id, field, value) {
    patch({ cellTypes: project.cellTypes.map((t) => (t.id === id ? { ...t, [field]: value } : t)) });
  }

  function updateCellTypeRigidBody(id, field, value) {
    patch({
      cellTypes: project.cellTypes.map((t) => {
        if (t.id !== id) return t;
        return { ...t, rigidBody: { ...(t.rigidBody || {}), [field]: value } };
      }),
    });
  }

  function removeCellType(id) {
    if (id === 'empty') return;
    patch({
      cellTypes: project.cellTypes.filter((t) => t.id !== id),
      scenes: (project.scenes || []).map((scene) => ({
        ...scene,
        world: replaceCellTypeInWorld(scene.world, id),
      })),
    });
  }

  function addLayer(group) {
    const key = group === 'cells' ? 'Cell Layer' : 'Object Layer';
    const id = idFromName(`${key} ${project.layers[group].length + 1}`, `${group}-layer-${Date.now().toString(36)}`);
    const order = project.layers[group].length;
    patch({ layers: { ...project.layers, [group]: [...project.layers[group], { id, name: key, order, visible: true }] } });
  }

  function updateLayer(group, id, field, value) {
    patch({
      layers: {
        ...project.layers,
        [group]: project.layers[group].map((l) => (l.id === id ? { ...l, [field]: value } : l)),
      },
    });
  }

  function addPrefabFromSelected() {
    if (!selectedObject) return;
    patch({
      prefabs: [...project.prefabs, createPrefabFromObject(selectedObject, {
        id: `prefab_${Date.now().toString(36)}`,
        name: `${selectedObject.name || selectedObject.type} Prefab`,
      })],
    });
  }

  function removePrefab(id) {
    patch({
      prefabs: project.prefabs.filter((p) => p.id !== id),
      scenes: (project.scenes || []).map((scene) => ({
        ...scene,
        objects: (scene.objects || []).map((obj) => {
          if (!obj || obj.prefabId !== id) return obj;
          const next = { ...obj };
          delete next.prefabId;
          delete next.prefabRevision;
          delete next.variantId;
          delete next.prefabOverrides;
          return next;
        }),
      })),
    });
  }

  function updateBuildTarget(field, value) {
    patch({ build: { ...project.build, targets: { ...project.build.targets, [field]: value } } });
  }

  function addPlugin() {
    const name = pluginName.trim();
    if (!name) return;
    patch({
      plugins: [...project.plugins, { id: `plugin_${Date.now().toString(36)}`, name, enabled: true, version: '0.1.0' }],
    });
    setPluginName('');
  }

  function updatePlugin(id, field, value) {
    patch({ plugins: project.plugins.map((p) => (p.id === id ? { ...p, [field]: value } : p)) });
  }

  function removePlugin(id) {
    patch({ plugins: project.plugins.filter((p) => p.id !== id) });
  }

  function updateEngine(engineId, enabled) {
    if (engineId === 'javascript') return;
    patch({ scripting: { ...project.scripting, engines: { ...project.scripting.engines, [engineId]: enabled } } });
  }

  function applyTheme(value) {
    setThemeName(value);
    patch({ editorTheme: value });
  }

  function clearAllProjectData() {
    const ok = window.confirm('Delete all objects, tiles, assets, scripts, animations, and prefabs from this project?');
    if (!ok) return;
    patch({
      scenes: (project.scenes || []).map((scene) => ({
        ...scene,
        world: clearSceneWorld(scene.world),
        objects: [],
      })),
      assets: [],
      scripts: [],
      animations: [],
      prefabs: [],
    });
    if (onSelectObject) onSelectObject(null);
  }

  if (mode === 'scenes') {
    return (
      <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 12 }}>
        <AssetsSceneBrowser
          project={project}
          onPatchProject={onPatchProject}
          onSelectScene={onSelectScene}
          onSetStartScene={onSetStartScene}
          selectedSceneId={selectedSceneId}
          showScenes={true}
          showImages={false}
          showPrefabs={false}
          title="Scenes"
        />
      </div>
    );
  }

  if (mode === 'settings') {
    const resolution = getProjectResolution(project);
    const display = getProjectDisplaySettings(project);
    const aspectRatio = formatAspectRatio(resolution.width, resolution.height);
    const displayPreview = getDisplayPreviewLayout(resolution, display.scaleMode);
    const settings = project.settings || {};
    const preferredEditor = settings.preferredEditor || 'vscode';
    const editorCommand = settings.editorCommand || '';
    const editorArgsText = stringifyEditorArgs(settings.editorArgs || []);
    const autoSaveScripts = settings.autoSaveScripts !== false;
    const formatOnSave = !!settings.formatOnSave;
    const confirmBeforeScriptDelete = settings.confirmBeforeScriptDelete !== false;

    function updateMeta(patchData) {
      patch({ meta: { ...(project.meta || {}), ...patchData } });
    }

    function updateSettings(patchData) {
      patch({ settings: { ...settings, ...patchData } });
    }

    return (
      <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 12 }}>
        <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <h3>Display</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <div style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 8, padding: '8px 10px', background: 'rgba(15,23,42,0.45)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Aspect</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{aspectRatio}</div>
              </div>
              <div style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 8, padding: '8px 10px', background: 'rgba(15,23,42,0.45)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Logical Size</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{resolution.width} x {resolution.height}</div>
              </div>
              <div style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 8, padding: '8px 10px', background: 'rgba(15,23,42,0.45)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Fullscreen</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{display.allowFullscreen !== false ? 'Allowed' : 'Off'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Resolution</label>
                <input
                  type="number"
                  min={1}
                  value={resolution.width}
                  onChange={(e) => updateMeta({
                    resolution: {
                      ...resolution,
                      width: Math.max(1, parseInt(e.target.value, 10) || 1),
                    },
                  })}
                />
                <label style={{ width: 60 }}>Height</label>
                <input
                  type="number"
                  min={1}
                  value={resolution.height}
                  onChange={(e) => updateMeta({
                    resolution: {
                      ...resolution,
                      height: Math.max(1, parseInt(e.target.value, 10) || 1),
                    },
                  })}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 6 }}>
                {DISPLAY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="btn btn-sm"
                    onClick={() => updateMeta({ resolution: { width: preset.width, height: preset.height } })}
                    style={{
                      justifyContent: 'space-between',
                      borderColor: resolution.width === preset.width && resolution.height === preset.height ? 'transparent' : undefined,
                      background: resolution.width === preset.width && resolution.height === preset.height ? 'rgba(59,130,246,0.18)' : undefined,
                    }}
                  >
                    <span>{preset.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{preset.width}x{preset.height}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(220px, 0.9fr)', gap: 12, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fit Mode</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {DISPLAY_MODE_OPTIONS.map((option) => {
                    const active = display.scaleMode === option.id;
                    return (
                      <button
                        key={option.id}
                        className="btn btn-sm"
                        onClick={() => updateMeta({
                          display: {
                            ...display,
                            scaleMode: option.id,
                          },
                        })}
                        style={{
                          justifyContent: 'flex-start',
                          borderColor: active ? 'transparent' : undefined,
                          background: active ? 'rgba(59,130,246,0.18)' : undefined,
                          padding: '8px 10px',
                        }}
                      >
                        <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                          <span style={{ fontWeight: 600 }}>{option.label}</span>
                          <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text-muted)' }}>{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Preview</div>
                <div style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: 10, background: 'rgba(2,8,23,0.5)' }}>
                  <div style={{ height: 96, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 8, border: '1px dashed rgba(148,163,184,0.28)', borderRadius: 6 }} />
                    <div
                      style={{
                        width: displayPreview.width,
                        height: displayPreview.height,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        borderRadius: 6,
                        border: '1px solid rgba(226,232,240,0.28)',
                        background: display.backgroundColor,
                        boxShadow: '0 8px 24px rgba(15,23,42,0.45)',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{DISPLAY_MODE_OPTIONS.find((option) => option.id === display.scaleMode)?.label || 'Fit'}</span>
                    <span>{display.scaleMode === 'native' ? 'Fixed canvas size' : 'Responsive scaling'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Background</label>
              <input
                type="color"
                value={display.backgroundColor || '#0b1220'}
                onChange={(e) => updateMeta({
                  display: {
                    ...display,
                    backgroundColor: e.target.value,
                  },
                })}
              />
              <label style={{ width: 88 }}>Fullscreen</label>
              <input
                type="checkbox"
                checked={display.allowFullscreen !== false}
                onChange={(e) => updateMeta({
                  display: {
                    ...display,
                    allowFullscreen: e.target.checked,
                    showFullscreenButton: e.target.checked ? display.showFullscreenButton !== false : false,
                  },
                })}
              />
              <label style={{ width: 58 }}>Button</label>
              <input
                type="checkbox"
                checked={display.allowFullscreen !== false && display.showFullscreenButton !== false}
                disabled={display.allowFullscreen === false}
                onChange={(e) => updateMeta({
                  display: {
                    ...display,
                    showFullscreenButton: e.target.checked,
                  },
                })}
              />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Resolution is the logical canvas size. Fit mode controls how that canvas scales in editor play mode and browser exports. Fullscreen uses `F11` or `Alt+Enter` when enabled.
          </div>
        </div>

        <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <h3>Scripting</h3>
          <div className="field">
            <label>JavaScript</label>
            <input type="checkbox" checked={true} disabled />
            <label>Lua</label>
            <input type="checkbox" checked={!!project.scripting.engines.lua} onChange={(e) => updateEngine('lua', e.target.checked)} />
            <label>Python</label>
            <input type="checkbox" checked={!!project.scripting.engines.python} onChange={(e) => updateEngine('python', e.target.checked)} />
          </div>
        </div>

        <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <h3>External Editor</h3>
          <div className="field">
            <label>Preferred Editor</label>
            <select value={preferredEditor} onChange={(e) => updateSettings({ preferredEditor: e.target.value })}>
              <option value="vscode">VS Code</option>
              <option value="code">VS Code (command)</option>
              <option value="cursor">Cursor</option>
              <option value="vscodium">VSCodium</option>
              <option value="atom">Atom</option>
              <option value="sublime">Sublime Text</option>
              <option value="webstorm">WebStorm</option>
            </select>
          </div>
          <div className="field">
            <label>Editor Command</label>
            <input
              value={editorCommand}
              onChange={(e) => updateSettings({ editorCommand: e.target.value })}
              placeholder="Optional override (e.g. code-insiders)"
            />
          </div>
          <div className="field">
            <label>Editor Args</label>
            <input
              value={editorArgsText}
              onChange={(e) => updateSettings({ editorArgs: parseEditorArgs(e.target.value) })}
              placeholder='Optional args (e.g. --reuse-window --goto)'
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Scripts will auto-save to external files and can be opened in your preferred editor.
          </div>
          <div className="field">
            <label>Auto-save Scripts</label>
            <input type="checkbox" checked={autoSaveScripts} onChange={(e) => updateSettings({ autoSaveScripts: e.target.checked })} />
            <label>Format on Save</label>
            <input type="checkbox" checked={formatOnSave} onChange={(e) => updateSettings({ formatOnSave: e.target.checked })} />
            <label>Confirm Script Delete</label>
            <input type="checkbox" checked={confirmBeforeScriptDelete} onChange={(e) => updateSettings({ confirmBeforeScriptDelete: e.target.checked })} />
          </div>
        </div>

        <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <h3>Theming</h3>
          <div className="field">
            <label>Theme</label>
            <select value={themeName} onChange={(e) => applyTheme(e.target.value)}>
              <option value="slate">Slate</option>
              <option value="graphite">Graphite</option>
              <option value="ocean">Ocean</option>
            </select>
          </div>
        </div>

        <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <h3>Plugins</h3>
          <div className="field">
            <label>Plugin</label>
            <input value={pluginName} onChange={(e) => setPluginName(e.target.value)} placeholder="plugin name" />
            <button className="btn btn-sm" onClick={addPlugin}>Add</button>
          </div>
          {(project.plugins || []).map((plugin) => (
            <div key={plugin.id} className="field">
              <input value={plugin.name} onChange={(e) => updatePlugin(plugin.id, 'name', e.target.value)} />
              <input value={plugin.version || ''} onChange={(e) => updatePlugin(plugin.id, 'version', e.target.value)} />
              <label style={{ width: 50 }}>On</label>
              <input type="checkbox" checked={plugin.enabled !== false} onChange={(e) => updatePlugin(plugin.id, 'enabled', e.target.checked)} />
              <button className="btn btn-sm btn-danger" onClick={() => removePlugin(plugin.id)}>Delete</button>
            </div>
          ))}
        </div>

        <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <h3>Build Targets</h3>
          <div className="field">
            <label>Active</label>
            <select value={project.build.target || 'html-zip'} onChange={(e) => patch({ build: { ...project.build, target: e.target.value } })}>
              <option value="electron-exe">Electron EXE</option>
              <option value="pwa">PWA</option>
              <option value="html-zip">HTML/ZIP</option>
              <option value="tarball">Tarball</option>
            </select>
          </div>
          <div className="field">
            <label>Electron EXE</label>
            <input type="checkbox" checked={!!project.build.targets.electronExe} onChange={(e) => updateBuildTarget('electronExe', e.target.checked)} />
            <label>PWA</label>
            <input type="checkbox" checked={!!project.build.targets.pwa} onChange={(e) => updateBuildTarget('pwa', e.target.checked)} />
            <label>HTML/ZIP</label>
            <input type="checkbox" checked={!!project.build.targets.htmlZip} onChange={(e) => updateBuildTarget('htmlZip', e.target.checked)} />
            <label>Tarball</label>
            <input type="checkbox" checked={!!project.build.targets.tarball} onChange={(e) => updateBuildTarget('tarball', e.target.checked)} />
          </div>
        </div>

        <div className="panel-section" style={{ border: '1px solid var(--danger)', borderRadius: 6 }}>
          <h3>Data</h3>
          <button className="btn btn-sm btn-danger" onClick={clearAllProjectData}>Delete Project Data</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 12 }}>
      <AssetsSceneBrowser
        project={project}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
        onPatchProject={onPatchProject}
        onSelectScene={onSelectScene}
        onSetStartScene={onSetStartScene}
        selectedSceneId={selectedSceneId}
        showScenes={false}
        showImages={true}
        showPrefabs={true}
        onEditPrefabSource={onEditPrefabSource}
        onDeletePrefab={removePrefab}
        onRenamePrefabVariant={onRenamePrefabVariant}
        onDeletePrefabVariant={onDeletePrefabVariant}
        onSavePrefabVariantFromObject={onSavePrefabVariantFromObject}
        title="Assets"
      />

      <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
        <h3>Cell Types</h3>
        <div className="field">
          <label>New Type</label>
          <input value={cellTypeName} onChange={(e) => setCellTypeName(e.target.value)} placeholder="ground, water, etc" />
          <button className="btn btn-sm" onClick={addCellType}>Add</button>
        </div>
        {(project.cellTypes || []).map((type) => (
          <div key={type.id} style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <div className="field">
              <label>Name</label>
              <input value={type.name} onChange={(e) => updateCellType(type.id, 'name', e.target.value)} />
            </div>
            <div className="field">
              <label>Color</label>
              <input type="color" value={type.color || '#64748b'} onChange={(e) => updateCellType(type.id, 'color', e.target.value)} />
              <label style={{ width: 80 }}>Layer</label>
              <select value={type.layerId || ''} onChange={(e) => updateCellType(type.id, 'layerId', e.target.value)}>
                {(project.layers.cells || []).map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Image</label>
              <select
                value={type.imageAssetId || ''}
                onChange={(e) => updateCellType(type.id, 'imageAssetId', e.target.value || null)}
                style={{ flex: 1 }}
              >
                <option value="">None (color only)</option>
                {((project.assets || []).filter((a) => a && a.kind === 'image' && a.mime === 'image/png')).map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.id}</option>
                ))}
              </select>
              {type.imageAssetId && (() => {
                const asset = (project.assets || []).find((a) => a.id === type.imageAssetId);
                const src = asset && (asset.previewUrl || asset.url || asset.src);
                return src ? <img src={src} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 2, marginLeft: 4 }} /> : null;
              })()}
            </div>
            <div className="field">
              <label>Collision</label>
              <input type="checkbox" checked={!!type.collision} onChange={(e) => updateCellType(type.id, 'collision', e.target.checked)} />
              <label style={{ width: 80 }}>Physics</label>
              <input type="checkbox" checked={!!(type.rigidBody && type.rigidBody.enabled)} onChange={(e) => updateCellTypeRigidBody(type.id, 'enabled', e.target.checked)} />
            </div>
            <div className="field">
              <label>Weight</label>
              <input type="number" value={(type.rigidBody && type.rigidBody.weight) || 0} onChange={(e) => updateCellTypeRigidBody(type.id, 'weight', parseFloat(e.target.value) || 0)} />
              <label style={{ width: 80 }}>Friction</label>
              <input type="number" value={(type.rigidBody && type.rigidBody.friction) || 0} onChange={(e) => updateCellTypeRigidBody(type.id, 'friction', parseFloat(e.target.value) || 0)} />
              {type.id !== 'empty' && <button className="btn btn-sm btn-danger" onClick={() => removeCellType(type.id)}>Delete</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
        <h3>Layers</h3>
        {['cells', 'objects'].map((group) => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong style={{ fontSize: 12, textTransform: 'capitalize' }}>{group}</strong>
              <button className="btn btn-sm" onClick={() => addLayer(group)}>+ Layer</button>
            </div>
            {(project.layers[group] || []).map((layer) => (
              <div key={layer.id} className="field">
                <input value={layer.name} onChange={(e) => updateLayer(group, layer.id, 'name', e.target.value)} />
                <label style={{ width: 55 }}>Visible</label>
                <input type="checkbox" checked={layer.visible !== false} onChange={(e) => updateLayer(group, layer.id, 'visible', e.target.checked)} />
                <label style={{ width: 40 }}>Z</label>
                <input type="number" value={layer.order || 0} onChange={(e) => updateLayer(group, layer.id, 'order', parseInt(e.target.value, 10) || 0)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
        <h3>Prefab Tools</h3>
        <div style={{ marginBottom: 8 }}>
          <button className="btn btn-sm" onClick={addPrefabFromSelected} disabled={!selectedObject}>Save Selected As Prefab</button>
          {!selectedObject && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>Select an object first</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Detailed prefab source and variant management now lives in the prefab browser above.
        </div>
      </div>
    </div>
  );
}
