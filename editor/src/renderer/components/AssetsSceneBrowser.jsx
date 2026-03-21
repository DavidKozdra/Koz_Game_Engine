import React, { useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import ImageAssetPreview from './ImageAssetPreview.jsx';
import SpriteSheetSlicerModal from './SpriteSheetSlicerModal.jsx';

function isImageAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.kind === 'image') return true;
  if (asset.mime && String(asset.mime).startsWith('image/')) return true;
  const src = String(asset.url || asset.src || asset.path || '').toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|svg)$/.test(src);
}

function isAudioAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.kind === 'audio') return true;
  if (asset.mime && String(asset.mime).startsWith('audio/')) return true;
  const src = String(asset.url || asset.src || asset.path || '').toLowerCase();
  return /\.(mp3|ogg|wav|m4a|flac|aac)$/.test(src);
}

const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
const AUDIO_ACCEPT = '.mp3,.ogg,.wav,.m4a,.flac,.aac,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/flac,audio/aac';

function createSceneCameraObject(world, options = {}) {
  const cols = Number.isFinite(world && world.cols) ? world.cols : 30;
  const rows = Number.isFinite(world && world.rows) ? world.rows : 20;
  const offsetX = Number.isFinite(world && world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world && world.offsetY) ? world.offsetY : 0;
  const centerX = Math.round((offsetX * 24) + (cols * 12));
  const centerY = Math.round((offsetY * 24) + (rows * 12));
  const id = options.id || `obj_${options.sceneId || 'scene'}_camera`;
  return {
    id,
    name: options.name || 'Main Camera',
    type: 'camera',
    parentId: null,
    x: centerX,
    y: centerY,
    components: {
      Transform: { x: centerX, y: centerY, rotation: 0, scaleX: 1, scaleY: 1 },
      Camera: {
        enabled: true,
        targetObjectId: null,
        speed: 8,
        offsetX: 0,
        offsetY: 0,
        deadZoneWidth: 180,
        deadZoneHeight: 120,
        lookAheadX: 0,
        lookAheadY: 0,
        visibleMargin: 40,
        followX: true,
        followY: true,
        clampToWorld: true,
        maxSpeed: 2000,
      },
      Render: { layerId: 'obj-main', visible: false, zIndex: 0 },
      ScriptBindings: [],
    },
  };
}

