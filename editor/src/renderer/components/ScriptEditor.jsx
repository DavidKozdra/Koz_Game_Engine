import React, { useRef, useEffect, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';

/**
 * Script editor panel using CodeMirror.
 * Lets users create, select, and edit script assets.
 */
export default function ScriptEditor({ project, onUpdateScript, onAddScript, onDeleteScript }) {
  const scripts = project ? project.scripts || [] : [];
  const [selectedId, setSelectedId] = React.useState(null);
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const skipUpdateRef = useRef(false);

  const selectedScript = scripts.find(s => s.id === selectedId) || null;

  // Auto-select first script
  useEffect(() => {
    if (!selectedId && scripts.length > 0) setSelectedId(scripts[0].id);
  }, [scripts, selectedId]);

  // Initialize / update CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    // Destroy old view
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
  }, [selectedScript?.id]); // Only recreate on script selection change

  // Sync content when source changes externally (not from typing)
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

  const handleAdd = useCallback(() => {
    const name = prompt('Script name:');
    if (!name) return;
    onAddScript(name);
  }, [onAddScript]);

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
          >
            {s.name}
          </button>
        ))}
        <button className="btn btn-sm" onClick={handleAdd} title="New Script">+</button>
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
    </div>
  );
}
