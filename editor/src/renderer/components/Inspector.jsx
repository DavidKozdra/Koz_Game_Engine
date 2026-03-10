import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';

const AVAILABLE_COMPONENTS = [
  { id: 'Grid', label: 'Grid', defaults: { cols: 10, rows: 10, cellSize: 24, visible: true, layerId: null } },
  { id: 'Sprite', label: 'Sprite', defaults: { assetId: null, color: '#4ade80', width: 32, height: 32, frameAssetIds: [], fps: 8 } },
  { id: 'LightingManager', label: 'Lighting Manager', defaults: { enabled: false, ambientColor: '#0b1220', ambientIntensity: 0.35, overlayOpacity: 0.82, fogColor: '#07111d', fogDensity: 0.65 } },
  { id: 'Light', label: 'Light', defaults: { enabled: true, color: '#ffd27a', intensity: 1, radius: 180, falloff: 0.65, offsetX: 0, offsetY: 0, height: 18 } },
  { id: 'Sound', label: 'Sound', defaults: { assetId: null, category: 'sfx', autoplay: false, loop: false, volume: 1, maxDistance: 0 } },
  { id: 'Collider', label: 'Collider', defaults: { shape: 'rect', width: 32, height: 32 } },
  { id: 'Collision', label: 'Collision', defaults: { enabled: true, isTrigger: false } },
  { id: 'RigidBody', label: 'RigidBody', defaults: { enabled: false, weight: 1, friction: 0.4 } },
  { id: 'Animator', label: 'Animator', defaults: { clipId: null, autoplay: false } },
  { id: 'Camera', label: 'Camera', defaults: { enabled: true, targetObjectId: null, speed: 8, offsetX: 0, offsetY: 0, deadZoneWidth: 180, deadZoneHeight: 120, lookAheadX: 0, lookAheadY: 0, visibleMargin: 40, followX: true, followY: true, clampToWorld: true, maxSpeed: 2000 } },
];

function CollapsibleSection({ title, defaultOpen = true, onRemove, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(!open)}>
        <span>{open ? 'v' : '>'} {title}</span>
        {onRemove && (
          <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ fontSize: 9, padding: '0 4px' }} title={`Remove ${title}`}>x</button>
        )}
      </h3>
      {open && children}
    </div>
  );
}

