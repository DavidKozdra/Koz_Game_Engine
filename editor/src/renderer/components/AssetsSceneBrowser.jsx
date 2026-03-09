import React, { useMemo, useState } from 'react';

function isImageAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.kind === 'image') return true;
  if (asset.mime && String(asset.mime).startsWith('image/')) return true;
  const src = String(asset.url || asset.src || asset.path || '').toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|svg)$/.test(src);
}

function imageSrc(asset) {
  return asset.previewUrl || asset.url || asset.src || null;
}

export default function AssetsSceneBrowser({ project, onPatchProject, showScenes = true, showImages = true, showPrefabs = true, title = 'Assets' }) {
  const [expanded, setExpanded] = useState({ scenes: true, images: true, prefabs: true });
  const [newSceneName, setNewSceneName] = useState('');
  const [newImageName, setNewImageName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [sheetAssetId, setSheetAssetId] = useState('');
  const [sheetCols, setSheetCols] = useState(4);
  const [sheetRows, setSheetRows] = useState(4);
  const [sheetPrefix, setSheetPrefix] = useState('frame');

  const scenes = useMemo(() => {
    const list = Array.isArray(project.scenes) ? project.scenes : [];
    if (list.length > 0) return list;
    return [{ id: 'scene_main', name: 'Main Scene', world: project.world, objects: project.objects || [] }];
  }, [project.scenes, project.world, project.objects]);

  const images = useMemo(() => (project.assets || []).filter(isImageAsset), [project.assets]);
  const prefabs = project.prefabs || [];
  const activeSceneId = project.activeSceneId || (scenes[0] && scenes[0].id) || null;

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function addScene() {
    const name = newSceneName.trim();
    if (!name) return;
    const id = `scene_${Date.now().toString(36)}`;
    const baseWorld = project.world || { cols: 30, rows: 20, offsetX: 0, offsetY: 0, defaultCell: 'empty', grid: [], elements: [], meta: {} };
    const world = JSON.parse(JSON.stringify(baseWorld));
    if (Array.isArray(world.grid)) {
      world.grid = world.grid.map((row) => (Array.isArray(row) ? row.map(() => world.defaultCell || 'empty') : []));
    }
    onPatchProject({ scenes: [...scenes, { id, name, world, objects: [] }], activeSceneId: id });
    setNewSceneName('');
  }

  function removeScene(id) {
    if (scenes.length <= 1) return;
    const nextScenes = scenes.filter((s) => s.id !== id);
    const nextActive = activeSceneId === id ? nextScenes[0].id : activeSceneId;
    onPatchProject({ scenes: nextScenes, activeSceneId: nextActive });
  }

  function duplicateScene(id) {
    const source = scenes.find((s) => s.id === id);
    if (!source) return;
    const copy = {
      id: `scene_${Date.now().toString(36)}`,
      name: `${source.name} Copy`,
      world: JSON.parse(JSON.stringify(source.world || project.world)),
      objects: JSON.parse(JSON.stringify(source.objects || [])),
    };
    onPatchProject({ scenes: [...scenes, copy], activeSceneId: copy.id });
  }

  function moveScene(id, dir) {
    const idx = scenes.findIndex((s) => s.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= scenes.length) return;
    const next = scenes.slice();
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item);
    onPatchProject({ scenes: next });
  }

  function addImage() {
    const name = newImageName.trim();
    const url = newImageUrl.trim();
    if (!name || !url) return;
    if (!(url.toLowerCase().endsWith('.png') || url.startsWith('data:image/png'))) {
      alert('Only PNG images are supported for sprite/image assets.');
      return;
    }
    const asset = { id: `img_${Date.now().toString(36)}`, kind: 'image', mime: 'image/png', name, url };
    onPatchProject({ assets: [...(project.assets || []), asset] });
    setNewImageName('');
    setNewImageUrl('');
  }

  function importPngFiles(fileList) {
    const files = Array.from(fileList || []);
    const pngs = files.filter((file) => file && file.type === 'image/png');
    if (pngs.length === 0) return;
    let pending = pngs.length;
    const imported = [];
    pngs.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target && ev.target.result ? String(ev.target.result) : null;
        if (!dataUrl) {
          pending -= 1;
          if (pending === 0 && imported.length > 0) onPatchProject({ assets: [...(project.assets || []), ...imported] });
          return;
        }
        const img = new Image();
        img.onload = () => {
          imported.push({
            id: `img_${Date.now().toString(36)}_${imported.length + 1}`,
            kind: 'image',
            mime: 'image/png',
            name: file.name.replace(/\.png$/i, ''),
            url: dataUrl,
            previewUrl: dataUrl,
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
          });
          pending -= 1;
          if (pending === 0 && imported.length > 0) onPatchProject({ assets: [...(project.assets || []), ...imported] });
        };
        img.onerror = () => {
          pending -= 1;
          if (pending === 0 && imported.length > 0) onPatchProject({ assets: [...(project.assets || []), ...imported] });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(imageId) {
    onPatchProject({ assets: (project.assets || []).filter((a) => a.id !== imageId) });
  }

  function sliceSpriteSheet() {
    const source = (project.assets || []).find((a) => a.id === sheetAssetId);
    if (!source) return;
    const cols = Math.max(1, parseInt(String(sheetCols), 10) || 1);
    const rows = Math.max(1, parseInt(String(sheetRows), 10) || 1);
    const width = source.width || 0;
    const height = source.height || 0;
    if (!width || !height) {
      alert('Selected sprite sheet has no width/height metadata.');
      return;
    }
    const frameW = Math.floor(width / cols);
    const frameH = Math.floor(height / rows);
    if (frameW <= 0 || frameH <= 0) return;
    const created = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        created.push({
          id: `frm_${Date.now().toString(36)}_${y}_${x}`,
          kind: 'image',
          mime: 'image/png',
          name: `${sheetPrefix}_${y}_${x}`,
          sourceAssetId: source.id,
          frameRect: { x: x * frameW, y: y * frameH, w: frameW, h: frameH },
          width: frameW,
          height: frameH,
          previewUrl: source.previewUrl || source.url || source.src || null,
        });
      }
    }
    onPatchProject({ assets: [...(project.assets || []), ...created] });
  }

  return (
    <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
      <h3>{title}</h3>
      <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: '#0b1220' }}>
        {showScenes && (
          <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent' }} onClick={() => toggle('scenes')}>
          {expanded.scenes ? 'v' : '>'} [DIR] Scenes ({scenes.length})
          </button>
        )}
        {showScenes && expanded.scenes && (
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input value={newSceneName} onChange={(e) => setNewSceneName(e.target.value)} placeholder="New scene name" style={{ flex: 1, padding: '3px 6px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
              <button className="btn btn-sm" onClick={addScene}>Add</button>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {scenes.map((scene) => (
                <div key={scene.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, background: activeSceneId === scene.id ? 'rgba(59,130,246,0.16)' : '#111827' }}>
                  <button type="button" onClick={() => onPatchProject({ activeSceneId: scene.id })} style={{ background: 'none', border: 'none', color: '#cbd5e1', textAlign: 'left', cursor: 'pointer', flex: 1 }}>
                    {scene.name}
                  </button>
                  <button className="btn btn-sm" onClick={() => moveScene(scene.id, -1)} title="Move Up">^</button>
                  <button className="btn btn-sm" onClick={() => moveScene(scene.id, 1)} title="Move Down">v</button>
                  <button className="btn btn-sm" onClick={() => duplicateScene(scene.id)} title="Duplicate">Copy</button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeScene(scene.id)} disabled={scenes.length <= 1}>x</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {showImages && (
          <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent' }} onClick={() => toggle('images')}>
          {expanded.images ? 'v' : '>'} [DIR] Images ({images.length})
          </button>
        )}
        {showImages && expanded.images && (
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 6, marginBottom: 8 }}>
              <input value={newImageName} onChange={(e) => setNewImageName(e.target.value)} placeholder="Image name" style={{ padding: '3px 6px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
              <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Image URL or path" style={{ padding: '3px 6px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
              <button className="btn btn-sm" onClick={addImage}>Add</button>
            </div>
            <div style={{ marginBottom: 8 }}>
              <input
                type="file"
                accept=".png,image/png"
                multiple
                onChange={(e) => { importPngFiles(e.target.files); e.target.value = ''; }}
                style={{ width: '100%', fontSize: 11 }}
              />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Sprite Sheet Slicer</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 4 }}>
                <select value={sheetAssetId} onChange={(e) => setSheetAssetId(e.target.value)} style={{ padding: '3px 4px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }}>
                  <option value="">Sheet</option>
                  {images.map((img) => <option key={`sheet-${img.id}`} value={img.id}>{img.name}</option>)}
                </select>
                <input type="number" min={1} value={sheetCols} onChange={(e) => setSheetCols(parseInt(e.target.value, 10) || 1)} placeholder="Cols" style={{ padding: '3px 4px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
                <input type="number" min={1} value={sheetRows} onChange={(e) => setSheetRows(parseInt(e.target.value, 10) || 1)} placeholder="Rows" style={{ padding: '3px 4px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
                <input value={sheetPrefix} onChange={(e) => setSheetPrefix(e.target.value)} placeholder="Prefix" style={{ padding: '3px 4px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
                <button className="btn btn-sm" onClick={sliceSpriteSheet}>Slice</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {images.map((img) => (
                <div key={img.id} style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: '#111827' }}>
                  <div style={{ height: 72, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {imageSrc(img) ? <img src={imageSrc(img)} alt={img.name || img.id} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: '#94a3b8' }}>No Preview</span>}
                  </div>
                  <div style={{ padding: 6, fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name || img.id}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => removeImage(img.id)}>x</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showPrefabs && (
          <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, border: 'none', background: 'transparent' }} onClick={() => toggle('prefabs')}>
          {expanded.prefabs ? 'v' : '>'} [DIR] Prefabs ({prefabs.length})
          </button>
        )}
        {showPrefabs && expanded.prefabs && (
          <div style={{ padding: 8 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              {prefabs.length === 0 && <div style={{ color: '#94a3b8', fontSize: 11 }}>No prefabs yet.</div>}
              {prefabs.map((prefab) => (
                <div key={prefab.id} style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, background: '#111827', color: '#cbd5e1', fontSize: 12 }}>
                  {prefab.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
