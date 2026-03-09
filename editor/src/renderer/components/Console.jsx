import React, { useRef, useEffect } from 'react';

/**
 * Console panel for script output, errors, and debug logs.
 */
export default function Console({ logs, onClear }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Console</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({logs.length})</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={onClear}>Clear</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px', fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: 12, lineHeight: '18px' }}>
        {logs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>No output yet. Script logs and errors appear here.</div>
        )}
        {logs.map((log, i) => (
          <div key={i} style={{
            color: log.type === 'error' ? '#ef4444' : log.type === 'warn' ? '#f59e0b' : log.type === 'info' ? '#3b82f6' : 'var(--text)',
            borderBottom: '1px solid #1e293b',
            padding: '2px 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 8, fontSize: 10 }}>{log.time}</span>
            <span style={{ color: log.type === 'error' ? '#fca5a5' : 'var(--text-muted)', marginRight: 6, fontSize: 10 }}>[{log.type}]</span>
            {log.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
