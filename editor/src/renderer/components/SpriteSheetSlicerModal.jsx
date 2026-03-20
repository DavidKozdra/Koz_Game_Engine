import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
const MIN_SEGMENT_SIZE = 8;

function imageSrc(asset) {
  return asset && (asset.previewUrl || asset.url || asset.src) ? (asset.previewUrl || asset.url || asset.src) : null;
}

function clampSegmentCount(size, requestedCount) {
  const nextCount = Math.max(1, parseInt(String(requestedCount), 10) || 1);
  if (!Number.isFinite(size) || size <= 0) return nextCount;
  return Math.max(1, Math.min(nextCount, Math.floor(size / MIN_SEGMENT_SIZE) || 1));
}

function buildEvenCuts(size, segmentCount) {
  const count = clampSegmentCount(size, segmentCount);
  if (!Number.isFinite(size) || size <= 0 || count <= 1) return [];
  const cuts = [];
  for (let index = 1; index < count; index += 1) {
    cuts.push(Math.round((size * index) / count));
  }
  return cuts;
}

function buildSegments(size, cuts) {
  if (!Number.isFinite(size) || size <= 0) return [];
  const points = [0, ...(Array.isArray(cuts) ? cuts : []), size];
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end > start) segments.push({ start, size: end - start });
  }
  return segments;
}

function defaultPrefixForAsset(asset) {
  const base = String((asset && (asset.name || asset.id)) || 'frame')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return base ? `${base}_frame` : 'frame';
}

function summarizeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return 'No guides';
  const sizes = segments.map((segment) => segment.size);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return min === max ? `${min}px each` : `${min}px to ${max}px`;
}

