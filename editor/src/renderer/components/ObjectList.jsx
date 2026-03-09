import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';

export default function ObjectList({ project, editorState, onSelectObject, onAddObject, onAddCameraObject, onRemoveObject }) {
  const objects = (project && project.objects) || [];
  const prefabs = (project && project.prefabs) || [];
  const classes = (project && project.defaultClasses) || [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const imageAssetById = useMemo(() => new Map(((project && project.assets) || []).map((a) => [a.id, a])), [project]);

  const templates = useMemo(() => {
    const classTemplates = classes.map((cls) => ({
      id: `class:${cls.id}`,
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
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q) || String(t.type).toLowerCase().includes(q));
  }, [templates, query]);

  return (
    <div className="panel-section" style={{ flex: 1 }}>
      <h3>Scene Hierarchy</h3>
      <div style={{ marginBottom: 6 }}>
        <button className="btn btn-sm" onClick={() => setPickerOpen(true)}>+ Add Object</button>
        <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={onAddCameraObject}>+ Camera</button>
      </div>
      <div>
        {objects.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 0' }}>No objects yet</div>
        )}
        {objects.map(obj => (
          <div
            key={obj.id}
            className={`object-list-item ${((editorState.selectedObjectIds || []).includes(obj.id) || editorState.selectedObjectId === obj.id) ? 'selected' : ''}`}
            onClick={(e) => onSelectObject(obj.id, e.shiftKey ? { toggle: true } : undefined)}
          >
            <span style={{ fontSize: 12 }}>{obj.name || obj.id}</span>
            <button
              className="btn btn-sm btn-danger"
              onClick={(e) => { e.stopPropagation(); onRemoveObject(obj.id); }}
              title="Delete"
            >
              x
            </button>
          </div>
        ))}
      </div>
      <Modal open={pickerOpen} title="Add Object" onClose={() => setPickerOpen(false)} maxWidth={920} minWidth={620}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${templates.length} templates...`}
              style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <button className="btn btn-sm" onClick={() => setQuery('')} disabled={!query}>Clear</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredTemplates.length} result{filteredTemplates.length === 1 ? '' : 's'}
          </div>
          <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: '#0b1220' }}>
            {filteredTemplates.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No templates match.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
              {filteredTemplates.map((tpl) => (
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
        </div>
      </Modal>
    </div>
  );
}
