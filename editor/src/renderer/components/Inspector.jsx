import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import ImageAssetPreview from './ImageAssetPreview.jsx';

const PREFAB_DELETE_KEY = '__kozPrefabDelete';
const LIGHTING_COLOR_PRESET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'noir', label: 'Noir' },
  { value: 'neon', label: 'Neon' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'moonlight', label: 'Moonlight' },
];

const AVAILABLE_COMPONENTS = [
  { id: 'Grid', label: 'Grid', icon: 'grid', color: '#60a5fa', defaults: { cols: 10, rows: 10, cellSize: 24, visible: true, layerId: null } },
  { id: 'Sprite', label: 'Sprite', icon: 'objSprite', color: '#a78bfa', defaults: { assetId: null, color: '#4ade80', width: 32, height: 32, frameAssetIds: [], fps: 8 } },
  { id: 'LightingManager', label: 'Lighting Manager', icon: 'objLightingManager', color: '#f59e0b', defaults: { enabled: false, mode: 'pixel', flicker: false, volumetric: false, fogBoost: 0, dither: false, vignette: 0, colorPreset: 'none', ambientColor: '#0b1220', ambientIntensity: 0.35, overlayOpacity: 0.82, fogColor: '#07111d', fogDensity: 0.65 } },
  { id: 'Light', label: 'Light', icon: 'objLight', color: '#fbbf24', defaults: { enabled: true, color: '#ffd27a', intensity: 1, radius: 180, falloff: 0.65, offsetX: 0, offsetY: 0, height: 18 } },
  { id: 'Sound', label: 'Sound', icon: 'audio', color: '#f472b6', defaults: { assetId: null, category: 'sfx', autoplay: false, loop: false, volume: 1, maxDistance: 0 } },
  { id: 'Collider', label: 'Collider', icon: 'collider', color: '#38bdf8', defaults: { shape: 'rect', width: 32, height: 32 } },
  { id: 'Collision', label: 'Collision', icon: 'collision', color: '#fb7185', defaults: { enabled: true, isTrigger: false } },
  { id: 'RigidBody', label: 'RigidBody', icon: 'rigidBody', color: '#94a3b8', defaults: { enabled: false, weight: 1, friction: 0.4 } },
  { id: 'Animator', label: 'Animator', icon: 'objAnimator', color: '#34d399', defaults: { clipId: null, autoplay: false } },
  { id: 'Camera', label: 'Camera', icon: 'camera', color: '#93c5fd', defaults: { enabled: true, targetObjectId: null, speed: 8, offsetX: 0, offsetY: 0, deadZoneWidth: 180, deadZoneHeight: 120, lookAheadX: 0, lookAheadY: 0, visibleMargin: 40, followX: true, followY: true, clampToWorld: true, maxSpeed: 2000 } },
  { id: 'ParticleEmitter', label: 'Particle Emitter', icon: 'objParticleEmitter', color: '#fb923c', defaults: { enabled: true, count: 24, rate: 0, burst: true, life: 500, speed: 80, spreadAngle: 360, direction: 270, color: '#fb923c', size: 4, sizeEnd: 1, gravity: 0, drag: 0.98, loop: true, interval: 1000, worldSpace: true, image: null, rotation: 0, rotationSpeed: 0 } },
];

function componentIcon(comp, size = 16) {
  return <Icon name={comp.icon || 'objGeneric'} size={size} style={{ color: comp.color || '#94a3b8', flexShrink: 0 }} />;
}

function parseScriptProps(source) {
  if (!source) return [];
  const results = [];
  const lines = String(source).split('\n');
  for (const line of lines) {
    const m = line.match(/\/\/\s*@prop\s+(\w+)\s+(string|number|boolean|color|scene)\s*(.*)/);
    if (m) {
      const name = m[1];
      const type = m[2];
      let defaultValue = m[3] ? m[3].trim() : '';
      if (type === 'number') defaultValue = defaultValue || '0';
      else if (type === 'boolean') defaultValue = defaultValue || 'false';
      else if (type === 'color') defaultValue = defaultValue || '#ffffff';
      else if (type === 'scene') defaultValue = defaultValue || '';
      results.push({ name, type, defaultValue });
    }
  }
  return results;
}

function CollapsibleSection({ title, defaultOpen = true, onRemove, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(!open)}>
        <span>{open ? 'v' : '>'} {title}</span>
        {onRemove && (
          <button className="btn btn-sm btn-danger btn-icon-only" onClick={(e) => { e.stopPropagation(); onRemove(); }} title={`Remove ${title}`}>x</button>
        )}
      </h3>
      {open && children}
    </div>
  );
}

function collectPrefabOverridePaths(value, prefix = '') {
  if (Array.isArray(value)) return prefix ? [prefix] : [];
  if (!value || typeof value !== 'object') return prefix ? [prefix] : [];
  if (value[PREFAB_DELETE_KEY] === true) return prefix ? [prefix] : [];
  const keys = Object.keys(value).filter((key) => key !== PREFAB_DELETE_KEY);
  if (keys.length === 0) return [];
  return keys.flatMap((key) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return collectPrefabOverridePaths(value[key], nextPrefix);
  });
}