export default function SpriteSheetSlicerModal({
  open,
  images,
  initialAssetId = '',
  onClose,
  onSlice,
  onImportImages,
}) {
  const [sheetAssetId, setSheetAssetId] = useState(initialAssetId || '');
  const [sheetPrefix, setSheetPrefix] = useState('frame');
  const [gridCols, setGridCols] = useState(4);
  const [gridRows, setGridRows] = useState(4);
  const [columnCuts, setColumnCuts] = useState([]);
  const [rowCuts, setRowCuts] = useState([]);
  const [sheetSize, setSheetSize] = useState({ width: 0, height: 0 });
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const dragGuideRef = useRef(null);

  const selectedAsset = useMemo(
    () => images.find((asset) => asset && asset.id === sheetAssetId) || null,
    [images, sheetAssetId],
  );
  const selectedAssetId = selectedAsset ? selectedAsset.id : null;
  const previewSrc = imageSrc(selectedAsset);
  const columnSegments = useMemo(() => buildSegments(sheetSize.width, columnCuts), [sheetSize.width, columnCuts]);
  const rowSegments = useMemo(() => buildSegments(sheetSize.height, rowCuts), [sheetSize.height, rowCuts]);
  const totalFrames = columnSegments.length * rowSegments.length;
  const renderCells = totalFrames > 0 && totalFrames <= 256;
  const renderLabels = totalFrames > 0 && totalFrames <= 64;

  function handleDragLeave(event) {
    event.preventDefault();
    const nextTarget = typeof Node !== 'undefined' && event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!event.currentTarget.contains(nextTarget)) setDropActive(false);
  }

  useEffect(() => {
    if (!open) return;
    setSheetAssetId(initialAssetId || ((images[0] && images[0].id) || ''));
    setStatus(null);
  }, [open, initialAssetId]);

  useEffect(() => {
    if (!open || !sheetAssetId) return;
    const exists = images.some((asset) => asset && asset.id === sheetAssetId);
    if (!exists) setSheetAssetId((images[0] && images[0].id) || '');
  }, [open, images, sheetAssetId]);

  useEffect(() => {
    if (!selectedAsset) {
      setSheetSize({ width: 0, height: 0 });
      return;
    }
    setSheetPrefix(defaultPrefixForAsset(selectedAsset));
    setSheetSize({
      width: Number.isFinite(selectedAsset.width) ? selectedAsset.width : 0,
      height: Number.isFinite(selectedAsset.height) ? selectedAsset.height : 0,
    });
    setStatus(null);
  }, [selectedAssetId]);

  useEffect(() => {
    if (!selectedAssetId || !sheetSize.width || !sheetSize.height) return;
    const nextCols = clampSegmentCount(sheetSize.width, gridCols);
    const nextRows = clampSegmentCount(sheetSize.height, gridRows);
    if (nextCols !== gridCols) setGridCols(nextCols);
    if (nextRows !== gridRows) setGridRows(nextRows);
    setColumnCuts(buildEvenCuts(sheetSize.width, nextCols));
    setRowCuts(buildEvenCuts(sheetSize.height, nextRows));
  }, [selectedAssetId, sheetSize.width, sheetSize.height]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerMove(event) {
      const dragGuide = dragGuideRef.current;
      if (!dragGuide || !stageRef.current) return;
      const size = dragGuide.axis === 'x' ? sheetSize.width : sheetSize.height;
      if (!size) return;
      const rect = stageRef.current.getBoundingClientRect();
      const length = dragGuide.axis === 'x' ? rect.width : rect.height;
      if (!length) return;
      const pointerOffset = dragGuide.axis === 'x'
        ? event.clientX - rect.left
        : event.clientY - rect.top;
      const nextValue = Math.round((pointerOffset / length) * size);
      const cuts = dragGuide.axis === 'x' ? columnCuts : rowCuts;
      const prevLimit = dragGuide.index > 0 ? cuts[dragGuide.index - 1] + MIN_SEGMENT_SIZE : MIN_SEGMENT_SIZE;
      const nextLimit = dragGuide.index < cuts.length - 1
        ? cuts[dragGuide.index + 1] - MIN_SEGMENT_SIZE
        : size - MIN_SEGMENT_SIZE;
      const clamped = Math.max(prevLimit, Math.min(nextLimit, nextValue));
      const nextCuts = cuts.slice();
      nextCuts[dragGuide.index] = clamped;
      if (dragGuide.axis === 'x') setColumnCuts(nextCuts);
      else setRowCuts(nextCuts);
    }

    function stopGuideDrag() {
      dragGuideRef.current = null;
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopGuideDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopGuideDrag);
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    };
  }, [open, sheetSize.width, sheetSize.height, columnCuts, rowCuts]);

  function handlePreviewLoad(event) {
    const image = event.currentTarget;
    const width = image && image.naturalWidth ? image.naturalWidth : 0;
    const height = image && image.naturalHeight ? image.naturalHeight : 0;
    if (!width || !height) return;
    setSheetSize((prev) => (
      prev.width === width && prev.height === height
        ? prev
        : { width, height }
    ));
  }

  function beginGuideDrag(axis, index, event) {
    event.preventDefault();
    event.stopPropagation();
    dragGuideRef.current = { axis, index };
    window.document.body.style.cursor = axis === 'x' ? 'ew-resize' : 'ns-resize';
    window.document.body.style.userSelect = 'none';
  }

  function resetGuides() {
    if (!sheetSize.width || !sheetSize.height) return;
    setColumnCuts(buildEvenCuts(sheetSize.width, gridCols));
    setRowCuts(buildEvenCuts(sheetSize.height, gridRows));
    setStatus({ tone: 'info', text: 'Guides reset to an even grid.' });
  }

  function updateGrid(axis, rawValue) {
    const requested = Math.max(1, parseInt(String(rawValue), 10) || 1);
    if (axis === 'x') {
      const nextCount = clampSegmentCount(sheetSize.width, requested);
      setGridCols(nextCount);
      if (sheetSize.width) setColumnCuts(buildEvenCuts(sheetSize.width, nextCount));
      return;
    }
    const nextCount = clampSegmentCount(sheetSize.height, requested);
    setGridRows(nextCount);
    if (sheetSize.height) setRowCuts(buildEvenCuts(sheetSize.height, nextCount));
  }

  function handleImport(fileList) {
    if (!onImportImages) return;
    onImportImages(fileList, {
      onComplete: (imported) => {
        const nextImported = Array.isArray(imported) ? imported.filter(Boolean) : [];
        if (nextImported.length === 0) {
          setStatus({ tone: 'warning', text: 'No image files were imported.' });
          return;
        }
        setSheetAssetId(nextImported[0].id);
        setStatus({
          tone: 'success',
          text: `Imported ${nextImported.length} image${nextImported.length === 1 ? '' : 's'} and selected the first sheet.`,
        });
      },
    });
  }

  function handleDrop(event) {
    event.preventDefault();
    setDropActive(false);
    const files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
    if (files && files.length > 0) handleImport(files);
  }

  function createFrames() {
    if (!selectedAsset) {
      setStatus({ tone: 'warning', text: 'Select a sprite sheet before slicing.' });
      return;
    }
    if (!sheetSize.width || !sheetSize.height || totalFrames === 0) {
      setStatus({ tone: 'warning', text: 'Wait for the sprite sheet preview to finish loading.' });
      return;
    }
    const prefix = sheetPrefix.trim() || 'frame';
    const frames = [];
    rowSegments.forEach((row, rowIndex) => {
      columnSegments.forEach((column, columnIndex) => {
        frames.push({
          name: `${prefix}_${rowIndex}_${columnIndex}`,
          frameRect: {
            x: column.start,
            y: row.start,
            w: column.size,
            h: row.size,
          },
          width: column.size,
          height: row.size,
        });
      });
    });
    onSlice({
      sourceAsset: selectedAsset,
      prefix,
      frames,
    });
    setStatus({
      tone: 'success',
      text: `Created ${frames.length} frame asset${frames.length === 1 ? '' : 's'} from ${selectedAsset.name || selectedAsset.id}.`,
    });
  }

  const statusColor = status && status.tone === 'success'
    ? 'var(--success)'
    : status && status.tone === 'warning'
      ? 'var(--warning)'
      : 'var(--accent)';

  return (
    <Modal
      open={open}
      title="Sprite Sheet Slicer"
      onClose={onClose}
      maxWidth={1240}
      minWidth={540}
      resizable={false}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
          <div
            onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDropActive(true); event.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              display: 'grid',
              gap: 10,
              padding: 14,
              borderRadius: 10,
              border: dropActive ? '1px solid var(--accent)' : '1px dashed rgba(148,163,184,0.45)',
              background: dropActive ? 'rgba(59,130,246,0.12)' : 'rgba(15,23,42,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <Icon name="import" size={16} />
              Import Sprite Sheet
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Drop PNG, JPG, WEBP, or SVG files here, or open one from disk. Imported images are added to the asset list immediately.
            </div>
            <button className="btn btn-sm" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              <Icon name="import" />
              Choose Images
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              onChange={(event) => {
                handleImport(event.target.files);
                event.target.value = '';
              }}
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 10, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.45)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)' }}>Sheet Setup</div>
            <div className="field" style={{ marginBottom: 0, alignItems: 'stretch' }}>
              <label style={{ width: 64 }}>Source</label>
              <select value={sheetAssetId} onChange={(event) => setSheetAssetId(event.target.value)}>
                <option value="">Select image</option>
                {images.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name || asset.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ width: 64 }}>Prefix</label>
              <input
                type="text"
                value={sheetPrefix}
                onChange={(event) => setSheetPrefix(event.target.value)}
                placeholder="frame"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Columns</span>
                <input
                  type="number"
                  min={1}
                  value={gridCols}
                  onChange={(event) => updateGrid('x', event.target.value)}
                  style={{ padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rows</span>
                <input
                  type="number"
                  min={1}
                  value={gridRows}
                  onChange={(event) => updateGrid('y', event.target.value)}
                  style={{ padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text)' }}
                />
              </div>
            </div>
            <button className="btn btn-sm" onClick={resetGuides} disabled={!sheetSize.width || !sheetSize.height}>
              <Icon name="reset" />
              Reset Evenly
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Drag the blue guides in the preview to fine-tune uneven spacing. Use the numeric fields when you want to add or remove slices quickly.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.45)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Columns</div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600 }}>{columnSegments.length}</div>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>{summarizeSegments(columnSegments)}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.45)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Rows</div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600 }}>{rowSegments.length}</div>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>{summarizeSegments(rowSegments)}</div>
            </div>
            <div style={{ gridColumn: '1 / -1', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.45)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Output</div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600 }}>{totalFrames} frame{totalFrames === 1 ? '' : 's'}</div>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                {sheetPrefix.trim() || 'frame'}_0_0 to {(sheetPrefix.trim() || 'frame')}_{Math.max(0, rowSegments.length - 1)}_{Math.max(0, columnSegments.length - 1)}
              </div>
            </div>
          </div>

          {status && (
            <div style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${statusColor}`, color: statusColor, background: 'rgba(15,23,42,0.45)', fontSize: 12 }}>
              {status.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-sm" onClick={createFrames} disabled={!selectedAsset || !previewSrc || totalFrames === 0}>
              <Icon name="grid" />
              Create Frames
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAsset ? (selectedAsset.name || selectedAsset.id) : 'No sprite sheet selected'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {sheetSize.width && sheetSize.height
                  ? `${sheetSize.width} x ${sheetSize.height} px`
                  : 'Select or import a source image to begin.'}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
              Drag the guide handles to line frames up with the actual art.
            </div>
          </div>

          <div
            style={{
              borderRadius: 12,
              border: dropActive ? '1px solid var(--accent)' : '1px solid rgba(148,163,184,0.18)',
              background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(15,23,42,0.72))',
              padding: 14,
              minHeight: 340,
            }}
            onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDropActive(true); event.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedAsset && previewSrc ? (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  minHeight: 300,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  borderRadius: 10,
                  backgroundImage: 'linear-gradient(45deg, rgba(148,163,184,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.08) 75%)',
                  backgroundSize: '24px 24px',
                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
                }}
              >
                <div
                  ref={stageRef}
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxHeight: '56vh',
                    aspectRatio: `${Math.max(1, sheetSize.width || 1)} / ${Math.max(1, sheetSize.height || 1)}`,
                  }}
                >
                  <img
                    src={previewSrc}
                    alt={selectedAsset.name || selectedAsset.id}
                    onLoad={handlePreviewLoad}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 10 }}
                  />

                  {renderCells && rowSegments.map((row, rowIndex) => (
                    columnSegments.map((column, columnIndex) => (
                      <div
                        key={`cell-${rowIndex}-${columnIndex}`}
                        style={{
                          position: 'absolute',
                          left: `${(column.start / sheetSize.width) * 100}%`,
                          top: `${(row.start / sheetSize.height) * 100}%`,
                          width: `${(column.size / sheetSize.width) * 100}%`,
                          height: `${(row.size / sheetSize.height) * 100}%`,
                          border: '1px solid rgba(96,165,250,0.55)',
                          background: ((rowIndex + columnIndex) % 2 === 0) ? 'rgba(59,130,246,0.06)' : 'rgba(14,165,233,0.04)',
                          pointerEvents: 'none',
                        }}
                      >
                        {renderLabels && (
                          <div style={{ position: 'absolute', right: 4, bottom: 4, padding: '2px 4px', borderRadius: 4, background: 'rgba(2,6,23,0.8)', color: '#dbeafe', fontSize: 10 }}>
                            {rowIndex},{columnIndex}
                          </div>
                        )}
                      </div>
                    ))
                  ))}

                  {columnCuts.map((cut, index) => (
                    <button
                      key={`col-cut-${index}`}
                      type="button"
                      onPointerDown={(event) => beginGuideDrag('x', index, event)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `calc(${(cut / sheetSize.width) * 100}% - 8px)`,
                        width: 16,
                        cursor: 'ew-resize',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                      }}
                    >
                      <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, transform: 'translateX(-50%)', background: '#60a5fa' }} />
                      <span style={{ position: 'absolute', left: '50%', top: 10, width: 12, height: 24, borderRadius: 999, transform: 'translateX(-50%)', background: '#dbeafe', border: '1px solid #60a5fa' }} />
                    </button>
                  ))}

                  {rowCuts.map((cut, index) => (
                    <button
                      key={`row-cut-${index}`}
                      type="button"
                      onPointerDown={(event) => beginGuideDrag('y', index, event)}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `calc(${(cut / sheetSize.height) * 100}% - 8px)`,
                        height: 16,
                        cursor: 'ns-resize',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                      }}
                    >
                      <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, transform: 'translateY(-50%)', background: '#38bdf8' }} />
                      <span style={{ position: 'absolute', top: '50%', left: 10, width: 24, height: 12, borderRadius: 999, transform: 'translateY(-50%)', background: '#e0f2fe', border: '1px solid #38bdf8' }} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: '100%', minHeight: 300, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px dashed rgba(148,163,184,0.35)', color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                <div style={{ display: 'grid', gap: 10, justifyItems: 'center', maxWidth: 320 }}>
                  <Icon name="image" size={28} />
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>No sheet selected</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    Pick a source image from the left, or drop a sprite sheet anywhere in this dialog to import and slice it.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
