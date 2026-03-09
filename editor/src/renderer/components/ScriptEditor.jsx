import React, { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';
import Modal from './Modal.jsx';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'ui', label: 'UI Screen' },
  { id: 'typescript', label: 'TypeScript (planned)' },
  { id: 'lua', label: 'Lua (planned)' },
  { id: 'python', label: 'Python (planned)' },
];

const TEMPLATES = {
  javascript: `function onInit(self, engine) {
  // Called once when game starts
}

function onUpdate(self, engine, dt) {
  // Called every frame
  // Use engine.keyIsDown(keyCode) for input
}
`,
  ui: `// UI Screen using KozUIManager
// Registers a screen that shows/hides based on game state

function onInit(self, engine) {
  // Register screen with UIManager (auto-injected as global)
  if (typeof KozUIManager !== 'undefined') {
    KozUIManager.registerScreen('myScreen', {
      // validStates: ['RUNNING', 'PAUSED'], // Show in these states
      create: function() {
        const container = document.createElement('div');
        container.id = 'myScreen';
        container.style.cssText = 'position:absolute;top:20px;right:20px;padding:16px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-family:sans-serif;';
        container.innerHTML = '<h3>My UI</h3><p>Game time: 0s</p><button id="myBtn">Click Me</button>';
        
        // Add click handler
        const btn = container.querySelector('#myBtn');
        if (btn) {
          btn.onclick = function() {
            console.log('Button clicked!');
          };
        }
        
        return container;
      },
      show: function() {
        // Called when screen becomes visible
        console.log('UI Screen shown');
      },
      hide: function() {
        // Called when screen hides
        console.log('UI Screen hidden');
      },
      update: function() {
        // Called every frame while visible
        const container = this.container;
        if (container) {
          const time = Math.floor(engine.elapsed || 0);
          const p = container.querySelector('p');
          if (p) p.textContent = 'Game time: ' + time + 's';
        }
      },
      validStates: ['RUNNING']
    });
  }
}

function onUpdate(self, engine, dt) {
  // Called every frame
  // KozUIManager.updateAll() is called automatically
}
`,
  lua: `-- Lua scripting (planned)
function onInit(self, engine)
  -- Called once when game starts
end

function onUpdate(self, engine, dt)
  -- Called every frame
end
`,
};

export default function ScriptEditor({ project, onUpdateScript, onAddScript, onDeleteScript }) {
  const scripts = project ? project.scripts || [] : [];
  const [selectedId, setSelectedId] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLang, setNewLang] = useState('javascript');
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const skipUpdateRef = useRef(false);
  const nameInputRef = useRef(null);

  const selectedScript = scripts.find(s => s.id === selectedId) || null;

  // Auto-select first script
  useEffect(() => {
    if (!selectedId && scripts.length > 0) setSelectedId(scripts[0].id);
  }, [scripts, selectedId]);

  // Initialize / update CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    if (!selectedScript) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !skipUpdateRef.current) {
        const newSource = update.state.doc.toString();
        onUpdateScript(selectedScript.id, { source: newSource });
      }
    });

    const state = EditorState.create({
      doc: selectedScript.source || '',
      extensions: [
        basicSetup,
        javascript(),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [selectedScript?.id]);

  // Sync content when source changes externally
  useEffect(() => {
    if (!viewRef.current || !selectedScript) return;
    const currentDoc = viewRef.current.state.doc.toString();
    if (currentDoc !== selectedScript.source) {
      skipUpdateRef.current = true;
      viewRef.current.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: selectedScript.source },
      });
      skipUpdateRef.current = false;
    }
  }, [selectedScript?.source]);

  // Focus name input when modal opens
  useEffect(() => {
    if (showNewModal && nameInputRef.current) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showNewModal]);

  const openNewModal = useCallback(() => {
    setNewName('');
    setNewLang('javascript');
    setShowNewModal(true);
  }, []);

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    onAddScript(name, newLang);
    setShowNewModal(false);
    setNewName('');
  }, [newName, newLang, onAddScript]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    if (!confirm(`Delete script "${selectedScript?.name}"?`)) return;
    onDeleteScript(selectedId);
    setSelectedId(null);
  }, [selectedId, selectedScript, onDeleteScript]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Script tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {scripts.map(s => (
          <button
            key={s.id}
            className={`btn btn-sm ${selectedId === s.id ? 'active' : ''}`}
            onClick={() => setSelectedId(s.id)}
            title={s.language ? `${s.name} (${s.language})` : s.name}
          >
            {s.name}
          </button>
        ))}
        <button className="btn btn-sm" onClick={openNewModal} title="New Script">+</button>
        {selectedId && <button className="btn btn-sm btn-danger" onClick={handleDelete} title="Delete Script" style={{ marginLeft: 'auto' }}>Delete</button>}
      </div>

      {/* Editor area */}
      {selectedScript ? (
        <div ref={editorRef} style={{ flex: 1, overflow: 'hidden' }} />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          {scripts.length === 0 ? 'No scripts. Click + to create one.' : 'Select a script to edit.'}
        </div>
      )}

      {/* New Script Modal */}
      <Modal open={showNewModal} title="New Script" onClose={() => setShowNewModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Name</label>
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="e.g. PlayerController"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Language</label>
            <select value={newLang} onChange={(e) => setNewLang(e.target.value)}>
              {LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>{lang.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button className="btn btn-sm" onClick={() => setShowNewModal(false)}>Cancel</button>
            <button className="btn btn-sm" onClick={handleCreate} disabled={!newName.trim()}
              style={newName.trim() ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}}>
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
