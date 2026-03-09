import React, { useRef, useEffect, useState, useMemo } from 'react';

/**
 * Console panel for script output, errors, and debug logs.
 */
export default function Console({ logs, onClear, onCommand, isRunning, onStop }) {
  const bottomRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [collapse, setCollapse] = useState(false);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');

  useEffect(() => {
    if (bottomRef.current && !paused) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, paused]);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filter !== 'all') {
      result = result.filter(log => log.type === filter);
    }
    if (collapse) {
      const collapsed = [];
      let lastMsg = null;
      let count = 0;
      for (const log of result) {
        if (log.message === lastMsg) {
          count++;
        } else {
          if (lastMsg !== null) {
            collapsed.push({ ...collapsed[collapsed.length - 1], count });
            collapsed[collapsed.length - 1].message = lastMsg;
          }
          lastMsg = log.message;
          count = 1;
          collapsed.push({ ...log, count: 1 });
        }
      }
      if (lastMsg !== null && collapsed.length > 0) {
        collapsed[collapsed.length - 1].count = count;
      }
      return collapsed;
    }
    return result;
  }, [logs, filter, collapse]);

  const handleCommandSubmit = (e) => {
    e.preventDefault();
    if (command.trim() && onCommand) {
      onCommand(command.trim());
      setCommand('');
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'log', label: 'Log' },
    { value: 'warn', label: 'Warn' },
    { value: 'error', label: 'Error' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Console</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({filter === 'all' ? logs.length : filteredLogs.length})</span>
        <span style={{ flex: 1 }} />
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : ''}`}
            style={{ padding: '2px 6px', fontSize: 10 }}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <button
          className={`btn btn-sm ${collapse ? 'btn-primary' : ''}`}
          style={{ padding: '2px 6px', fontSize: 10 }}
          onClick={() => setCollapse(!collapse)}
          title="Collapse similar"
        >
          ⌄
        </button>
        <button
          className={`btn btn-sm ${paused ? 'btn-primary' : ''}`}
          style={{ padding: '2px 6px', fontSize: 10 }}
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume output" : "Pause output"}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: 10 }} onClick={onClear}>Clear</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px', fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: 12, lineHeight: '18px' }}>
        {filteredLogs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>No output yet. Script logs and errors appear here.</div>
        )}
        {filteredLogs.map((log, i) => (
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
            {log.count > 1 && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 10 }}>(x{log.count})</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleCommandSubmit} style={{ display: 'flex', gap: 4, padding: '4px 8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command..."
          style={{
            flex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 8px',
            color: 'var(--text)',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          }}
        />
        <button type="submit" className="btn btn-sm btn-primary" style={{ padding: '4px 12px' }}>Run</button>
      </form>
    </div>
  );
}
