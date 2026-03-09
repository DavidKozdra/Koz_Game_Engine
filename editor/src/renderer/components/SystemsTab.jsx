import React, { useMemo, useState } from 'react';
import AssetsSceneBrowser from './AssetsSceneBrowser.jsx';

function idFromName(name, fallback) {
  return (name || fallback || 'item').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback || 'item';
}

export default function SystemsTab({ mode = 'assets', project, selectedObjectId, onPatchProject, onSelectObject }) {
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
      world: {
        ...project.world,
        grid: (project.world.grid || []).map((row) => row.map((cell) => {
          if (cell === id) return 'empty';
          if (cell && typeof cell === 'object' && cell.typeId === id) return { ...cell, typeId: 'empty' };
          return cell;
        })),
      },
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
      prefabs: [...project.prefabs, {
        id: `prefab_${Date.now().toString(36)}`,
        name: `${selectedObject.name || selectedObject.type} Prefab`,
        sourceObjectId: selectedObject.id,
        object: JSON.parse(JSON.stringify(selectedObject)),
      }],
    });
  }

  function removePrefab(id) {
    patch({ prefabs: project.prefabs.filter((p) => p.id !== id) });
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
      world: { ...project.world, grid: (project.world.grid || []).map((row) => row.map(() => 'empty')), elements: [] },
      objects: [],
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
          showScenes={true}
          showImages={false}
          showPrefabs={false}
          title="Scenes"
        />
      </div>
    );
  }

  if (mode === 'settings') {
    return (
      <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 12 }}>
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
        showScenes={false}
        showImages={true}
        showPrefabs={true}
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
        <h3>Prefabs</h3>
        <div style={{ marginBottom: 8 }}>
          <button className="btn btn-sm" onClick={addPrefabFromSelected} disabled={!selectedObject}>Save Selected As Prefab</button>
          {!selectedObject && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>Select an object first</span>}
        </div>
        <div>
          {(project.prefabs || []).map((prefab) => (
            <div key={prefab.id} className="field">
              <span style={{ flex: 1 }}>{prefab.name}</span>
              <button className="btn btn-sm btn-danger" onClick={() => removePrefab(prefab.id)}>Delete</button>
            </div>
          ))}
          {(project.prefabs || []).length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No prefabs saved.</div>}
        </div>
      </div>
    </div>
  );
}