export default function Inspector({ project, editorState, onUpdateObject, onUpdateComponent, onRemoveComponent, onCreatePrefabFromObject, onUnlinkPrefab }) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imageQuery, setImageQuery] = useState('');
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [audioQuery, setAudioQuery] = useState('');
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [componentQuery, setComponentQuery] = useState('');
  const selectedId = editorState.selectedObjectId;
  const obj = selectedId && project ? project.objects.find(o => o.id === selectedId) : null;
  const components = obj?.components || {};
  const bindings = components.ScriptBindings || [];
  const imageAssets = (project.assets || []).filter((a) => a && a.kind === 'image' && a.mime === 'image/png');
  const audioAssets = (project.assets || []).filter((a) => a && (a.kind === 'audio' || String(a.mime || '').startsWith('audio/')));
  const sceneObjects = (project && project.objects) || [];
  const imageAssetById = new Map(imageAssets.map((a) => [a.id, a]));
  const audioAssetById = new Map(audioAssets.map((a) => [a.id, a]));
  const selectedImageAsset = components.Sprite && components.Sprite.assetId ? imageAssetById.get(components.Sprite.assetId) : null;
  const selectedAudioAsset = components.Sound && components.Sound.assetId ? audioAssetById.get(components.Sound.assetId) : null;
  const linkedPrefab = obj && obj.prefabId ? (project.prefabs || []).find((p) => p.id === obj.prefabId) : null;
  const filteredImages = useMemo(() => {
    const q = imageQuery.trim().toLowerCase();
    if (!q) return imageAssets;
    return imageAssets.filter((asset) => {
      const id = String(asset.id || '').toLowerCase();
      const name = String(asset.name || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [imageAssets, imageQuery]);
  const filteredAudios = useMemo(() => {
    const q = audioQuery.trim().toLowerCase();
    if (!q) return audioAssets;
    return audioAssets.filter((asset) => {
      const id = String(asset.id || '').toLowerCase();
      const name = String(asset.name || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [audioAssets, audioQuery]);
  const filteredComponents = useMemo(() => {
    const existing = Object.keys(components).filter((k) => k !== 'Transform' && k !== 'Render' && k !== 'ScriptBindings');
    const available = AVAILABLE_COMPONENTS.filter((c) => !existing.includes(c.id) && c.id !== 'Transform' && c.id !== 'Render');
    const q = componentQuery.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [components, componentQuery]);

  if (!obj) {
    return (
      <div className="panel-section">
        <h3>Inspector</h3>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 0' }}>
          Select an object to inspect
        </div>
      </div>
    );
  }

  function handleNameChange(e) {
    onUpdateObject(obj.id, { name: e.target.value });
  }

  function handleComponentChange(compName, field, value) {
    const comp = { ...(components[compName] || {}) };
    comp[field] = value;
    onUpdateComponent(obj.id, compName, comp);
  }

  // ---- Script Bindings helpers ----
  function updateBindings(newBindings) {
    onUpdateComponent(obj.id, 'ScriptBindings', newBindings);
  }

  function handleAddBinding() {
    updateBindings([...bindings, { scriptId: null, active: true, properties: {} }]);
  }

  function handleRemoveBinding(index) {
    updateBindings(bindings.filter((_, i) => i !== index));
  }

  function handleBindingField(index, field, value) {
    const updated = bindings.map((b, i) => i === index ? { ...b, [field]: value } : b);
    updateBindings(updated);
  }

  function handlePropertyChange(bindingIndex, key, value) {
    const updated = bindings.map((b, i) => {
      if (i !== bindingIndex) return b;
      return { ...b, properties: { ...b.properties, [key]: value } };
    });
    updateBindings(updated);
  }

  function handleAddProperty(bindingIndex) {
    const key = prompt('Property name:');
    if (!key || !key.trim()) return;
    handlePropertyChange(bindingIndex, key.trim(), '');
  }

  function handleRemoveProperty(bindingIndex, key) {
    const updated = bindings.map((b, i) => {
      if (i !== bindingIndex) return b;
      const props = { ...b.properties };
      delete props[key];
      return { ...b, properties: props };
    });
    updateBindings(updated);
  }

  return (
    <div>
      {/* Prefab status bar — always on top */}
      {linkedPrefab ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
          background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)',
          borderRadius: 6, marginBottom: 6, fontSize: 11,
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Prefab:</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedPrefab.name}</span>
          <button className="btn btn-sm" onClick={() => onUnlinkPrefab && onUnlinkPrefab(obj.id)}
            style={{ fontSize: 10, padding: '1px 6px' }} title="Unlink this object from its prefab">Unlink</button>
        </div>
      ) : (
        <div style={{ marginBottom: 6 }}>
          <button className="btn btn-sm" style={{ width: '100%' }}
            onClick={() => onCreatePrefabFromObject && onCreatePrefabFromObject(obj.id)}>
            Save As Prefab
          </button>
        </div>
      )}

      <div className="panel-section">
        <h3>Inspector</h3>
        <div className="field">
          <label>Name</label>
          <input type="text" value={obj.name || ''} onChange={handleNameChange} />
        </div>
        <div className="field">
          <label>ID</label>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{obj.id}</span>
        </div>
        <div className="field">
          <label>Type</label>
          <input type="text" value={obj.type || 'generic'} onChange={(e) => onUpdateObject(obj.id, { type: e.target.value })} />
        </div>
        <div className="field">
          <label>Parent</label>
          <select
            value={obj.parentId || ''}
            onChange={(e) => onUpdateObject(obj.id, { parentId: e.target.value || null })}
          >
            <option value="">None</option>
            {sceneObjects.filter((o) => {
              if (o.id === obj.id) return false;
              // Prevent circular: walk up o's parent chain, skip if obj.id is an ancestor
              let cur = o;
              while (cur && cur.parentId) {
                if (cur.parentId === obj.id) return false;
                cur = sceneObjects.find((p) => p.id === cur.parentId);
              }
              return true;
            }).map((o) => (
              <option key={o.id} value={o.id}>{o.name || o.id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Transform */}
      {components.Transform && (
        <CollapsibleSection title="Transform">
          <div className="field">
            <label>X</label>
            <input type="number" value={components.Transform.x || 0}
              onChange={(e) => handleComponentChange('Transform', 'x', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>Y</label>
            <input type="number" value={components.Transform.y || 0}
              onChange={(e) => handleComponentChange('Transform', 'y', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>Rotation</label>
            <input type="number" value={components.Transform.rotation || 0}
              onChange={(e) => handleComponentChange('Transform', 'rotation', parseFloat(e.target.value) || 0)} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>deg</span>
          </div>
          <div className="field">
            <label>Scale X</label>
            <input type="number" step="0.1" value={components.Transform.scaleX ?? 1}
              onChange={(e) => handleComponentChange('Transform', 'scaleX', parseFloat(e.target.value) || 1)} />
          </div>
          <div className="field">
            <label>Scale Y</label>
            <input type="number" step="0.1" value={components.Transform.scaleY ?? 1}
              onChange={(e) => handleComponentChange('Transform', 'scaleY', parseFloat(e.target.value) || 1)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Grid */}
      {components.Grid && (
        <CollapsibleSection title="Grid" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Grid') : undefined}>
          <div className="field">
            <label>Columns</label>
            <input type="number" value={components.Grid.cols || 10}
              onChange={(e) => handleComponentChange('Grid', 'cols', parseInt(e.target.value, 10) || 10)} />
          </div>
          <div className="field">
            <label>Rows</label>
            <input type="number" value={components.Grid.rows || 10}
              onChange={(e) => handleComponentChange('Grid', 'rows', parseInt(e.target.value, 10) || 10)} />
          </div>
          <div className="field">
            <label>Cell Size</label>
            <input type="number" value={components.Grid.cellSize || 24}
              onChange={(e) => handleComponentChange('Grid', 'cellSize', parseInt(e.target.value, 10) || 24)} />
          </div>
          <div className="field">
            <label>Visible</label>
            <input type="checkbox" checked={components.Grid.visible !== false}
              onChange={(e) => handleComponentChange('Grid', 'visible', e.target.checked)} />
          </div>
          <div className="field">
            <label>Layer</label>
            <select
              value={components.Grid.layerId || ''}
              onChange={(e) => handleComponentChange('Grid', 'layerId', e.target.value || null)}
            >
              <option value="">None</option>
              {(project.layers?.cells || []).map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.name}</option>
              ))}
            </select>
          </div>
        </CollapsibleSection>
      )}

      {/* Sprite */}
      {components.Sprite && (
        <CollapsibleSection title="Sprite" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Sprite') : undefined}>
          {components.Sprite.assetId && !imageAssetById.has(components.Sprite.assetId) && (
            <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 6 }}>
              Missing PNG asset reference: {components.Sprite.assetId}
            </div>
          )}
          <div className="field">
            <label>Image</label>
            <div style={{ display: 'flex', flex: 1, gap: 6, alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={() => setShowImagePicker(true)}>Select Image</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedImageAsset ? selectedImageAsset.name : (components.Sprite.assetId || 'None')}
              </span>
              {components.Sprite.assetId && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleComponentChange('Sprite', 'assetId', null)}
                  title="Clear Image"
                >
                  x
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label>Color</label>
            <input type="color" value={components.Sprite.color || '#4ade80'}
              onChange={(e) => handleComponentChange('Sprite', 'color', e.target.value)} />
          </div>
          <div className="field">
            <label>Width</label>
            <input type="number" value={components.Sprite.width || 32}
              onChange={(e) => handleComponentChange('Sprite', 'width', parseInt(e.target.value, 10) || 32)} />
          </div>
          <div className="field">
            <label>Height</label>
            <input type="number" value={components.Sprite.height || 32}
              onChange={(e) => handleComponentChange('Sprite', 'height', parseInt(e.target.value, 10) || 32)} />
          </div>
          <div className="field">
            <label>Frames</label>
            <input
              type="text"
              value={Array.isArray(components.Sprite.frameAssetIds) ? components.Sprite.frameAssetIds.join(',') : ''}
              onChange={(e) => handleComponentChange('Sprite', 'frameAssetIds', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
              placeholder="asset_id_1,asset_id_2"
            />
          </div>
          <div className="field">
            <label>FPS</label>
            <input
              type="number"
              value={components.Sprite.fps || 8}
              onChange={(e) => handleComponentChange('Sprite', 'fps', Math.max(1, parseInt(e.target.value, 10) || 8))}
            />
          </div>
        </CollapsibleSection>
      )}
      <Modal open={showImagePicker} title="Select Sprite Image" onClose={() => setShowImagePicker(false)} maxWidth={920} minWidth={620}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={imageQuery}
              onChange={(e) => setImageQuery(e.target.value)}
              placeholder={`Search ${imageAssets.length} PNG images...`}
              style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <button className="btn btn-sm" onClick={() => setImageQuery('')} disabled={!imageQuery}>Clear</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredImages.length} result{filteredImages.length === 1 ? '' : 's'}
          </div>
          <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: '#0b1220' }}>
            {filteredImages.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No images match.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {filteredImages.map((asset) => {
                const preview = asset.previewUrl || asset.url || asset.src || null;
                const active = components.Sprite && components.Sprite.assetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      handleComponentChange('Sprite', 'assetId', asset.id);
                      setShowImagePicker(false);
                    }}
                    style={{
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 6,
                      background: active ? 'rgba(59,130,246,0.12)' : '#111827',
                      color: 'var(--text)',
                      padding: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ height: 90, background: '#1f2937', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
                      {preview ? (
                        <img src={preview} alt={asset.name || asset.id} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>No Preview</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name || asset.id}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={showAudioPicker} title="Select Audio File" onClose={() => setShowAudioPicker(false)} maxWidth={920} minWidth={620}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={audioQuery}
              onChange={(e) => setAudioQuery(e.target.value)}
              placeholder={`Search ${audioAssets.length} audio files...`}
              style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <button className="btn btn-sm" onClick={() => setAudioQuery('')} disabled={!audioQuery}>Clear</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredAudios.length} result{filteredAudios.length === 1 ? '' : 's'}
          </div>
          <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: '#0b1220' }}>
            {filteredAudios.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No audio files match.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {filteredAudios.map((asset) => {
                const src = asset.previewUrl || asset.url || asset.src || null;
                const active = components.Sound && components.Sound.assetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      handleComponentChange('Sound', 'assetId', asset.id);
                      setShowAudioPicker(false);
                    }}
                    style={{
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 6,
                      background: active ? 'rgba(59,130,246,0.12)' : '#111827',
                      color: 'var(--text)',
                      padding: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                      {asset.name || asset.id}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.id}
                    </div>
                    {src ? (
                      <audio controls preload="none" style={{ width: '100%' }} onClick={(e) => e.stopPropagation()}>
                        <source src={src} />
                      </audio>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No preview source</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Collider */}
      {components.Collider && (
        <CollapsibleSection title="Collider" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Collider') : undefined}>
          <div className="field">
            <label>Shape</label>
            <select value={components.Collider.shape || 'rect'}
              onChange={(e) => handleComponentChange('Collider', 'shape', e.target.value)}>
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
            </select>
          </div>
          <div className="field">
            <label>Width</label>
            <input type="number" value={components.Collider.width || 32}
              onChange={(e) => handleComponentChange('Collider', 'width', parseInt(e.target.value, 10) || 32)} />
          </div>
          <div className="field">
            <label>Height</label>
            <input type="number" value={components.Collider.height || 32}
              onChange={(e) => handleComponentChange('Collider', 'height', parseInt(e.target.value, 10) || 32)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Collision */}
      {components.Collision && (
        <CollapsibleSection title="Collision" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Collision') : undefined}>
          <div className="field">
            <label>Enabled</label>
            <input type="checkbox" checked={components.Collision.enabled !== false}
              onChange={(e) => handleComponentChange('Collision', 'enabled', e.target.checked)} />
          </div>
          <div className="field">
            <label>Trigger</label>
            <input type="checkbox" checked={!!components.Collision.isTrigger}
              onChange={(e) => handleComponentChange('Collision', 'isTrigger', e.target.checked)} />
          </div>
        </CollapsibleSection>
      )}

      {/* RigidBody */}
      {components.RigidBody && (
        <CollapsibleSection title="RigidBody" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'RigidBody') : undefined}>
          <div className="field">
            <label>Enabled</label>
            <input type="checkbox" checked={!!components.RigidBody.enabled}
              onChange={(e) => handleComponentChange('RigidBody', 'enabled', e.target.checked)} />
          </div>
          <div className="field">
            <label>Weight</label>
            <input type="number" value={components.RigidBody.weight || 0}
              onChange={(e) => handleComponentChange('RigidBody', 'weight', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>Friction</label>
            <input type="number" value={components.RigidBody.friction || 0}
              onChange={(e) => handleComponentChange('RigidBody', 'friction', parseFloat(e.target.value) || 0)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Render */}
      {components.Render && (
        <CollapsibleSection title="Render">
          <div className="field">
            <label>Layer</label>
            <select
              value={components.Render.layerId || 'obj-main'}
              onChange={(e) => handleComponentChange('Render', 'layerId', e.target.value)}
            >
              {(project.layers?.objects || []).map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Visible</label>
            <input type="checkbox" checked={components.Render.visible !== false}
              onChange={(e) => handleComponentChange('Render', 'visible', e.target.checked)} />
          </div>
          <div className="field">
            <label>Z Index</label>
            <input type="number" value={components.Render.zIndex || 0}
              onChange={(e) => handleComponentChange('Render', 'zIndex', parseInt(e.target.value, 10) || 0)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Camera */}
      {components.Camera && (
        <CollapsibleSection title="Camera" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Camera') : undefined}>
          <div className="field">
            <label>Enabled</label>
            <input
              type="checkbox"
              checked={components.Camera.enabled !== false}
              onChange={(e) => handleComponentChange('Camera', 'enabled', e.target.checked)}
            />
          </div>
          <div className="field">
            <label>Speed</label>
            <input
              type="number"
              value={components.Camera.speed || 8}
              onChange={(e) => handleComponentChange('Camera', 'speed', parseFloat(e.target.value) || 8)}
            />
          </div>
          <div className="field">
            <label>Offset X</label>
            <input
              type="number"
              value={components.Camera.offsetX || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'offsetX', n);
              }}
            />
          </div>
          <div className="field">
            <label>Offset Y</label>
            <input
              type="number"
              value={components.Camera.offsetY || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'offsetY', n);
              }}
            />
          </div>
          <div className="field">
            <label>DeadZone W</label>
            <input
              type="number"
              value={components.Camera.deadZoneWidth || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'deadZoneWidth', Math.max(0, n));
              }}
            />
          </div>
          <div className="field">
            <label>DeadZone H</label>
            <input
              type="number"
              value={components.Camera.deadZoneHeight || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'deadZoneHeight', Math.max(0, n));
              }}
            />
          </div>
          <div className="field">
            <label>LookAhead X</label>
            <input
              type="number"
              value={components.Camera.lookAheadX || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'lookAheadX', n);
              }}
            />
          </div>
          <div className="field">
            <label>LookAhead Y</label>
            <input
              type="number"
              value={components.Camera.lookAheadY || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'lookAheadY', n);
              }}
            />
          </div>
          <div className="field">
            <label>Margin</label>
            <input
              type="number"
              value={components.Camera.visibleMargin || 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'visibleMargin', Math.max(0, n));
              }}
            />
          </div>
          <div className="field">
            <label>Max Speed</label>
            <input
              type="number"
              value={components.Camera.maxSpeed || 2000}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                handleComponentChange('Camera', 'maxSpeed', Math.max(1, n));
              }}
            />
          </div>
          <div className="field">
            <label>Follow X</label>
            <input
              type="checkbox"
              checked={components.Camera.followX !== false}
              onChange={(e) => handleComponentChange('Camera', 'followX', e.target.checked)}
            />
            <label>Follow Y</label>
            <input
              type="checkbox"
              checked={components.Camera.followY !== false}
              onChange={(e) => handleComponentChange('Camera', 'followY', e.target.checked)}
            />
          </div>
          <div className="field">
            <label>Clamp</label>
            <input
              type="checkbox"
              checked={components.Camera.clampToWorld !== false}
              onChange={(e) => handleComponentChange('Camera', 'clampToWorld', e.target.checked)}
            />
          </div>
          <div className="field">
            <label>Target</label>
            <select
              value={components.Camera.targetObjectId || ''}
              onChange={(e) => handleComponentChange('Camera', 'targetObjectId', e.target.value || null)}
            >
              <option value="">None</option>
              {sceneObjects.map((o) => (
                <option key={o.id} value={o.id}>{o.name || o.id}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Quick Set</label>
            <button
              className="btn btn-sm"
              onClick={() => {
                const player = sceneObjects.find((o) => o.type === 'player');
                if (!player) return;
                handleComponentChange('Camera', 'targetObjectId', player.id);
              }}
            >
              Grab Player
            </button>
          </div>
        </CollapsibleSection>
      )}

      {/* Sound */}
      {components.Sound && (
        <CollapsibleSection title="Sound" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Sound') : undefined}>
          {components.Sound.assetId && !audioAssetById.has(components.Sound.assetId) && (
            <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 6 }}>
              Missing audio reference: {components.Sound.assetId}
            </div>
          )}
          <div className="field">
            <label>File</label>
            <div style={{ display: 'flex', flex: 1, gap: 6, alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={() => setShowAudioPicker(true)}>Select Audio</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAudioAsset ? selectedAudioAsset.name : (components.Sound.assetId || 'None')}
              </span>
              {components.Sound.assetId && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleComponentChange('Sound', 'assetId', null)}
                  title="Clear Audio"
                >
                  x
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label>Category</label>
            <select
              value={components.Sound.category === 'music' ? 'music' : 'sfx'}
              onChange={(e) => handleComponentChange('Sound', 'category', e.target.value === 'music' ? 'music' : 'sfx')}
            >
              <option value="sfx">SFX</option>
              <option value="music">Music</option>
            </select>
          </div>
          <div className="field">
            <label>Volume</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.Sound.volume) ? components.Sound.volume : 1}
              onChange={(e) => handleComponentChange('Sound', 'volume', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            <label>Max Dist</label>
            <input
              type="number"
              min="0"
              step="10"
              value={Number.isFinite(components.Sound.maxDistance) ? components.Sound.maxDistance : 0}
              onChange={(e) => handleComponentChange('Sound', 'maxDistance', Math.max(0, parseFloat(e.target.value) || 0))}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>0 = global</span>
          </div>
          <div className="field">
            <label>Autoplay</label>
            <input
              type="checkbox"
              checked={!!components.Sound.autoplay}
              onChange={(e) => handleComponentChange('Sound', 'autoplay', e.target.checked)}
            />
          </div>
          <div className="field">
            <label>Loop</label>
            <input
              type="checkbox"
              checked={!!components.Sound.loop}
              onChange={(e) => handleComponentChange('Sound', 'loop', e.target.checked)}
            />
          </div>
        </CollapsibleSection>
      )}

      {components.LightingManager && (
        <CollapsibleSection title="Lighting Manager" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'LightingManager') : undefined}>
          <div className="field">
            <label>Enabled</label>
            <input
              type="checkbox"
              checked={components.LightingManager.enabled === true}
              onChange={(e) => handleComponentChange('LightingManager', 'enabled', e.target.checked)}
            />
          </div>
          <div className="field">
            <label>Ambient</label>
            <input
              type="color"
              value={components.LightingManager.ambientColor || '#0b1220'}
              onChange={(e) => handleComponentChange('LightingManager', 'ambientColor', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Ambient %</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.LightingManager.ambientIntensity) ? components.LightingManager.ambientIntensity : 0.35}
              onChange={(e) => handleComponentChange('LightingManager', 'ambientIntensity', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            <label>Darkness %</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.LightingManager.overlayOpacity) ? components.LightingManager.overlayOpacity : 0.82}
              onChange={(e) => handleComponentChange('LightingManager', 'overlayOpacity', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            <label>Fog</label>
            <input
              type="color"
              value={components.LightingManager.fogColor || '#07111d'}
              onChange={(e) => handleComponentChange('LightingManager', 'fogColor', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Fog %</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.LightingManager.fogDensity) ? components.LightingManager.fogDensity : 0.65}
              onChange={(e) => handleComponentChange('LightingManager', 'fogDensity', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
        </CollapsibleSection>
      )}

      {components.Light && (
        <CollapsibleSection title="Light" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Light') : undefined}>
          <div className="field">
            <label>Enabled</label>
            <input
              type="checkbox"
              checked={components.Light.enabled !== false}
              onChange={(e) => handleComponentChange('Light', 'enabled', e.target.checked)}
            />
          </div>
          <div className="field">
            <label>Color</label>
            <input
              type="color"
              value={components.Light.color || '#ffd27a'}
              onChange={(e) => handleComponentChange('Light', 'color', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Intensity</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.Light.intensity) ? components.Light.intensity : 1}
              onChange={(e) => handleComponentChange('Light', 'intensity', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            <label>Radius</label>
            <input
              type="number"
              min="1"
              step="8"
              value={Number.isFinite(components.Light.radius) ? components.Light.radius : 180}
              onChange={(e) => handleComponentChange('Light', 'radius', Math.max(1, parseFloat(e.target.value) || 1))}
            />
          </div>
          <div className="field">
            <label>Falloff</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.Light.falloff) ? components.Light.falloff : 0.65}
              onChange={(e) => handleComponentChange('Light', 'falloff', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            <label>Offset X</label>
            <input
              type="number"
              step="1"
              value={Number.isFinite(components.Light.offsetX) ? components.Light.offsetX : 0}
              onChange={(e) => handleComponentChange('Light', 'offsetX', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Offset Y</label>
            <input
              type="number"
              step="1"
              value={Number.isFinite(components.Light.offsetY) ? components.Light.offsetY : 0}
              onChange={(e) => handleComponentChange('Light', 'offsetY', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Height</label>
            <input
              type="number"
              min="0"
              step="1"
              value={Number.isFinite(components.Light.height) ? components.Light.height : 18}
              onChange={(e) => handleComponentChange('Light', 'height', Math.max(0, parseFloat(e.target.value) || 0))}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Used by 3D scenes</span>
          </div>
        </CollapsibleSection>
      )}

      {/* Script Bindings (multiple) */}
      <div className="panel-section">
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Scripts</span>
          <button className="btn btn-sm" onClick={handleAddBinding} style={{ fontSize: 10, padding: '1px 6px' }}>+ Add</button>
        </h3>
        {bindings.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '2px 0' }}>No scripts attached</div>
        )}
        {bindings.map((binding, idx) => {
          const script = (project.scripts || []).find(s => s.id === binding.scriptId);
          const props = binding.properties || {};
          const propKeys = Object.keys(props);
          return (
            <div key={idx} style={{
              background: 'var(--bg-dark)', borderRadius: 4, padding: '6px 8px', marginBottom: 6,
              border: binding.active ? '1px solid var(--border)' : '1px solid var(--border)',
              opacity: binding.active ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <input type="checkbox" checked={binding.active}
                  onChange={(e) => handleBindingField(idx, 'active', e.target.checked)}
                  title="Active" style={{ cursor: 'pointer' }} />
                <select value={binding.scriptId || ''} style={{
                  flex: 1, padding: '2px 4px', background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 3, fontSize: 11,
                }}
                  onChange={(e) => handleBindingField(idx, 'scriptId', e.target.value || null)}>
                  <option value="">-- Select Script --</option>
                  {(project.scripts || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button className="btn btn-sm btn-danger" onClick={() => handleRemoveBinding(idx)}
                  style={{ fontSize: 10, padding: '1px 5px' }}>x</button>
              </div>

              {/* Serialized properties */}
              {script && (
                <div style={{ marginTop: 4 }}>
                  {propKeys.map(key => (
                    <div key={key} className="field" style={{ marginBottom: 2 }}>
                      <label style={{ width: 50, fontSize: 10 }}>{key}</label>
                      <input type="text" value={props[key]} style={{ fontSize: 11 }}
                        onChange={(e) => handlePropertyChange(idx, key, e.target.value)} />
                      <button onClick={() => handleRemoveProperty(idx, key)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>x</button>
                    </div>
                  ))}
                  <button className="btn btn-sm" onClick={() => handleAddProperty(idx)}
                    style={{ fontSize: 10, padding: '1px 6px', marginTop: 2 }}>+ Property</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Animator */}
      {components.Animator && (
        <CollapsibleSection title="Animator" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Animator') : undefined}>
          <div className="field">
            <label>Clip</label>
            <select
              value={components.Animator.clipId || ''}
              onChange={(e) => handleComponentChange('Animator', 'clipId', e.target.value || null)}
            >
              <option value="">None</option>
              {(project.animations || []).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </CollapsibleSection>
      )}

      {/* Add Component */}
      {(() => {
        if (filteredComponents.length === 0 && !componentQuery.trim()) return null;
        return (
          <div className="panel-section">
            <button
              className="btn btn-sm"
              style={{ width: '100%' }}
              onClick={() => { setComponentQuery(''); setShowComponentPicker(true); }}
            >
              + Add Component
            </button>
          </div>
        );
      })()}
      <Modal open={showComponentPicker} title="Add Component" onClose={() => setShowComponentPicker(false)} maxWidth={700} minWidth={520}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={componentQuery}
              onChange={(e) => setComponentQuery(e.target.value)}
              placeholder={`Search ${AVAILABLE_COMPONENTS.length} components...`}
              style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <button className="btn btn-sm" onClick={() => setComponentQuery('')} disabled={!componentQuery}>Clear</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredComponents.length} result{filteredComponents.length === 1 ? '' : 's'}
          </div>
          <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: '#0b1220', display: 'grid', gap: 8 }}>
            {filteredComponents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No matching components available.</div>
            )}
            {filteredComponents.map((comp) => (
              <button
                key={comp.id}
                type="button"
                onClick={() => {
                  if (onUpdateComponent) onUpdateComponent(obj.id, comp.id, { ...comp.defaults });
                  setShowComponentPicker(false);
                }}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: '#111827',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{comp.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{comp.id}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
