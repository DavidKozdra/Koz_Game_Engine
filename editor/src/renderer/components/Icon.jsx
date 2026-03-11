import React from 'react';

function glyph(name) {
  switch (name) {
    case 'new':
      return <path d="M8 2v12M2 8h12" />;
    case 'save':
      return <><path d="M3 2h8l2 2v10H3z" /><path d="M5 2v4h5V2" /><path d="M5 10h6" /></>;
    case 'saveAs':
      return <><path d="M3 2h8l2 2v10H3z" /><path d="M5 2v4h5V2" /><path d="M8 9v4M6 11h4" /></>;
    case 'load':
      return <><path d="M8 2v8" /><path d="m5 7 3 3 3-3" /><path d="M3 12h10" /></>;
    case 'export':
      return <><path d="M8 13V5" /><path d="m11 8-3-3-3 3" /><path d="M3 13h10" /></>;
    case 'brush':
      return <><path d="M10 2 4 8" /><path d="M3 9c1.5 0 2 1 2 2 0 1-1 2-3 2 1 0 2-1 2-2" /><path d="M11 1l2 2-1 1-2-2z" /></>;
    case 'fill':
      return <><path d="m4 6 4-4 4 4-4 4z" /><path d="M3 12h10" /></>;
    case 'erase':
      return <path d="m4 10 4-6 4 6-2 2H6z" />;
    case 'select':
      return <><path d="m3 2 8 5-4 1-1 4z" /><path d="M11 11l2 2" /></>;
    case 'world':
      return <><circle cx="8" cy="8" r="5" /><path d="M3 8h10M8 3a8 8 0 0 0 0 10M8 3a8 8 0 0 1 0 10" /></>;
    case 'place':
      return <><rect x="3" y="3" width="4" height="4" /><path d="M10 3v4M8 5h4" /></>;
    case 'move':
      return <><path d="M8 2v12M2 8h12" /><path d="m8 2 1.5 1.5M8 2 6.5 3.5M8 14l1.5-1.5M8 14 6.5 12.5M2 8l1.5-1.5M2 8l1.5 1.5M14 8l-1.5-1.5M14 8l-1.5 1.5" /></>;
    case 'rotate':
      return <><path d="M12 7a4 4 0 1 0 0 2" /><path d="m12 4 2 2-2 2" /></>;
    case 'scale':
      return <><rect x="3" y="3" width="4" height="4" /><rect x="9" y="9" width="4" height="4" /><path d="M7 7h2v2" /></>;
    case 'alignLeft':
      return <><path d="M3 3v10" /><path d="M5 5h7M5 8h5M5 11h6" /></>;
    case 'alignCenterH':
      return <><path d="M8 3v10" /><path d="M4 5h8M5 8h6M4 11h8" /></>;
    case 'alignRight':
      return <><path d="M13 3v10" /><path d="M4 5h7M6 8h5M5 11h6" /></>;
    case 'alignTop':
      return <><path d="M3 3h10" /><path d="M5 5v7M8 5v5M11 5v6" /></>;
    case 'alignCenterV':
      return <><path d="M3 8h10" /><path d="M5 4v8M8 5v6M11 4v8" /></>;
    case 'alignBottom':
      return <><path d="M3 13h10" /><path d="M5 4v7M8 6v5M11 5v6" /></>;
    case 'snap':
      return <><path d="M3 3h4v4H3zM9 9h4v4H9z" /><path d="M7 7h2v2" /></>;
    case 'undo':
      return <><path d="M6 5 3 8l3 3" /><path d="M3 8h5a4 4 0 1 1 0 8" /></>;
    case 'redo':
      return <><path d="m10 5 3 3-3 3" /><path d="M13 8H8a4 4 0 1 0 0 8" /></>;
    case 'play':
      return <path d="m5 3 7 5-7 5z" />;
    case 'stop':
      return <rect x="4" y="4" width="8" height="8" />;
    case 'grid':
      return <><path d="M3 3h10v10H3z" /><path d="M3 7h10M3 11h10M7 3v10M11 3v10" /></>;
    case 'reset':
      return <><path d="M4 6V3h3" /><path d="M4 3a5 5 0 1 1-1 7" /></>;
    case 'apply':
      return <path d="m3 8 3 3 7-7" />;
    case 'add':
      return <path d="M8 3v10M3 8h10" />;
    case 'track':
      return <><path d="M3 5h10M3 8h10M3 11h6" /><circle cx="11" cy="11" r="1" /></>;
    case 'key':
      return <><circle cx="5" cy="8" r="2" /><path d="M7 8h6M10 8v2M12 8v1" /></>;
    case 'delete':
      return <><path d="M3 4h10" /><path d="M5 4V3h6v1" /><path d="M5 6v6M8 6v6M11 6v6" /></>;
    case 'rewind':
      return <><path d="M11 4 6 8l5 4z" /><path d="M6 4 1 8l5 4z" /></>;
    case 'loop':
      return <><path d="M3 6a4 4 0 0 1 7-2" /><path d="m10 2 1 2-2 1" /><path d="M13 10a4 4 0 0 1-7 2" /><path d="m6 14-1-2 2-1" /></>;
    case 'duplicate':
      return <><rect x="5" y="5" width="7" height="7" /><rect x="3" y="3" width="7" height="7" /></>;
    case 'camera':
      return <><rect x="3" y="5" width="10" height="7" rx="1" /><path d="M6 5 7 3h2l1 2" /><circle cx="8" cy="8.5" r="2" /></>;
    case 'fullscreen':
      return <><path d="M3 6V3h3" /><path d="M10 3h3v3" /><path d="M13 10v3h-3" /><path d="M6 13H3v-3" /></>;
    case 'fullscreenExit':
      return <><path d="M6 3H3v3" /><path d="M10 3h3v3" /><path d="M13 10v3h-3" /><path d="M6 13H3v-3" /><path d="M6 6 3 3" /><path d="m10 6 3-3" /><path d="m10 10 3 3" /><path d="m6 10-3 3" /></>;
    case 'chevronDown':
      return <path d="m3 6 5 5 5-5" />;
    case 'chevronRight':
      return <path d="m6 3 5 5-5 5" />;
    case 'folder':
      return <path d="M2 5h4l1 1h7v6H2z" />;
    case 'image':
      return <><rect x="3" y="3" width="10" height="10" /><circle cx="6" cy="6" r="1" /><path d="m4 11 3-3 2 2 2-2 2 3" /></>;
    case 'audio':
      return <><path d="M6 6v5" /><path d="M9 5v6" /><path d="M12 4v7" /><path d="M3 8h2M13 8h1" /></>;
    case 'collider':
      return <><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M5 5h6v6H5z" /></>;
    case 'collision':
      return <><rect x="2.5" y="5.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="5.5" width="4.5" height="4.5" rx="1" /><path d="m8 4 .8 1.7 1.7.8-1.7.8L8 9l-.8-1.7-1.7-.8 1.7-.8z" /></>;
    case 'rigidBody':
      return <><path d="M6 5a2 2 0 1 1 4 0" /><path d="M4 6h8l1 6H3z" /><path d="M6 9h4" /></>;
    case 'import':
      return <><path d="M8 3v8" /><path d="m5 6 3-3 3 3" /><path d="M3 12h10" /></>;
    case 'copy':
      return <><rect x="5" y="5" width="7" height="7" /><path d="M4 10H3V3h7v1" /></>;
    case 'arrowUp':
      return <path d="m8 3-4 5h3v5h2V8h3z" />;
    case 'arrowDown':
      return <path d="m8 13 4-5H9V3H7v5H4z" />;
    case 'close':
      return <path d="m4 4 8 8M12 4 4 12" />;
    case 'objGeneric':
      return <><path d="M8 2 3 5v6l5 3 5-3V5z" /><path d="M8 8 3 5M8 8v5M8 8l5-3" /></>;
    case 'objSprite':
      return <><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 11l3-4 2 2 3-3 4 5" /><circle cx="5.5" cy="6" r="1.2" /></>;
    case 'objAnimator':
      return <><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M6 3v10M10 3v10" /><path d="M2 6h12M2 10h12" /></>;
    case 'objLight':
      return <><circle cx="8" cy="6.5" r="3" /><path d="M6 10v2a2 2 0 0 0 4 0v-2" /><path d="M8 2v1M3 6.5H2M14 6.5h-1M4 3l.7.7M12 3l-.7.7" /></>;
    case 'objLightingManager':
      return <><circle cx="8" cy="8" r="3" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2M4 4l1.5 1.5M10.5 10.5 12 12M12 4l-1.5 1.5M5.5 10.5 4 12" /></>;
    case 'objAudioSource':
      return <><path d="M3 6h2l3-3v10L5 10H3z" /><path d="M10 5.5a3 3 0 0 1 0 5" /><path d="M11.5 3.5a6 6 0 0 1 0 9" /></>;
    case 'objMusicSource':
      return <><circle cx="5" cy="11.5" r="1.8" /><circle cx="11" cy="10.5" r="1.8" /><path d="M6.8 11.5V4l6-1.5v8" /><path d="M6.8 6.5l6-1.5" /></>;
    case 'objParticleEmitter':
      return <><circle cx="8" cy="10" r="2" /><circle cx="5" cy="6" r="1.2" /><circle cx="11" cy="5" r="1" /><circle cx="9" cy="3" r="0.8" /><circle cx="4" cy="3.5" r="0.7" /><circle cx="12" cy="8" r="0.9" /><path d="M8 8V6M6.5 7.5l-1-1.5M9.5 7.5l1-1.5" /></>;
    default:
      return <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />;
  }
}

export default function Icon({ name, size = 14, className = '', style }) {
  return (
    <svg
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {glyph(name)}
    </svg>
  );
}
