import React, { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function Modal({ open, title, onClose, children, maxWidth = 460, minWidth = 340 }) {
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  const resolvedMaxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
  const resolvedMinWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;

  return (
    <div ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
        width: `min(${resolvedMaxWidth}, 92vw)`,
        minWidth: `min(${resolvedMinWidth}, 92vw)`,
        maxWidth: '92vw',
        maxHeight: '90vh',
        padding: 0, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        resize: 'both',
        overflow: 'auto',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          <button onClick={onClose} aria-label="Close dialog" style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}><Icon name="close" size={16} /></button>
        </div>
        <div style={{ padding: '16px', overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
