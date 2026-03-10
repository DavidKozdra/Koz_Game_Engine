import React, { useState } from 'react';

/**
 * KozLogo component
 * Props:
 *   - size: number (logo size in px)
 *   - style: object (extra styles)
 *   - png: boolean (deprecated, now auto-detects if PNG loads)
 */
export default function KozLogo({ style = {}, size = 400 }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', ...style }}>
      {!imgError ? (
        <img
          src="/koz_engine_logo.png"
          alt="Koz Engine Logo"
          width={size}
          height={size}
          onError={() => setImgError(true)}
        />
      ) : (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="32" fill="#3b82f6" />
          <text x="32" y="40" textAnchor="middle" fontSize="32" fill="#fff" fontFamily="Trebuchet MS, Inter, sans-serif" fontWeight="bold">K</text>
        </svg>
      )}
      <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 20, marginTop: 8, letterSpacing: 2 }}>KOZ ENGINE</span>
    </div>
  );
}
