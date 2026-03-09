import React from 'react';

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
  const bindings = components.ScriptBindings || [];

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
