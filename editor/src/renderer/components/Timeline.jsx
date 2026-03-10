import React, { useState, useCallback, useRef, useEffect } from 'react';

const TRACK_HEIGHT = 28;
const HEADER_HEIGHT = 32;
const PX_PER_SEC = 120;

/**
 * Animation timeline editor.
 * Shows clips, tracks, keyframes with a scrubber.
 */
export default function Timeline({ project, onUpdateAnimation, onAddAnimation, onDeleteAnimation, onAddTrack, onAddKeyframe, onDeleteKeyframe, onUpdateKeyframe }) {
  const clips = project ? project.animations || [] : [];
  const objects = project ? project.objects || [] : [];
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [scrubTime, setScrubTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastTimeRef = useRef(null);

  const clip = clips.find(c => c.id === selectedClipId) || null;

  useEffect(() => {
    if (!selectedClipId && clips.length > 0) setSelectedClipId(clips[0].id);
  }, [clips, selectedClipId]);

  // Playback loop
  useEffect(() => {
    if (!playing || !clip) return;
    lastTimeRef.current = performance.now();

    function tick(now) {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      setScrubTime(prev => {
        const next = prev + dt;
        return clip.loop ? next % (clip.duration || 1) : Math.min(next, clip.duration || 1);
      });
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, clip?.id, clip?.duration, clip?.loop]);

  // Draw timeline canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clip) return;
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const dur = clip.duration || 1;
    const tracks = clip.tracks || [];

    ctx.clearRect(0, 0, w, h);

    // Time ruler
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, HEADER_HEIGHT);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(w, HEADER_HEIGHT);
    ctx.stroke();

    // Time markers
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const step = 0.5;
    for (let t = 0; t <= dur + 0.01; t += step) {
      const x = t * PX_PER_SEC;
      if (x > w) break;
      ctx.fillText(t.toFixed(1) + 's', x, 12);
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, HEADER_HEIGHT);
      ctx.stroke();
      // Extend grid line through tracks
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Tracks
    tracks.forEach((track, i) => {
      const y = HEADER_HEIGHT + i * TRACK_HEIGHT;

      // Track background
      ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#111827';
      ctx.fillRect(0, y, w, TRACK_HEIGHT);

      // Track label
      const obj = objects.find(o => o.id === track.targetObjectId);
      const label = (obj ? obj.name : '?') + '.' + track.property;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, 4, y + 18);

      // Keyframes
      if (track.keyframes) {
        track.keyframes.forEach((kf) => {
          const kx = kf.time * PX_PER_SEC;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(kx, y + 8);
          ctx.lineTo(kx + 6, y + TRACK_HEIGHT / 2);
          ctx.lineTo(kx, y + TRACK_HEIGHT - 8);
          ctx.lineTo(kx - 6, y + TRACK_HEIGHT / 2);
          ctx.closePath();
          ctx.fill();
        });
      }
    });

    // Scrubber line
    const sx = scrubTime * PX_PER_SEC;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();

    // Scrubber head
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(sx - 6, 0);
    ctx.lineTo(sx + 6, 0);
    ctx.lineTo(sx, 8);
    ctx.closePath();
    ctx.fill();
  }, [clip, scrubTime, objects]);

  const handleCanvasClick = useCallback((e) => {
    if (!clip) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = x / PX_PER_SEC;
    setScrubTime(Math.max(0, Math.min(clip.duration || 1, t)));
  }, [clip]);

  const handleAddClip = useCallback(() => {
    const name = prompt('Animation clip name:');
    if (!name) return;
    onAddAnimation(name);
  }, [onAddAnimation]);

  const handleDeleteClip = useCallback(() => {
    if (!selectedClipId || !clip) return;
    if (!confirm(`Delete clip "${clip.name}"?`)) return;
    onDeleteAnimation(selectedClipId);
    setSelectedClipId(null);
  }, [selectedClipId, clip, onDeleteAnimation]);

  const handleAddTrackBtn = useCallback(() => {
    if (!clip || objects.length === 0) return;
    const objId = prompt('Object ID (or name):', objects[0]?.id);
    if (!objId) return;
    const prop = prompt('Property to animate:', 'x');
    if (!prop) return;
    // Find object by id or name
    const obj = objects.find(o => o.id === objId || o.name === objId);
    if (!obj) { alert('Object not found'); return; }
    onAddTrack(clip.id, obj.id, prop);
  }, [clip, objects, onAddTrack]);

  const handleAddKf = useCallback(() => {
    if (!clip || !clip.tracks || clip.tracks.length === 0) return;
    const trackIdx = clip.tracks.length === 1 ? 0 : parseInt(prompt('Track index (0-based):', '0'), 10);
    if (isNaN(trackIdx) || trackIdx < 0 || trackIdx >= clip.tracks.length) return;
    const value = parseFloat(prompt('Value:', '0'));
    if (isNaN(value)) return;
    onAddKeyframe(clip.id, trackIdx, scrubTime, value);
  }, [clip, scrubTime, onAddKeyframe]);

  const handleDeleteTrack = useCallback((trackIdx) => {
    if (!clip) return;
    const tracks = (clip.tracks || []).filter((_, i) => i !== trackIdx);
    onUpdateAnimation(clip.id, { tracks });
  }, [clip, onUpdateAnimation]);

  const handleDeleteKeyframe = useCallback((trackIdx, kfIdx) => {
    if (!clip || !clip.tracks) return;
    const tracks = clip.tracks.map((t, i) => {
      if (i !== trackIdx) return t;
      return { ...t, keyframes: (t.keyframes || []).filter((_, ki) => ki !== kfIdx) };
    });
    onUpdateAnimation(clip.id, { tracks });
  }, [clip, onUpdateAnimation]);

  const handleDurationChange = useCallback((e) => {
    if (!clip) return;
    const dur = parseFloat(e.target.value);
    if (!isNaN(dur) && dur > 0) onUpdateAnimation(clip.id, { duration: dur });
  }, [clip, onUpdateAnimation]);

  const handleLoopToggle = useCallback(() => {
    if (!clip) return;
    onUpdateAnimation(clip.id, { loop: !clip.loop });
  }, [clip, onUpdateAnimation]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Clip tabs + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        {clips.map(c => (
          <button key={c.id} className={`btn btn-sm ${selectedClipId === c.id ? 'active' : ''}`} onClick={() => { setSelectedClipId(c.id); setScrubTime(0); setPlaying(false); }}>
            {c.name}
          </button>
        ))}
        <button className="btn btn-sm" onClick={handleAddClip} title="New Clip">+</button>
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {clip && <>
          <button className="btn btn-sm" onClick={() => { setScrubTime(0); setPlaying(!playing); }}>{playing ? 'Stop' : 'Play'}</button>
          <button className="btn btn-sm" onClick={() => setScrubTime(0)}>|&lt;</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{scrubTime.toFixed(2)}s</span>
          <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dur:</label>
          <input type="number" value={clip.duration} onChange={handleDurationChange} step="0.1" min="0.1" style={{ width: 50, padding: '1px 4px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 11 }} />
          <button className={`btn btn-sm ${clip.loop ? 'active' : ''}`} onClick={handleLoopToggle}>Loop</button>
          <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
          <button className="btn btn-sm" onClick={handleAddTrackBtn}>+ Track</button>
          <button className="btn btn-sm" onClick={handleAddKf}>+ Key</button>
          <button className="btn btn-sm btn-danger" onClick={handleDeleteClip} style={{ marginLeft: 'auto' }}>Del Clip</button>
        </>}
      </div>

      {/* Timeline canvas */}
      {clip ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Track list sidebar */}
          <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
            <div style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: 'var(--text-muted)' }}>
              Tracks ({(clip.tracks || []).length})
            </div>
            {(clip.tracks || []).map((track, i) => {
              const obj = objects.find(o => o.id === track.targetObjectId);
              const kfs = track.keyframes || [];
              return (
                <div key={i} style={{ height: TRACK_HEIGHT, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', borderBottom: '1px solid #1e293b', background: i % 2 === 0 ? '#0f172a' : '#111827' }}>
                  <span style={{ flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(obj ? obj.name : '?')}.{track.property}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{kfs.length}kf</span>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteTrack(i)} style={{ fontSize: 9, padding: '0 3px', lineHeight: 1.2 }} title="Delete track">x</button>
                </div>
              );
            })}
          </div>
          {/* Timeline canvas */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            <canvas ref={canvasRef} style={{ display: 'block', cursor: 'pointer', minWidth: (clip.duration || 1) * PX_PER_SEC + 50 }} onClick={handleCanvasClick} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          {clips.length === 0 ? 'No animations. Click + to create one.' : 'Select a clip.'}
        </div>
      )}
    </div>
  );
}
