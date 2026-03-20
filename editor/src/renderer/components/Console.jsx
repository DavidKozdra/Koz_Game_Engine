import React, { useRef, useEffect, useState, useMemo } from 'react';

const COPY_RESET_MS = 1600;
const AUTO_SCROLL_THRESHOLD = 16;

function isNearBottom(node) {
  if (!node) return true;
  return (node.scrollHeight - node.scrollTop - node.clientHeight) <= AUTO_SCROLL_THRESHOLD;
}

function formatLogLine(log) {
  const suffix = log.count > 1 ? ` (x${log.count})` : '';
  return `${log.time} [${log.type}] ${log.message}${suffix}`;
}

function fallbackCopyText(text) {
  if (typeof document === 'undefined' || !document.body) return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

/**
 * Console panel for script output, errors, and debug logs.
 */
export default function Console({ logs, onClear, onCommand, isRunning, onStop }) {
  const outputRef = useRef(null);
  const commandRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [collapse, setCollapse] = useState(false);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');
  const [stickToBottom, setStickToBottom] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy');

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

  useEffect(() => {
    if (typeof window === 'undefined' || copyLabel === 'Copy') return undefined;
    const timeoutId = window.setTimeout(() => setCopyLabel('Copy'), COPY_RESET_MS);
    return () => window.clearTimeout(timeoutId);
  }, [copyLabel]);

  useEffect(() => {
    const node = outputRef.current;
    if (!node || paused || !stickToBottom || selectedText) return;
    node.scrollTop = node.scrollHeight;
  }, [filteredLogs.length, paused, selectedText, stickToBottom]);

  useEffect(() => {
    const node = outputRef.current;
    if (!node || typeof document === 'undefined' || typeof window === 'undefined') return undefined;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const containsSelection = !!selection
        && !selection.isCollapsed
        && node.contains(selection.anchorNode)
        && node.contains(selection.focusNode);
      setSelectedText(containsSelection ? selection.toString() : '');
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  useEffect(() => {
    const node = commandRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(node.scrollHeight, 140)}px`;
  }, [command]);

  const handleCommandSubmit = (e) => {
    e.preventDefault();
    const nextCommand = command.trim();
    if (nextCommand && onCommand) {
      onCommand(nextCommand);
      setCommand('');
    }
  };

  const handleCommandKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleCommandSubmit(e);
    }
  };

  const handleOutputScroll = () => {
    setStickToBottom(isNearBottom(outputRef.current));
  };

  const handleCopy = async () => {
    const text = selectedText || filteredLogs.map(formatLogLine).join('\n');
    if (!text) {
      setCopyLabel('Empty');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else if (!fallbackCopyText(text)) {
        throw new Error('Clipboard unavailable');
      }
      setCopyLabel('Copied');
    } catch (error) {
      setCopyLabel(fallbackCopyText(text) ? 'Copied' : 'Copy failed');
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
          title={paused ? 'Resume auto-follow' : 'Freeze auto-follow while you inspect output'}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button
          className="btn btn-sm"
          style={{ padding: '2px 6px', fontSize: 10 }}
          onClick={handleCopy}
          disabled={!selectedText && filteredLogs.length === 0}
          title={selectedText ? 'Copy the selected console text' : 'Copy the visible console output'}
        >
          {copyLabel}
        </button>
        {isRunning && onStop && (
          <button className="btn btn-sm btn-danger" style={{ padding: '2px 6px', fontSize: 10 }} onClick={onStop}>
            Stop
          </button>
        )}
        <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: 10 }} onClick={onClear}>Clear</button>
      </div>
      <div
        ref={outputRef}
        onScroll={handleOutputScroll}
        tabIndex={0}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '4px 8px',
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          fontSize: 12,
          lineHeight: '18px',
          cursor: 'text',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          outline: 'none',
        }}
      >
        {filteredLogs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>No output yet. Script logs and errors appear here.</div>
        )}
        {filteredLogs.map((log, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            color: log.type === 'error' ? '#ef4444' : log.type === 'warn' ? '#f59e0b' : log.type === 'info' ? '#3b82f6' : 'var(--text)',
            borderBottom: '1px solid #1e293b',
            padding: '2px 0',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>{log.time}</span>
            <span style={{ color: log.type === 'error' ? '#fca5a5' : 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>[{log.type}]</span>
            <span style={{ flex: 1, minWidth: 0 }}>{log.message}</span>
            {log.count > 1 && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 10 }}>(x{log.count})</span>}
          </div>
        ))}
      </div>
      <form onSubmit={handleCommandSubmit} style={{ display: 'flex', gap: 8, padding: '6px 8px', borderTop: '1px solid var(--border)', flexShrink: 0, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            ref={commandRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleCommandKeyDown}
            rows={2}
            spellCheck={false}
            placeholder="Paste JavaScript here. Press Cmd/Ctrl+Enter to run."
            style={{
              width: '100%',
              minHeight: 44,
              maxHeight: 140,
              resize: 'vertical',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '6px 8px',
              color: 'var(--text)',
              fontSize: 12,
              lineHeight: '18px',
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            }}
          />
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Multi-line paste is supported. Use Cmd/Ctrl+Enter to run.
          </div>
        </div>
        <button type="submit" className="btn btn-sm btn-primary" style={{ padding: '6px 12px', alignSelf: 'stretch' }}>Run</button>
      </form>
    </div>
  );
}
