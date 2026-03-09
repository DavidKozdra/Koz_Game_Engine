import React, { useEffect, useRef } from 'react';

export default function Modal({ open, title, onClose, children }) {
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
        minWidth: 340, maxWidth: 460, padding: 0, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}>&times;</button>
        </div>
        <div style={{ padding: '16px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
