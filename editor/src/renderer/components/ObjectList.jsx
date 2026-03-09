import React from 'react';

export default function ObjectList({ project, editorState, onSelectObject, onAddObject, onRemoveObject }) {
  const objects = (project && project.objects) || [];

  return (
    <div className="panel-section" style={{ flex: 1 }}>
      <h3>Scene Hierarchy</h3>
      <div style={{ marginBottom: 6 }}>
        <button className="btn btn-sm" onClick={onAddObject}>+ Add Object</button>
      </div>
      <div>
        {objects.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 0' }}>No objects yet</div>
        )}
        {objects.map(obj => (
          <div
            key={obj.id}
            className={`object-list-item ${editorState.selectedObjectId === obj.id ? 'selected' : ''}`}
            onClick={() => onSelectObject(obj.id)}
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
    </div>
  );
}
