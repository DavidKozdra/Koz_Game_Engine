import React, { useState } from 'react';

export default function Inspector({ project, editorState, onUpdateObject, onUpdateComponent }) {
  const selectedId = editorState.selectedObjectId;
  const obj = selectedId && project ? project.objects.find(o => o.id === selectedId) : null;

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

  const components = obj.components || {};

  function handleNameChange(e) {
    onUpdateObject(obj.id, { name: e.target.value });
  }

  function handleComponentChange(compName, field, value) {
    const comp = { ...(components[compName] || {}) };
    comp[field] = value;
    onUpdateComponent(obj.id, compName, comp);
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
          <span style={{ fontSize: 11 }}>{obj.type}</span>
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
        </div>
      )}

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

      {/* Script Binding */}
      {components.ScriptBinding && (
        <div className="panel-section">
          <h3>Script</h3>
          <div className="field">
            <label>Script</label>
            <select
              value={components.ScriptBinding.scriptId || ''}
              onChange={(e) => handleComponentChange('ScriptBinding', 'scriptId', e.target.value || null)}
            >
              <option value="">None</option>
              {(project.scripts || []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

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
