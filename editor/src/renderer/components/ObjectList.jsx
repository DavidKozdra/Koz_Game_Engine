import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';

const PAGE_SIZE = 24;

function byName(a, b) {
  return String(a.name || a.id).localeCompare(String(b.name || b.id));
}

function getObjectType(obj) {
  const base = String((obj && obj.type) || 'generic').toLowerCase();
  if (base === 'camera' || (obj && obj.components && obj.components.Camera)) return 'camera';
  return base;
}

export default function ObjectList({ project, editorState, onSelectObject, onAddObject, onAddCameraObject, onRemoveObject }) {
  const objects = (project && project.objects) || [];
  const prefabs = (project && project.prefabs) || [];
  const classes = (project && project.defaultClasses) || [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pickerTab, setPickerTab] = useState('custom');
  const [page, setPage] = useState(1);
  const imageAssetById = useMemo(() => new Map(((project && project.assets) || []).map((a) => [a.id, a])), [project]);

  const objectById = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const hierarchyRoots = useMemo(() => {
    const roots = [];
    const childMap = new Map();
    for (const obj of objects) {
      const parentId = obj.parentId && objectById.has(obj.parentId) ? obj.parentId : null;
      if (!parentId) {
        roots.push(obj);
      } else {
        if (!childMap.has(parentId)) childMap.set(parentId, []);
        childMap.get(parentId).push(obj);
      }
    }
    roots.sort(byName);
    for (const list of childMap.values()) list.sort(byName);
    return { roots, childMap };
  }, [objects, objectById]);

  const templates = useMemo(() => {
    const classTemplates = classes.map((cls) => ({
      id: `class:${cls.id}`,
      group: (cls.baseType || 'generic') === 'camera' ? 'camera' : 'custom',
      kind: 'class',
      name: cls.name || cls.baseType || cls.id,
      type: cls.baseType || 'generic',
      payload: { kind: 'class', baseType: cls.baseType || 'generic', name: cls.name || 'Object' },
      preview: null,
    }));
    const prefabTemplates = prefabs.map((prefab) => {
      const obj = prefab.object || null;
      const type = (obj && obj.type) || 'generic';
      const sprite = obj && obj.components && obj.components.Sprite;
      const asset = sprite && sprite.assetId ? imageAssetById.get(sprite.assetId) : null;
      const preview = asset && (asset.previewUrl || asset.url || asset.src) ? (asset.previewUrl || asset.url || asset.src) : null;
      return {
        id: `prefab:${prefab.id}`,
        group: type === 'camera' ? 'camera' : 'prefab',
        kind: 'prefab',
        name: prefab.name || 'Prefab',
        type,
        payload: { kind: 'prefab', prefab },
        preview,
      };
    });
    return [...classTemplates, ...prefabTemplates];
  }, [classes, prefabs, imageAssetById]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (pickerTab === 'custom' && t.group !== 'custom') return false;
      if (pickerTab === 'prefab' && t.group !== 'prefab') return false;
      if (pickerTab === 'camera' && t.group !== 'camera') return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || String(t.type).toLowerCase().includes(q);
    });
  }, [templates, pickerTab, query]);

  const pageCount = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const visibleTemplates = filteredTemplates.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function handleSelectClick(e, id) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSelectObject(id, { toggle: true });
      return;
    }
    onSelectObject(id);
  }

  function renderNode(obj, depth) {
    const selected = ((editorState.selectedObjectIds || []).includes(obj.id) || editorState.selectedObjectId === obj.id);
    const children = hierarchyRoots.childMap.get(obj.id) || [];
    return (
      <React.Fragment key={obj.id}>
        <div
          className={`object-list-item ${selected ? 'selected' : ''}`}
          onClick={(e) => handleSelectClick(e, obj.id)}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <span style={{ fontSize: 12, display: 'inline-flex', gap: 6 }}>
            <span style={{ color: '#94a3b8' }}>{getObjectType(obj) === 'camera' ? '[CAM]' : '[OBJ]'}</span>
            <span>{obj.name || obj.id}</span>
          </span>
          <button
            className="btn btn-sm btn-danger"
            onClick={(e) => { e.stopPropagation(); onRemoveObject(obj.id); }}
            title="Delete"
          >
            x
          </button>
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  }

  return (
    <div className="panel-section" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <h3>Scene Hierarchy</h3>
      <div style={{ marginBottom: 6 }}>
        <button className="btn btn-sm" onClick={() => setPickerOpen(true)}>+ Add Object</button>
        <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={onAddCameraObject}>+ Camera</button>
      </div>
      <div style={{ display: 'grid', gap: 3 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: '#0b1220' }}>
          World Grid
        </div>
        {objects.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 0' }}>No objects yet</div>
        )}
        {hierarchyRoots.roots.map((obj) => renderNode(obj, 0))}
      </div>
      <Modal open={pickerOpen} title="Add Object" onClose={() => setPickerOpen(false)} maxWidth={980} minWidth={700}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { id: 'custom', label: 'Custom' },
              { id: 'prefab', label: 'All Prefabs' },
              { id: 'camera', label: 'Cameras' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`btn btn-sm ${pickerTab === tab.id ? 'active' : ''}`}
                onClick={() => { setPickerTab(tab.id); setPage(1); }}
              >
                {tab.label}
              </button>
            ))}
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder={`Search ${templates.length} templates...`}
              style={{ flex: 1, minWidth: 220, padding: '9px 12px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <button className="btn btn-sm" onClick={() => setQuery('')} disabled={!query}>Clear</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredTemplates.length} result{filteredTemplates.length === 1 ? '' : 's'} • Page {clampedPage}/{pageCount}
          </div>
          <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: '#0b1220' }}>
            {visibleTemplates.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No templates match.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
              {visibleTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => { onAddObject(tpl.payload); setPickerOpen(false); }}
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
                  <div style={{ height: 94, background: '#1f2937', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7, overflow: 'hidden' }}>
                    {tpl.preview ? (
                      <img src={tpl.preview} alt={tpl.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : tpl.type === 'camera' ? (
                      <div style={{ fontSize: 26, color: '#93c5fd' }}>[CAM]</div>
                    ) : (
                      <div style={{ fontSize: 18, color: '#94a3b8' }}>[OBJ]</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {tpl.kind} {tpl.type ? `- ${tpl.type}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1}>Prev</button>
            <button className="btn btn-sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={clampedPage >= pageCount}>Next</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