export default function AssetsSceneBrowser({
  project,
  onPatchProject,
  onSelectScene,
  onSetStartScene,
  selectedObjectId = null,
  selectedSceneId = null,
  showScenes = true,
  showImages = true,
  showPrefabs = true,
  showAudio = true,
  onEditPrefabSource,
  onDeletePrefab,
  onRenamePrefabVariant,
  onDeletePrefabVariant,
  onSavePrefabVariantFromObject,
  title = 'Assets',
}) {
  const [expanded, setExpanded] = useState({ scenes: true, images: true, prefabs: true, audio: true });
  const [assetFilter, setAssetFilter] = useState('');
  const [audioQuery, setAudioQuery] = useState('');
  const [newSceneName, setNewSceneName] = useState('');
  const [newImageName, setNewImageName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showSpriteSheetSlicer, setShowSpriteSheetSlicer] = useState(false);
  const [spriteSheetAssetId, setSpriteSheetAssetId] = useState('');
  const imageFileInputRef = useRef(null);
  const audioFileInputRef = useRef(null);

  const scenes = useMemo(() => {
    const list = Array.isArray(project.scenes) ? project.scenes : [];
    if (list.length > 0) return list;
    return [{ id: 'scene_main', name: 'Main Scene', world: project.world, objects: project.objects || [] }];
  }, [project.scenes, project.world, project.objects]);

  const allImages = useMemo(() => (project.assets || []).filter(isImageAsset), [project.assets]);
  const imageAssetById = useMemo(() => new Map(allImages.map((asset) => [asset.id, asset])), [allImages]);
  const sliceableImages = useMemo(
    () => allImages.filter((asset) => asset && !asset.sourceAssetId),
    [allImages],
  );
  const allAudios = useMemo(() => (project.assets || []).filter(isAudioAsset), [project.assets]);
  const filterLower = assetFilter.trim().toLowerCase();
  const images = useMemo(() => filterLower ? allImages.filter(a => (a.name || a.id).toLowerCase().includes(filterLower)) : allImages, [allImages, filterLower]);
  const audios = useMemo(() => filterLower ? allAudios.filter(a => (a.name || a.id).toLowerCase().includes(filterLower)) : allAudios, [allAudios, filterLower]);
  const audioFilterLower = audioQuery.trim().toLowerCase();
  const visibleAudios = useMemo(
    () => (
      audioFilterLower
        ? audios.filter((asset) => String(asset.name || asset.id).toLowerCase().includes(audioFilterLower))
        : audios
    ),
    [audios, audioFilterLower],
  );
  const prefabs = project.prefabs || [];
  const bootSceneId = project.activeSceneId || (scenes[0] && scenes[0].id) || null;
  const currentSceneId = selectedSceneId || bootSceneId;
  const allSceneObjects = useMemo(() => (
    scenes.flatMap((scene) => ((scene && Array.isArray(scene.objects)) ? scene.objects : []).map((obj) => ({ scene, obj })))
  ), [scenes]);
  const selectedObject = useMemo(() => {
    if (!selectedObjectId) return null;
    const entry = allSceneObjects.find(({ obj }) => obj && obj.id === selectedObjectId);
    return entry ? entry.obj : null;
  }, [allSceneObjects, selectedObjectId]);
  const prefabUsage = useMemo(() => {
    const usageByPrefab = new Map();
    const usageByVariant = new Map();
    const sourceSceneByPrefab = new Map();
    const sourceObjectIds = new Map(prefabs.map((prefab) => [prefab.id, prefab.sourceObjectId || null]));

    allSceneObjects.forEach(({ scene, obj }) => {
      if (!obj) return;
      if (obj.prefabId) {
        usageByPrefab.set(obj.prefabId, (usageByPrefab.get(obj.prefabId) || 0) + 1);
        if (obj.variantId) {
          const variantKey = `${obj.prefabId}::${obj.variantId}`;
          usageByVariant.set(variantKey, (usageByVariant.get(variantKey) || 0) + 1);
        }
      }
      sourceObjectIds.forEach((sourceObjectId, prefabId) => {
        if (sourceObjectId && obj.id === sourceObjectId && !sourceSceneByPrefab.has(prefabId)) {
          sourceSceneByPrefab.set(prefabId, scene);
        }
      });
    });

    return { usageByPrefab, usageByVariant, sourceSceneByPrefab };
  }, [allSceneObjects, prefabs]);

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function addScene() {
    const name = newSceneName.trim();
    if (!name) return;
    const id = `scene_${Date.now().toString(36)}`;
    const baseWorld = project.world || { cols: 30, rows: 20, offsetX: 0, offsetY: 0, defaultCell: 'empty', grid: [], elements: [], meta: {} };
    const baseRenderMode = (project.meta && project.meta.renderMode) || '2d';
    const world = JSON.parse(JSON.stringify(baseWorld));
    if (Array.isArray(world.grid)) {
      world.grid = world.grid.map((row) => (Array.isArray(row) ? row.map(() => world.defaultCell || 'empty') : []));
    }
    onPatchProject({
      scenes: [...scenes, { id, name, renderMode: baseRenderMode, world, objects: [createSceneCameraObject(world, { sceneId: id })] }],
    });
    if (onSelectScene) onSelectScene(id);
    setNewSceneName('');
  }

  function removeScene(id) {
    if (scenes.length <= 1) return;
    const nextScenes = scenes.filter((s) => s.id !== id);
    const nextActive = bootSceneId === id ? nextScenes[0].id : bootSceneId;
    onPatchProject({ scenes: nextScenes, activeSceneId: nextActive });
    if (currentSceneId === id && onSelectScene) onSelectScene(nextScenes[0].id);
  }

  function duplicateScene(id) {
    const source = scenes.find((s) => s.id === id);
    if (!source) return;
    const copy = {
      id: `scene_${Date.now().toString(36)}`,
      name: `${source.name} Copy`,
      renderMode: source.renderMode || ((project.meta && project.meta.renderMode) || '2d'),
      world: JSON.parse(JSON.stringify(source.world || project.world)),
      objects: JSON.parse(JSON.stringify(source.objects || [])),
    };
    onPatchProject({ scenes: [...scenes, copy] });
    if (onSelectScene) onSelectScene(copy.id);
  }

  function updateSceneRenderMode(id, renderMode) {
    onPatchProject({
      scenes: scenes.map((scene) => (
        scene.id === id ? { ...scene, renderMode } : scene
      )),
    });
  }

  function moveScene(id, dir) {
    const idx = scenes.findIndex((s) => s.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= scenes.length) return;
    const next = scenes.slice();
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item);
    onPatchProject({ scenes: next });
  }

  function addImage() {
    const name = newImageName.trim();
    const url = newImageUrl.trim();
    if (!name || !url) return;
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    const mime = url.startsWith('data:') ? url.split(';')[0].split(':')[1] : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const asset = { id: `img_${Date.now().toString(36)}`, kind: 'image', mime, name, url };
    onPatchProject({ assets: [...(project.assets || []), asset] });
    setNewImageName('');
    setNewImageUrl('');
  }

  function openSpriteSheetSlicer(assetId = '') {
    setSpriteSheetAssetId(assetId || ((sliceableImages[0] && sliceableImages[0].id) || ''));
    setShowSpriteSheetSlicer(true);
  }

  function importImageFiles(fileList, options = {}) {
    const onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
    const files = Array.from(fileList || []);
    const imgs = files.filter((file) => file && file.type.startsWith('image/'));
    if (imgs.length === 0) {
      if (onComplete) onComplete([]);
      return;
    }
    let pending = imgs.length;
    const imported = new Array(imgs.length);

    function finishImport() {
      if (pending !== 0) return;
      const nextImported = imported.filter(Boolean);
      if (nextImported.length > 0) onPatchProject({ assets: [...(project.assets || []), ...nextImported] });
      if (onComplete) onComplete(nextImported);
    }

    imgs.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target && ev.target.result ? String(ev.target.result) : null;
        if (!dataUrl) {
          pending -= 1;
          finishImport();
          return;
        }
        const img = new Image();
        img.onload = () => {
          const ext = file.name.split('.').pop().toLowerCase();
          imported[index] = {
            id: `img_${Date.now().toString(36)}_${index + 1}`,
            kind: 'image',
            mime: file.type || `image/${ext}`,
            name: file.name.replace(/\.[^.]+$/, ''),
            url: dataUrl,
            previewUrl: dataUrl,
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
          };
          pending -= 1;
          finishImport();
        };
        img.onerror = () => {
          pending -= 1;
          finishImport();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function importAudioFiles(fileList) {
    const files = Array.from(fileList || []);
    const audios = files.filter((file) => file && file.type.startsWith('audio/'));
    if (audios.length === 0) return;
    let pending = audios.length;
    const imported = [];
    audios.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target && ev.target.result ? String(ev.target.result) : null;
        if (!dataUrl) {
          pending -= 1;
          if (pending === 0 && imported.length > 0) onPatchProject({ assets: [...(project.assets || []), ...imported] });
          return;
        }
        imported.push({
          id: `aud_${Date.now().toString(36)}_${imported.length + 1}`,
          kind: 'audio',
          mime: file.type,
          name: file.name.replace(/\.[^.]+$/, ''),
          url: dataUrl,
        });
        pending -= 1;
        if (pending === 0 && imported.length > 0) onPatchProject({ assets: [...(project.assets || []), ...imported] });
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(imageId) {
    onPatchProject({ assets: (project.assets || []).filter((a) => a.id !== imageId) });
  }

  function createSpriteFrames({ sourceAsset, frames }) {
    if (!sourceAsset || !Array.isArray(frames) || frames.length === 0) return;
    const timestamp = Date.now().toString(36);
    const created = frames.map((frame, index) => ({
      id: `frm_${timestamp}_${index}`,
      kind: 'image',
      mime: 'image/png',
      name: frame.name,
      sourceAssetId: sourceAsset.id,
      frameRect: frame.frameRect,
      width: frame.width,
      height: frame.height,
      previewUrl: sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src || null,
    }));
    onPatchProject({ assets: [...(project.assets || []), ...created] });
  }

  return (
    <>
      <div className="panel-section" style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'linear-gradient(180deg, rgba(15,23,42,0.75), rgba(15,23,42,0.4))' }}>
        <h3>{title}</h3>
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <span>Images: {allImages.length}</span>
            <span>Audio: {allAudios.length}</span>
            <span>Prefabs: {prefabs.length}</span>
            <span>Scenes: {scenes.length}</span>
          </div>
        </div>
        {(allImages.length + allAudios.length) > 5 && (
          <input
            type="text"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            placeholder={`Filter ${allImages.length + allAudios.length} assets...`}
            style={{ width: '100%', padding: '4px 8px', marginBottom: 6, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
          />
        )}
        <div
          style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#0b1220' }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              const imgFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
              const audFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
              if (imgFiles.length > 0) importImageFiles(imgFiles);
              if (audFiles.length > 0) importAudioFiles(audFiles);
            }
          }}
        >
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, background: 'rgba(2,6,23,0.5)' }}>
          Drop image/audio files anywhere in this panel to import
        </div>
        {showScenes && (
          <button type="button" className="btn btn-sm btn-section-toggle" onClick={() => toggle('scenes')}>
            <Icon name={expanded.scenes ? 'chevronDown' : 'chevronRight'} />
            <Icon name="folder" />
            Scenes ({scenes.length})
          </button>
        )}
        {showScenes && expanded.scenes && (
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              <input value={newSceneName} onChange={(e) => setNewSceneName(e.target.value)} placeholder="New scene name" style={{ flex: 1, padding: '3px 6px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
              <button className="btn btn-sm" onClick={addScene} aria-label="Add scene"><Icon name="add" />Add</button>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {scenes.map((scene) => {
                const isSelected = currentSceneId === scene.id;
                const isBoot = bootSceneId === scene.id;
                return (
                  <div key={scene.id} style={{ display: 'grid', gap: 6, padding: '6px', border: isSelected ? '1px solid rgba(59,130,246,0.8)' : '1px solid var(--border)', borderRadius: 4, background: isSelected ? 'rgba(59,130,246,0.16)' : '#111827' }}>
                    <div className="btn-row" style={{ minWidth: 0 }}>
                      <button type="button" onClick={() => onSelectScene && onSelectScene(scene.id)} style={{ background: 'none', border: 'none', color: '#cbd5e1', textAlign: 'left', cursor: 'pointer', flex: 1 }}>
                        {scene.name}
                      </button>
                      {isBoot ? (
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#93c5fd' }}>Start</span>
                      ) : (
                        <button className="btn btn-sm" onClick={() => onSetStartScene && onSetStartScene(scene.id)} title="Set Start Scene" aria-label={`Set ${scene.name} as the start scene`}>
                          Start
                        </button>
                      )}
                      <button className="btn btn-sm btn-icon-only" onClick={() => moveScene(scene.id, -1)} title="Move Up" aria-label={`Move ${scene.name} up`}><Icon name="arrowUp" /></button>
                      <button className="btn btn-sm btn-icon-only" onClick={() => moveScene(scene.id, 1)} title="Move Down" aria-label={`Move ${scene.name} down`}><Icon name="arrowDown" /></button>
                      <button className="btn btn-sm" onClick={() => duplicateScene(scene.id)} title="Duplicate" aria-label={`Duplicate ${scene.name}`}><Icon name="copy" />Copy</button>
                      <button className="btn btn-sm btn-danger btn-icon-only" onClick={() => removeScene(scene.id)} disabled={scenes.length <= 1} aria-label={`Delete ${scene.name}`}><Icon name="delete" /></button>
                    </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                    <span>Objects {(scene.objects || []).length}</span>
                    <span>Render</span>
                    <select
                      value={scene.renderMode || ((project.meta && project.meta.renderMode) || '2d')}
                      onChange={(e) => updateSceneRenderMode(scene.id, e.target.value)}
                      style={{ padding: '3px 6px', background: '#0f172a', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 11 }}
                    >
                      <option value="2d">2D Canvas</option>
                      <option value="webgl-3d">3D WebGL</option>
                    </select>
                  </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showImages && (
          <button type="button" className="btn btn-sm btn-section-toggle" onClick={() => toggle('images')}>
            <Icon name={expanded.images ? 'chevronDown' : 'chevronRight'} />
            <Icon name="image" />
            Images ({images.length})
          </button>
        )}
        {showImages && expanded.images && (
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 2fr) auto', gap: 6, marginBottom: 8 }}>
              <input value={newImageName} onChange={(e) => setNewImageName(e.target.value)} placeholder="Image name" style={{ padding: '3px 6px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
              <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Image URL or path" style={{ padding: '3px 6px', background: '#111827', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3 }} />
              <button className="btn btn-sm" onClick={addImage} aria-label="Add image from URL"><Icon name="add" />Add</button>
            </div>
            <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={() => imageFileInputRef.current && imageFileInputRef.current.click()}>
                <Icon name="import" />
                Import Images
              </button>
              <button className="btn btn-sm" onClick={() => openSpriteSheetSlicer()}>
                <Icon name="grid" />
                Sprite Sheet Tool
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>PNG, JPG, GIF, WEBP, SVG</span>
              <input
                ref={imageFileInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                onChange={(e) => { importImageFiles(e.target.files); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>Sprite Sheet Tool</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Open a popup slicer with a live preview, drag guides, and image drop support.
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => openSpriteSheetSlicer()}>
                <Icon name="grid" />
                Open
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 8 }}>
              {images.map((img) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('application/koz-asset-id', img.id); e.dataTransfer.setData('application/koz-asset-name', img.name || img.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: '#111827', cursor: 'grab' }}
                >
                  <div style={{ height: 72, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageAssetPreview
                      asset={img}
                      assetById={imageAssetById}
                      alt={img.name || img.id}
                      fit="cover"
                      fallback={<span style={{ fontSize: 11, color: '#94a3b8' }}>No Preview</span>}
                    />
                  </div>
                  <div style={{ padding: 6, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1' }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name || img.id}</span>
                      <span style={{ fontSize: 10, padding: '2px 5px', borderRadius: 999, background: img.sourceAssetId ? 'rgba(14,165,233,0.18)' : 'rgba(59,130,246,0.18)', color: img.sourceAssetId ? '#7dd3fc' : '#93c5fd' }}>
                        {img.sourceAssetId ? 'Frame' : 'Sheet'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      {img.width && img.height ? `${img.width} x ${img.height}` : 'Dimensions pending'}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!img.sourceAssetId && (
                        <button
                          className="btn btn-sm"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSpriteSheetSlicer(img.id);
                          }}
                          aria-label={`Open sprite sheet tool for ${img.name || img.id}`}
                        >
                          <Icon name="grid" />
                          Slice
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-danger"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(img.id);
                        }}
                        aria-label={`Delete image ${img.name || img.id}`}
                      >
                        <Icon name="delete" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {images.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No images yet. Use “Import Images” or drag files here.</div>
              )}
            </div>
          </div>
        )}

        {showPrefabs && (
          <button type="button" className="btn btn-sm btn-section-toggle" style={{ borderBottom: 'none' }} onClick={() => toggle('prefabs')}>
            <Icon name={expanded.prefabs ? 'chevronDown' : 'chevronRight'} />
            <Icon name="folder" />
            Prefabs ({prefabs.length})
          </button>
        )}
        {showPrefabs && expanded.prefabs && (
          <div style={{ padding: 8 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              {prefabs.length === 0 && <div style={{ color: '#94a3b8', fontSize: 11 }}>No prefabs yet.</div>}
              {prefabs.map((prefab) => (
                <div key={prefab.id} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: 6, background: '#111827', color: '#cbd5e1', fontSize: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prefab.name}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prefab.id}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => onEditPrefabSource && onEditPrefabSource(prefab.id)}
                        disabled={!onEditPrefabSource}
                        title="Jump to the source object for this prefab"
                      >
                        Source
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => selectedObject && onSavePrefabVariantFromObject && onSavePrefabVariantFromObject(selectedObject.id)}
                        disabled={!selectedObject || selectedObject.prefabId !== prefab.id || selectedObject.id === prefab.sourceObjectId || !onSavePrefabVariantFromObject}
                        title={selectedObject && selectedObject.prefabId === prefab.id && selectedObject.id !== prefab.sourceObjectId
                          ? 'Save the selected linked instance as a reusable prefab variant'
                          : 'Select a linked instance of this prefab to capture a variant'}
                      >
                        Use Selected
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => onDeletePrefab && onDeletePrefab(prefab.id)}
                        disabled={!onDeletePrefab}
                        title="Delete this prefab"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: '#94a3b8' }}>
                    <span>Rev {prefab.revision || 1}</span>
                    <span>Instances {prefabUsage.usageByPrefab.get(prefab.id) || 0}</span>
                    <span>Variants {Array.isArray(prefab.variants) ? prefab.variants.length : 0}</span>
                    <span>Source {prefabUsage.sourceSceneByPrefab.get(prefab.id)?.name || 'Missing'}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {Array.isArray(prefab.variants) && prefab.variants.length > 0 ? prefab.variants.map((variant) => {
                      const isSelectedVariant = selectedObject && selectedObject.prefabId === prefab.id && selectedObject.variantId === variant.id;
                      return (
                        <div
                          key={variant.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                            gap: 6,
                            alignItems: 'center',
                            padding: '6px 8px',
                            border: isSelectedVariant ? '1px solid rgba(59,130,246,0.8)' : '1px solid rgba(148,163,184,0.2)',
                            borderRadius: 4,
                            background: isSelectedVariant ? 'rgba(59,130,246,0.12)' : '#0f172a',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{variant.name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {variant.id} · Used {prefabUsage.usageByVariant.get(`${prefab.id}::${variant.id}`) || 0}
                            </div>
                          </div>
                          <button
                            className="btn btn-sm"
                            onClick={() => onRenamePrefabVariant && onRenamePrefabVariant(prefab.id, variant.id)}
                            disabled={!onRenamePrefabVariant}
                            title="Rename this variant"
                          >
                            Rename
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => onDeletePrefabVariant && onDeletePrefabVariant(prefab.id, variant.id)}
                            disabled={!onDeletePrefabVariant}
                            title="Delete this variant"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    }) : (
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>No variants yet. Select a linked instance and use “Use Selected” to capture one.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAudio && (
          <button type="button" className="btn btn-sm btn-section-toggle" style={{ borderBottom: 'none' }} onClick={() => toggle('audio')}>
            <Icon name={expanded.audio ? 'chevronDown' : 'chevronRight'} />
            <Icon name="audio" />
            Audio ({allAudios.length})
          </button>
        )}
        {showAudio && expanded.audio && (
          <div style={{ padding: 8 }}>
            <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={() => audioFileInputRef.current && audioFileInputRef.current.click()}>
                <Icon name="import" />
                Import Audio
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>MP3, OGG, WAV, M4A, FLAC, AAC</span>
              <input
                ref={audioFileInputRef}
                type="file"
                accept={AUDIO_ACCEPT}
                multiple
                onChange={(e) => { importAudioFiles(e.target.files); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
            </div>
            {allAudios.length > 3 && (
              <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                <input
                  type="text"
                  value={audioQuery}
                  onChange={(e) => setAudioQuery(e.target.value)}
                  placeholder={`Search ${audios.length} audio file${audios.length === 1 ? '' : 's'}...`}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {visibleAudios.length} result{visibleAudios.length === 1 ? '' : 's'}
                </div>
              </div>
            )}
            <div style={{ maxHeight: '42vh', overflowY: 'auto', paddingRight: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {audios.length === 0 && <div style={{ color: '#94a3b8', fontSize: 11 }}>No audio files. Drop or import MP3, OGG, WAV.</div>}
                {audios.length > 0 && visibleAudios.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>No audio files match the current search.</div>
                )}
                {visibleAudios.map((aud) => (
                  <div key={aud.id} style={{ display: 'grid', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#111827' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aud.name || aud.id}>{aud.name || aud.id}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aud.id}>{aud.id}</div>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => onPatchProject({ assets: (project.assets || []).filter(a => a.id !== aud.id) })} aria-label={`Delete audio ${aud.name || aud.id}`}><Icon name="delete" /></button>
                    </div>
                    {(aud.previewUrl || aud.url || aud.src) ? (
                      <audio controls preload="none" style={{ width: '100%', minWidth: 0, display: 'block' }}>
                        <source src={aud.previewUrl || aud.url || aud.src} />
                      </audio>
                    ) : (
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>No preview source</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      <SpriteSheetSlicerModal
        open={showSpriteSheetSlicer}
        images={sliceableImages}
        initialAssetId={spriteSheetAssetId}
        onClose={() => setShowSpriteSheetSlicer(false)}
        onSlice={createSpriteFrames}
        onImportImages={importImageFiles}
      />
    </>
  );
}