function hasPrefabOverridePath(overrides, path) {
  const segments = String(path || '').split('.').filter(Boolean);
  if (segments.length === 0) return false;
  let current = overrides;
  for (let index = 0; index < segments.length; index += 1) {
    if (!current || typeof current !== 'object') return index > 0;
    if (current[PREFAB_DELETE_KEY] === true) return true;
    const segment = segments[index];
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = current[segment];
  }
  return current !== undefined;
}

function formatPrefabOverridePath(path) {
  return String(path || '')
    .replace(/^components\./, '')
    .replace(/\.frameAssetIds$/, '.frames');
}

export default function Inspector({
  project,
  editorState,
  onUpdateObject,
  onUpdateComponent,
  onRemoveComponent,
  onCreatePrefabFromObject,
  onUnlinkPrefab,
  onEditPrefabSource,
  onSelectPrefabVariant,
  onResetPrefabOverrides,
  onResetPrefabOverridePath,
  onSavePrefabVariantFromObject,
}) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showParticleImagePicker, setShowParticleImagePicker] = useState(false);
  const [imageQuery, setImageQuery] = useState('');
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [audioQuery, setAudioQuery] = useState('');
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [componentQuery, setComponentQuery] = useState('');
  const [addingPropertyFor, setAddingPropertyFor] = useState(null);
  const [newPropertyName, setNewPropertyName] = useState('');
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
  const prefabVariants = linkedPrefab && Array.isArray(linkedPrefab.variants) ? linkedPrefab.variants : [];
  const hasPrefabOverrides = !!(obj && obj.prefabOverrides && Object.keys(obj.prefabOverrides).length > 0);
  const isPrefabSourceObject = !!(linkedPrefab && obj && obj.id === linkedPrefab.sourceObjectId);
  const isLinkedPrefabInstance = !!(linkedPrefab && obj && obj.id !== linkedPrefab.sourceObjectId);
  const overridePaths = useMemo(() => collectPrefabOverridePaths(obj && obj.prefabOverrides ? obj.prefabOverrides : {}), [obj]);
  const selectedVariant = useMemo(() => (
    prefabVariants.find((variant) => variant && variant.id === obj?.variantId) || null
  ), [prefabVariants, obj]);
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
    setAddingPropertyFor(bindingIndex);
    setNewPropertyName('');
  }

  function handleConfirmAddProperty() {
    if (addingPropertyFor == null) return;
    const key = newPropertyName.trim();
    if (!key) { setAddingPropertyFor(null); return; }
    handlePropertyChange(addingPropertyFor, key, '');
    setAddingPropertyFor(null);
    setNewPropertyName('');
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

  function renderFieldLabel(text, path, options = {}) {
    const style = options.style || undefined;
    if (!linkedPrefab || !isLinkedPrefabInstance || !path) {
      return <label style={style}>{text}</label>;
    }
    if (options.local === true) {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, ...style }}>
          <span>{text}</span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              lineHeight: 1.4,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: '#cbd5e1',
              border: '1px solid rgba(203,213,225,0.25)',
              borderRadius: 999,
              padding: '0 4px',
              whiteSpace: 'nowrap',
            }}
          >
            Local
          </span>
        </label>
      );
    }
    const overridden = hasPrefabOverridePath(obj.prefabOverrides, path);
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, ...style }}>
        <span>{text}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 9,
            lineHeight: 1.4,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: overridden ? '#fde68a' : '#93c5fd',
            border: `1px solid ${overridden ? 'rgba(253,230,138,0.45)' : 'rgba(147,197,253,0.35)'}`,
            borderRadius: 999,
            padding: '0 4px',
            whiteSpace: 'nowrap',
          }}
        >
          {overridden ? 'Override' : 'Prefab'}
        </span>
        {overridden && onResetPrefabOverridePath && (
          <button
            type="button"
            className="btn btn-sm btn-compact"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onResetPrefabOverridePath(obj.id, path);
            }}
            title={`Reset ${text} to the prefab value`}
          >
            Reset
          </button>
        )}
      </label>
    );
  }

  return (
    <div>
      {/* Prefab status bar — always on top */}
      {linkedPrefab ? (
        <div style={{
          display: 'grid', gap: 8, padding: '6px 8px',
          background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)',
          borderRadius: 6, marginBottom: 6, fontSize: 11,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Prefab:</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedPrefab.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>{isPrefabSourceObject ? 'SOURCE' : (hasPrefabOverrides ? 'OVERRIDDEN' : 'IN SYNC')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto auto', gap: 6, alignItems: 'center' }}>
            <select
              value={obj.variantId || ''}
              onChange={(e) => onSelectPrefabVariant && onSelectPrefabVariant(obj.id, e.target.value || null)}
              style={{ width: '100%' }}
              disabled={isPrefabSourceObject}
            >
              <option value="">Base Prefab</option>
              {prefabVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>{variant.name}</option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-compact"
              onClick={() => onSavePrefabVariantFromObject && onSavePrefabVariantFromObject(obj.id)}
              disabled={isPrefabSourceObject}
              title={isPrefabSourceObject ? 'Prefab source objects already define the base values.' : "Save this object's current prefab differences as a reusable variant"}
            >
              Save Variant
            </button>
            <button
              className="btn btn-sm btn-compact"
              onClick={() => onResetPrefabOverrides && onResetPrefabOverrides(obj.id)}
              disabled={isPrefabSourceObject || !hasPrefabOverrides}
              title="Reset this instance back to the prefab or selected variant"
            >
              Revert
            </button>
            <button
              className="btn btn-sm btn-compact"
              onClick={() => onEditPrefabSource && onEditPrefabSource(linkedPrefab.id)}
              disabled={isPrefabSourceObject}
              title={isPrefabSourceObject ? 'Already editing the prefab source object.' : 'Jump to the source object that drives this prefab'}
            >
              Edit Source
            </button>
            <button
              className="btn btn-sm btn-compact"
              onClick={() => onUnlinkPrefab && onUnlinkPrefab(obj.id)}
              disabled={isPrefabSourceObject}
              title={isPrefabSourceObject ? 'The source object stays linked to its prefab definition.' : 'Unlink this object from its prefab'}
            >
              Unlink
            </button>
          </div>
          {isPrefabSourceObject ? (
            <div style={{ color: 'var(--text-muted)' }}>
              This object is the prefab source. Changes here propagate to every linked instance.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, color: 'var(--text-muted)' }}>
                <span>Revision {obj.prefabRevision || linkedPrefab.revision} / {linkedPrefab.revision}</span>
                <span>Variant {selectedVariant ? selectedVariant.name : 'Base Prefab'}</span>
                <span>Overrides {overridePaths.length}</span>
              </div>
              {overridePaths.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {overridePaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      className="btn btn-sm btn-compact"
                      onClick={() => onResetPrefabOverridePath && onResetPrefabOverridePath(obj.id, path)}
                      title={`Reset ${formatPrefabOverridePath(path)} to the prefab value`}
                    >
                      {formatPrefabOverridePath(path)}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>
                  This instance is inheriting all prefab values directly.
                </div>
              )}
            </div>
          )}
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
          {renderFieldLabel('Name', 'name')}
          <input type="text" value={obj.name || ''} onChange={handleNameChange} />
        </div>
        <div className="field">
          <label>ID</label>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{obj.id}</span>
        </div>
        <div className="field">
          {renderFieldLabel('Type', 'type')}
          <input type="text" value={obj.type || 'generic'} onChange={(e) => onUpdateObject(obj.id, { type: e.target.value })} />
        </div>
        <div className="field">
          {renderFieldLabel('Parent', 'parentId', { local: true })}
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
            {renderFieldLabel('X', 'components.Transform.x', { local: true })}
            <input type="number" value={components.Transform.x || 0}
              onChange={(e) => handleComponentChange('Transform', 'x', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            {renderFieldLabel('Y', 'components.Transform.y', { local: true })}
            <input type="number" value={components.Transform.y || 0}
              onChange={(e) => handleComponentChange('Transform', 'y', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            {renderFieldLabel('Rotation', 'components.Transform.rotation', { local: true })}
            <input type="number" value={components.Transform.rotation || 0}
              onChange={(e) => handleComponentChange('Transform', 'rotation', parseFloat(e.target.value) || 0)} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>deg</span>
          </div>
          <div className="field">
            {renderFieldLabel('Scale X', 'components.Transform.scaleX', { local: true })}
            <input type="number" step="0.1" value={components.Transform.scaleX ?? 1}
              onChange={(e) => handleComponentChange('Transform', 'scaleX', parseFloat(e.target.value) || 1)} />
          </div>
          <div className="field">
            {renderFieldLabel('Scale Y', 'components.Transform.scaleY', { local: true })}
            <input type="number" step="0.1" value={components.Transform.scaleY ?? 1}
              onChange={(e) => handleComponentChange('Transform', 'scaleY', parseFloat(e.target.value) || 1)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Grid */}
      {components.Grid && (
        <CollapsibleSection title="Grid" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Grid') : undefined}>
          <div className="field">
            {renderFieldLabel('Columns', 'components.Grid.cols')}
            <input type="number" value={components.Grid.cols || 10}
              onChange={(e) => handleComponentChange('Grid', 'cols', parseInt(e.target.value, 10) || 10)} />
          </div>
          <div className="field">
            {renderFieldLabel('Rows', 'components.Grid.rows')}
            <input type="number" value={components.Grid.rows || 10}
              onChange={(e) => handleComponentChange('Grid', 'rows', parseInt(e.target.value, 10) || 10)} />
          </div>
          <div className="field">
            {renderFieldLabel('Cell Size', 'components.Grid.cellSize')}
            <input type="number" value={components.Grid.cellSize || 24}
              onChange={(e) => handleComponentChange('Grid', 'cellSize', parseInt(e.target.value, 10) || 24)} />
          </div>
          <div className="field">
            {renderFieldLabel('Visible', 'components.Grid.visible')}
            <input type="checkbox" checked={components.Grid.visible !== false}
              onChange={(e) => handleComponentChange('Grid', 'visible', e.target.checked)} />
          </div>
          <div className="field">
            {renderFieldLabel('Layer', 'components.Grid.layerId')}
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
            {renderFieldLabel('Image', 'components.Sprite.assetId')}
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
            {renderFieldLabel('Color', 'components.Sprite.color')}
            <input type="color" value={components.Sprite.color || '#4ade80'}
              onChange={(e) => handleComponentChange('Sprite', 'color', e.target.value)} />
          </div>
          <div className="field">
            {renderFieldLabel('Width', 'components.Sprite.width')}
            <input type="number" value={components.Sprite.width || 32}
              onChange={(e) => handleComponentChange('Sprite', 'width', parseInt(e.target.value, 10) || 32)} />
          </div>
          <div className="field">
            {renderFieldLabel('Height', 'components.Sprite.height')}
            <input type="number" value={components.Sprite.height || 32}
              onChange={(e) => handleComponentChange('Sprite', 'height', parseInt(e.target.value, 10) || 32)} />
          </div>
          <div className="field">
            {renderFieldLabel('Frames', 'components.Sprite.frameAssetIds')}
            <input
              type="text"
              value={Array.isArray(components.Sprite.frameAssetIds) ? components.Sprite.frameAssetIds.join(',') : ''}
              onChange={(e) => handleComponentChange('Sprite', 'frameAssetIds', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
              placeholder="asset_id_1,asset_id_2"
            />
          </div>
          <div className="field">
            {renderFieldLabel('FPS', 'components.Sprite.fps')}
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
                      <ImageAssetPreview
                        asset={asset}
                        assetById={imageAssetById}
                        alt={asset.name || asset.id}
                        fit="cover"
                        fallback={<span style={{ fontSize: 10, color: 'var(--text-muted)' }}>No Preview</span>}
                      />
                    </div>
                    <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name || asset.id}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={showAudioPicker} title="Select Audio File" onClose={() => setShowAudioPicker(false)} maxWidth={980} minWidth={520} resizable={false}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {filteredAudios.map((asset) => {
                const src = asset.previewUrl || asset.url || asset.src || null;
                const active = components.Sound && components.Sound.assetId === asset.id;
                return (
                  <div
                    key={asset.id}
                    style={{
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 6,
                      background: active ? 'rgba(59,130,246,0.12)' : '#111827',
                      color: 'var(--text)',
                      padding: 8,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }} title={asset.name || asset.id}>
                          {asset.name || asset.id}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.id}>
                          {asset.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-sm${active ? ' active' : ''}`}
                        onClick={() => {
                          handleComponentChange('Sound', 'assetId', asset.id);
                          setShowAudioPicker(false);
                        }}
                      >
                        {active ? 'Selected' : 'Use'}
                      </button>
                    </div>
                    {src ? (
                      <audio controls preload="none" style={{ width: '100%', minWidth: 0, display: 'block' }}>
                        <source src={src} />
                      </audio>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No preview source</div>
                    )}
                  </div>
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
            {renderFieldLabel('Shape', 'components.Collider.shape')}
            <select value={components.Collider.shape || 'rect'}
              onChange={(e) => handleComponentChange('Collider', 'shape', e.target.value)}>
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
            </select>
          </div>
          <div className="field">
            {renderFieldLabel('Width', 'components.Collider.width')}
            <input type="number" value={components.Collider.width || 32}
              onChange={(e) => handleComponentChange('Collider', 'width', parseInt(e.target.value, 10) || 32)} />
          </div>
          <div className="field">
            {renderFieldLabel('Height', 'components.Collider.height')}
            <input type="number" value={components.Collider.height || 32}
              onChange={(e) => handleComponentChange('Collider', 'height', parseInt(e.target.value, 10) || 32)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Collision */}
      {components.Collision && (
        <CollapsibleSection title="Collision" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Collision') : undefined}>
          <div className="field">
            {renderFieldLabel('Enabled', 'components.Collision.enabled')}
            <input type="checkbox" checked={components.Collision.enabled !== false}
              onChange={(e) => handleComponentChange('Collision', 'enabled', e.target.checked)} />
          </div>
          <div className="field">
            {renderFieldLabel('Trigger', 'components.Collision.isTrigger')}
            <input type="checkbox" checked={!!components.Collision.isTrigger}
              onChange={(e) => handleComponentChange('Collision', 'isTrigger', e.target.checked)} />
          </div>
        </CollapsibleSection>
      )}

      {/* RigidBody */}
      {components.RigidBody && (
        <CollapsibleSection title="RigidBody" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'RigidBody') : undefined}>
          <div className="field">
            {renderFieldLabel('Enabled', 'components.RigidBody.enabled')}
            <input type="checkbox" checked={!!components.RigidBody.enabled}
              onChange={(e) => handleComponentChange('RigidBody', 'enabled', e.target.checked)} />
          </div>
          <div className="field">
            {renderFieldLabel('Weight', 'components.RigidBody.weight')}
            <input type="number" value={components.RigidBody.weight || 0}
              onChange={(e) => handleComponentChange('RigidBody', 'weight', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            {renderFieldLabel('Friction', 'components.RigidBody.friction')}
            <input type="number" value={components.RigidBody.friction || 0}
              onChange={(e) => handleComponentChange('RigidBody', 'friction', parseFloat(e.target.value) || 0)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Render */}
      {components.Render && (
        <CollapsibleSection title="Render">
          <div className="field">
            {renderFieldLabel('Layer', 'components.Render.layerId')}
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
            {renderFieldLabel('Visible', 'components.Render.visible')}
            <input type="checkbox" checked={components.Render.visible !== false}
              onChange={(e) => handleComponentChange('Render', 'visible', e.target.checked)} />
          </div>
          <div className="field">
            {renderFieldLabel('Z Index', 'components.Render.zIndex')}
            <input type="number" value={components.Render.zIndex || 0}
              onChange={(e) => handleComponentChange('Render', 'zIndex', parseInt(e.target.value, 10) || 0)} />
          </div>
        </CollapsibleSection>
      )}

      {/* Camera */}
      {components.Camera && (
        <CollapsibleSection title="Camera" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Camera') : undefined}>
          <div className="field">
            {renderFieldLabel('Enabled', 'components.Camera.enabled')}
            <input
              type="checkbox"
              checked={components.Camera.enabled !== false}
              onChange={(e) => handleComponentChange('Camera', 'enabled', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Speed', 'components.Camera.speed')}
            <input
              type="number"
              value={components.Camera.speed || 8}
              onChange={(e) => handleComponentChange('Camera', 'speed', parseFloat(e.target.value) || 8)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Offset X', 'components.Camera.offsetX')}
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
            {renderFieldLabel('Offset Y', 'components.Camera.offsetY')}
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
            {renderFieldLabel('DeadZone W', 'components.Camera.deadZoneWidth')}
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
            {renderFieldLabel('DeadZone H', 'components.Camera.deadZoneHeight')}
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
            {renderFieldLabel('LookAhead X', 'components.Camera.lookAheadX')}
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
            {renderFieldLabel('LookAhead Y', 'components.Camera.lookAheadY')}
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
            {renderFieldLabel('Margin', 'components.Camera.visibleMargin')}
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
            {renderFieldLabel('Max Speed', 'components.Camera.maxSpeed')}
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
            {renderFieldLabel('Follow X', 'components.Camera.followX')}
            <input
              type="checkbox"
              checked={components.Camera.followX !== false}
              onChange={(e) => handleComponentChange('Camera', 'followX', e.target.checked)}
            />
            {renderFieldLabel('Follow Y', 'components.Camera.followY')}
            <input
              type="checkbox"
              checked={components.Camera.followY !== false}
              onChange={(e) => handleComponentChange('Camera', 'followY', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Clamp', 'components.Camera.clampToWorld')}
            <input
              type="checkbox"
              checked={components.Camera.clampToWorld !== false}
              onChange={(e) => handleComponentChange('Camera', 'clampToWorld', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Target', 'components.Camera.targetObjectId')}
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
            {renderFieldLabel('Quick Set', 'components.Camera.targetObjectId')}
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
            {renderFieldLabel('File', 'components.Sound.assetId')}
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
            {renderFieldLabel('Category', 'components.Sound.category')}
            <select
              value={components.Sound.category === 'music' ? 'music' : 'sfx'}
              onChange={(e) => handleComponentChange('Sound', 'category', e.target.value === 'music' ? 'music' : 'sfx')}
            >
              <option value="sfx">SFX</option>
              <option value="music">Music</option>
            </select>
          </div>
          <div className="field">
            {renderFieldLabel('Volume', 'components.Sound.volume')}
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
            {renderFieldLabel('Max Dist', 'components.Sound.maxDistance')}
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
            {renderFieldLabel('Autoplay', 'components.Sound.autoplay')}
            <input
              type="checkbox"
              checked={!!components.Sound.autoplay}
              onChange={(e) => handleComponentChange('Sound', 'autoplay', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Loop', 'components.Sound.loop')}
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
            {renderFieldLabel('Enabled', 'components.LightingManager.enabled')}
            <input
              type="checkbox"
              checked={components.LightingManager.enabled === true}
              onChange={(e) => handleComponentChange('LightingManager', 'enabled', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Mode', 'components.LightingManager.mode')}
            <select
              value={components.LightingManager.mode || 'pixel'}
              onChange={(e) => handleComponentChange('LightingManager', 'mode', e.target.value)}
            >
              <option value="pixel">Pixel</option>
              <option value="soft">Soft</option>
            </select>
          </div>
          <div className="field">
            {renderFieldLabel('Preset', 'components.LightingManager.colorPreset')}
            <select
              value={components.LightingManager.colorPreset || 'none'}
              onChange={(e) => handleComponentChange('LightingManager', 'colorPreset', e.target.value)}
            >
              {LIGHTING_COLOR_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            {renderFieldLabel('Flicker', 'components.LightingManager.flicker')}
            <input
              type="checkbox"
              checked={components.LightingManager.flicker === true}
              onChange={(e) => handleComponentChange('LightingManager', 'flicker', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Volumetric', 'components.LightingManager.volumetric')}
            <input
              type="checkbox"
              checked={components.LightingManager.volumetric === true}
              onChange={(e) => handleComponentChange('LightingManager', 'volumetric', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Fog Boost', 'components.LightingManager.fogBoost')}
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.LightingManager.fogBoost) ? components.LightingManager.fogBoost : 0}
              onChange={(e) => handleComponentChange('LightingManager', 'fogBoost', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Dither', 'components.LightingManager.dither')}
            <input
              type="checkbox"
              checked={components.LightingManager.dither === true}
              onChange={(e) => handleComponentChange('LightingManager', 'dither', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Vignette', 'components.LightingManager.vignette')}
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={Number.isFinite(components.LightingManager.vignette) ? components.LightingManager.vignette : 0}
              onChange={(e) => handleComponentChange('LightingManager', 'vignette', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Ambient', 'components.LightingManager.ambientColor')}
            <input
              type="color"
              value={components.LightingManager.ambientColor || '#0b1220'}
              onChange={(e) => handleComponentChange('LightingManager', 'ambientColor', e.target.value)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Ambient %', 'components.LightingManager.ambientIntensity')}
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
            {renderFieldLabel('Darkness %', 'components.LightingManager.overlayOpacity')}
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
            {renderFieldLabel('Fog', 'components.LightingManager.fogColor')}
            <input
              type="color"
              value={components.LightingManager.fogColor || '#07111d'}
              onChange={(e) => handleComponentChange('LightingManager', 'fogColor', e.target.value)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Fog %', 'components.LightingManager.fogDensity')}
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
            {renderFieldLabel('Enabled', 'components.Light.enabled')}
            <input
              type="checkbox"
              checked={components.Light.enabled !== false}
              onChange={(e) => handleComponentChange('Light', 'enabled', e.target.checked)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Color', 'components.Light.color')}
            <input
              type="color"
              value={components.Light.color || '#ffd27a'}
              onChange={(e) => handleComponentChange('Light', 'color', e.target.value)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Intensity', 'components.Light.intensity')}
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
            {renderFieldLabel('Radius', 'components.Light.radius')}
            <input
              type="number"
              min="1"
              step="8"
              value={Number.isFinite(components.Light.radius) ? components.Light.radius : 180}
              onChange={(e) => handleComponentChange('Light', 'radius', Math.max(1, parseFloat(e.target.value) || 1))}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Falloff', 'components.Light.falloff')}
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
            {renderFieldLabel('Offset X', 'components.Light.offsetX')}
            <input
              type="number"
              step="1"
              value={Number.isFinite(components.Light.offsetX) ? components.Light.offsetX : 0}
              onChange={(e) => handleComponentChange('Light', 'offsetX', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Offset Y', 'components.Light.offsetY')}
            <input
              type="number"
              step="1"
              value={Number.isFinite(components.Light.offsetY) ? components.Light.offsetY : 0}
              onChange={(e) => handleComponentChange('Light', 'offsetY', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            {renderFieldLabel('Height', 'components.Light.height')}
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

      {components.ParticleEmitter && (
        <CollapsibleSection title="Particle Emitter" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'ParticleEmitter') : undefined}>
          <div className="field">
            {renderFieldLabel('Enabled', 'components.ParticleEmitter.enabled')}
            <input type="checkbox" checked={components.ParticleEmitter.enabled !== false} onChange={(e) => handleComponentChange('ParticleEmitter', 'enabled', e.target.checked)} />
          </div>
          <div className="field">
            {renderFieldLabel('Count', 'components.ParticleEmitter.count')}
            <input type="number" min="1" max="500" step="1" value={Number.isFinite(components.ParticleEmitter.count) ? components.ParticleEmitter.count : 24} onChange={(e) => handleComponentChange('ParticleEmitter', 'count', Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))} />
          </div>
          <div className="field">
            {renderFieldLabel('Life (ms)', 'components.ParticleEmitter.life')}
            <input type="number" min="50" step="50" value={Number.isFinite(components.ParticleEmitter.life) ? components.ParticleEmitter.life : 500} onChange={(e) => handleComponentChange('ParticleEmitter', 'life', Math.max(50, parseFloat(e.target.value) || 50))} />
          </div>
          <div className="field">
            {renderFieldLabel('Speed', 'components.ParticleEmitter.speed')}
            <input type="number" min="0" step="10" value={Number.isFinite(components.ParticleEmitter.speed) ? components.ParticleEmitter.speed : 80} onChange={(e) => handleComponentChange('ParticleEmitter', 'speed', Math.max(0, parseFloat(e.target.value) || 0))} />
          </div>
          <div className="field">
            {renderFieldLabel('Spread Angle', 'components.ParticleEmitter.spreadAngle')}
            <input type="number" min="0" max="360" step="5" value={Number.isFinite(components.ParticleEmitter.spreadAngle) ? components.ParticleEmitter.spreadAngle : 360} onChange={(e) => handleComponentChange('ParticleEmitter', 'spreadAngle', Math.max(0, Math.min(360, parseFloat(e.target.value) || 0)))} />
          </div>
          <div className="field">
            {renderFieldLabel('Direction', 'components.ParticleEmitter.direction')}
            <input type="number" min="0" max="360" step="5" value={Number.isFinite(components.ParticleEmitter.direction) ? components.ParticleEmitter.direction : 270} onChange={(e) => handleComponentChange('ParticleEmitter', 'direction', Math.max(0, Math.min(360, parseFloat(e.target.value) || 0)))} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>0=right, 90=down, 270=up</span>
          </div>
          <div className="field">
            {renderFieldLabel('Color', 'components.ParticleEmitter.color')}
            <input type="color" value={components.ParticleEmitter.color || '#fb923c'} onChange={(e) => handleComponentChange('ParticleEmitter', 'color', e.target.value)} />
          </div>
          <div className="field">
            {renderFieldLabel('Size', 'components.ParticleEmitter.size')}
            <input type="number" min="1" max="64" step="1" value={Number.isFinite(components.ParticleEmitter.size) ? components.ParticleEmitter.size : 4} onChange={(e) => handleComponentChange('ParticleEmitter', 'size', Math.max(1, parseFloat(e.target.value) || 1))} />
          </div>
          <div className="field">
            {renderFieldLabel('Size End', 'components.ParticleEmitter.sizeEnd')}
            <input type="number" min="0" max="64" step="0.5" value={Number.isFinite(components.ParticleEmitter.sizeEnd) ? components.ParticleEmitter.sizeEnd : 1} onChange={(e) => handleComponentChange('ParticleEmitter', 'sizeEnd', Math.max(0, parseFloat(e.target.value) || 0))} />
          </div>
          <div className="field">
            {renderFieldLabel('Gravity', 'components.ParticleEmitter.gravity')}
            <input type="number" step="10" value={Number.isFinite(components.ParticleEmitter.gravity) ? components.ParticleEmitter.gravity : 0} onChange={(e) => handleComponentChange('ParticleEmitter', 'gravity', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            {renderFieldLabel('Drag', 'components.ParticleEmitter.drag')}
            <input type="number" min="0" max="1" step="0.01" value={Number.isFinite(components.ParticleEmitter.drag) ? components.ParticleEmitter.drag : 0.98} onChange={(e) => handleComponentChange('ParticleEmitter', 'drag', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))} />
          </div>
          <div className="field">
            {renderFieldLabel('Burst', 'components.ParticleEmitter.burst')}
            <input type="checkbox" checked={!!components.ParticleEmitter.burst} onChange={(e) => handleComponentChange('ParticleEmitter', 'burst', e.target.checked)} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Emit all at once</span>
          </div>
          <div className="field">
            {renderFieldLabel('Loop', 'components.ParticleEmitter.loop')}
            <input type="checkbox" checked={components.ParticleEmitter.loop !== false} onChange={(e) => handleComponentChange('ParticleEmitter', 'loop', e.target.checked)} />
          </div>
          {components.ParticleEmitter.loop && (
            <div className="field">
              {renderFieldLabel('Interval (ms)', 'components.ParticleEmitter.interval')}
              <input type="number" min="100" step="100" value={Number.isFinite(components.ParticleEmitter.interval) ? components.ParticleEmitter.interval : 1000} onChange={(e) => handleComponentChange('ParticleEmitter', 'interval', Math.max(100, parseFloat(e.target.value) || 100))} />
            </div>
          )}
          <div className="field">
            {renderFieldLabel('World Space', 'components.ParticleEmitter.worldSpace')}
            <input type="checkbox" checked={components.ParticleEmitter.worldSpace !== false} onChange={(e) => handleComponentChange('ParticleEmitter', 'worldSpace', e.target.checked)} />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0', paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sprite Particle</div>
          </div>
          <div className="field">
            {renderFieldLabel('Image', 'components.ParticleEmitter.image')}
            <div style={{ display: 'flex', flex: 1, gap: 6, alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={() => setShowParticleImagePicker(true)}>Select Image</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {components.ParticleEmitter.image ? (imageAssetById.get(components.ParticleEmitter.image) || {}).name || components.ParticleEmitter.image : 'None (circle)'}
              </span>
              {components.ParticleEmitter.image && (
                <button className="btn btn-sm btn-danger" onClick={() => handleComponentChange('ParticleEmitter', 'image', null)} title="Clear Image">x</button>
              )}
            </div>
          </div>
          {components.ParticleEmitter.image && (
            <>
              <div className="field">
                {renderFieldLabel('Rotation', 'components.ParticleEmitter.rotation')}
                <input type="number" step="5" value={Number.isFinite(components.ParticleEmitter.rotation) ? components.ParticleEmitter.rotation : 0} onChange={(e) => handleComponentChange('ParticleEmitter', 'rotation', parseFloat(e.target.value) || 0)} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>degrees</span>
              </div>
              <div className="field">
                {renderFieldLabel('Spin Speed', 'components.ParticleEmitter.rotationSpeed')}
                <input type="number" step="10" value={Number.isFinite(components.ParticleEmitter.rotationSpeed) ? components.ParticleEmitter.rotationSpeed : 0} onChange={(e) => handleComponentChange('ParticleEmitter', 'rotationSpeed', parseFloat(e.target.value) || 0)} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>deg/sec</span>
              </div>
            </>
          )}
        </CollapsibleSection>
      )}
      <Modal open={showParticleImagePicker} title="Select Particle Image" onClose={() => setShowParticleImagePicker(false)} maxWidth={920} minWidth={620}>
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
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No images found.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {filteredImages.map((asset) => {
                const active = components.ParticleEmitter && components.ParticleEmitter.image === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      handleComponentChange('ParticleEmitter', 'image', asset.id);
                      setShowParticleImagePicker(false);
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
                      <ImageAssetPreview
                        asset={asset}
                        assetById={imageAssetById}
                        alt={asset.name || asset.id}
                        fit="contain"
                        fallback={<span style={{ fontSize: 10, color: 'var(--text-muted)' }}>No Preview</span>}
                        imageStyle={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {asset.name || asset.id}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Script Bindings (multiple) */}
      <div className="panel-section">
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Scripts</span>
          <button className="btn btn-sm btn-compact" onClick={handleAddBinding}>+ Add</button>
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
                <button className="btn btn-sm btn-danger btn-icon-only" onClick={() => handleRemoveBinding(idx)}>x</button>
              </div>

              {/* Serialized properties */}
              {script && (() => {
                const declared = parseScriptProps(script.source);
                const declaredNames = new Set(declared.map(d => d.name));
                // Auto-sync: ensure declared props exist in binding
                declared.forEach(d => {
                  if (!(d.name in props)) {
                    props[d.name] = d.defaultValue;
                  }
                });
                const extraKeys = propKeys.filter(k => !declaredNames.has(k));
                return (
                  <div style={{ marginTop: 4 }}>
                    {declared.map(d => (
                      <div key={d.name} className="field" style={{ marginBottom: 2 }}>
                        <label style={{ width: 60, fontSize: 10 }}>{d.name}</label>
                        {d.type === 'boolean' ? (
                          <input type="checkbox" checked={props[d.name] === true || props[d.name] === 'true'}
                            onChange={(e) => handlePropertyChange(idx, d.name, e.target.checked)}
                            style={{ cursor: 'pointer' }} />
                        ) : d.type === 'scene' ? (
                          <select
                            value={props[d.name] ?? ''}
                            style={{ fontSize: 11 }}
                            onChange={(e) => handlePropertyChange(idx, d.name, e.target.value)}
                          >
                            <option value="">-- Select Scene --</option>
                            {(project.scenes || []).map((scene) => (
                              <option key={scene.id} value={scene.id}>{scene.name || scene.id}</option>
                            ))}
                          </select>
                        ) : d.type === 'color' ? (
                          <input type="color" value={props[d.name] || '#ffffff'} style={{ width: 36, height: 20, padding: 0, border: 'none', cursor: 'pointer' }}
                            onChange={(e) => handlePropertyChange(idx, d.name, e.target.value)} />
                        ) : d.type === 'number' ? (
                          <input type="number" value={props[d.name] ?? ''} style={{ fontSize: 11, width: 60 }}
                            onChange={(e) => handlePropertyChange(idx, d.name, e.target.value)} />
                        ) : (
                          <input type="text" value={props[d.name] ?? ''} style={{ fontSize: 11 }}
                            onChange={(e) => handlePropertyChange(idx, d.name, e.target.value)} />
                        )}
                      </div>
                    ))}
                    {extraKeys.map(key => (
                      <div key={key} className="field" style={{ marginBottom: 2 }}>
                        <label style={{ width: 60, fontSize: 10 }}>{key}</label>
                        <input type="text" value={props[key]} style={{ fontSize: 11 }}
                          onChange={(e) => handlePropertyChange(idx, key, e.target.value)} />
                        <button onClick={() => handleRemoveProperty(idx, key)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>x</button>
                      </div>
                    ))}
                    {addingPropertyFor === idx ? (
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <input
                          autoFocus
                          value={newPropertyName}
                          onChange={(e) => setNewPropertyName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmAddProperty(); if (e.key === 'Escape') setAddingPropertyFor(null); }}
                          onBlur={handleConfirmAddProperty}
                          placeholder="Property name"
                          style={{ fontSize: 11, padding: '1px 4px', flex: 1, minWidth: 0 }}
                        />
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-compact" onClick={() => handleAddProperty(idx)}
                        style={{ marginTop: 2 }}>+ Property</button>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Animator */}
      {components.Animator && (
        <CollapsibleSection title="Animator" onRemove={onRemoveComponent ? () => onRemoveComponent(obj.id, 'Animator') : undefined}>
          <div className="field">
            {renderFieldLabel('Clip', 'components.Animator.clipId')}
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
              placeholder={`Search ${filteredComponents.length} available component${filteredComponents.length === 1 ? '' : 's'}...`}
              style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <button className="btn btn-sm" onClick={() => setComponentQuery('')} disabled={!componentQuery}>Clear</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {componentQuery.trim() ? `${filteredComponents.length} result${filteredComponents.length === 1 ? '' : 's'}` : `${filteredComponents.length} available`}
          </div>
          <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: '#0b1220' }}>
            {filteredComponents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No matching components available.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
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
                    padding: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ height: 76, background: '#1f2937', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
                    {componentIcon(comp, 34)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {componentIcon(comp, 14)}
                    <span>{comp.label}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{comp.id}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
