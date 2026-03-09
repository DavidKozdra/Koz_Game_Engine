import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';

export default function Inspector({ project, editorState, onUpdateObject, onUpdateComponent, onCreatePrefabFromObject }) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imageQuery, setImageQuery] = useState('');
  const selectedId = editorState.selectedObjectId;
  const obj = selectedId && project ? project.objects.find(o => o.id === selectedId) : null;
  const components = obj?.components || {};
  const bindings = components.ScriptBindings || [];
  const imageAssets = (project.assets || []).filter((a) => a && a.kind === 'image' && a.mime === 'image/png');
  const sceneObjects = (project && project.objects) || [];
  const imageAssetById = new Map(imageAssets.map((a) => [a.id, a]));
  const selectedImageAsset = components.Sprite && components.Sprite.assetId ? imageAssetById.get(components.Sprite.assetId) : null;
  const filteredImages = useMemo(() => {
    const q = imageQuery.trim().toLowerCase();
    if (!q) return imageAssets;
    return imageAssets.filter((asset) => {
      const id = String(asset.id || '').toLowerCase();
      const name = String(asset.name || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [imageAssets, imageQuery]);

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
            {sceneObjects.filter((o) => o.id !== obj.id).map((o) => (
              <option key={o.id} value={o.id}>{o.name || o.id}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Prefab</label>
          <button className="btn btn-sm" onClick={() => onCreatePrefabFromObject && onCreatePrefabFromObject(obj.id)}>
            Save As Prefab
          </button>
        </div>
      </div>

      {/* Transform */}
      {components.Transform && (
        <div className="panel-section">
          <h3>Transform</h3>
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
          </div>
        </div>
      )}

      {/* Sprite */}
      {components.Sprite && (
        <div className="panel-section">
          <h3>Sprite</h3>
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
        </div>
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

      {/* Collider */}
      {components.Collider && (
        <div className="panel-section">
          <h3>Collider</h3>
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
        </div>
      )}

      {/* Collision */}
      {components.Collision && (
        <div className="panel-section">
          <h3>Collision</h3>
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
        </div>
      )}

      {/* RigidBody */}
      {components.RigidBody && (
        <div className="panel-section">
          <h3>RigidBody</h3>
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
        </div>
      )}

      {/* Render */}
      {components.Render && (
        <div className="panel-section">
          <h3>Render</h3>
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
        </div>
      )}

      {/* Camera */}
      {components.Camera && (
        <div className="panel-section">
          <h3>Camera</h3>
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
        </div>
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
        <div className="panel-section">
          <h3>Animator</h3>
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
        </div>
      )}
    </div>
  );
}
