const IMAGE_FILE_EXT_PATTERN = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

export function imageSrc(asset) {
  return asset && (asset.previewUrl || asset.url || asset.src)
    ? (asset.previewUrl || asset.url || asset.src)
    : null;
}

export function isImageAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.kind === 'image') return true;
  if (asset.mime && String(asset.mime).startsWith('image/')) return true;
  const src = String(asset.url || asset.src || asset.path || asset.previewUrl || '').toLowerCase();
  return IMAGE_FILE_EXT_PATTERN.test(src);
}

export function hasValidFrameRect(asset) {
  const rect = asset && asset.frameRect;
  return !!(
    rect
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.w)
    && Number.isFinite(rect.h)
    && rect.w > 0
    && rect.h > 0
  );
}

export function resolveImageAssetRenderInfo(assetById, assetOrId) {
  if (!assetById || !assetOrId) return null;
  const asset = typeof assetOrId === 'string' ? assetById.get(assetOrId) : assetOrId;
  if (!asset) return null;
  const sourceAsset = asset.sourceAssetId ? (assetById.get(asset.sourceAssetId) || null) : null;
  const renderAsset = sourceAsset || asset;
  const src = imageSrc(renderAsset);
  return {
    asset,
    sourceAsset,
    src,
    frameRect: hasValidFrameRect(asset) ? asset.frameRect : null,
  };
}

function isImportableImageFile(file) {
  if (!file) return false;
  if (String(file.type || '').startsWith('image/')) return true;
  return IMAGE_FILE_EXT_PATTERN.test(String(file.name || '').toLowerCase());
}

function imageMimeForFile(file) {
  if (file && file.type) return file.type;
  const ext = String(file && file.name ? file.name.split('.').pop() : '').toLowerCase();
  if (ext === 'jpg') return 'image/jpeg';
  if (ext) return `image/${ext}`;
  return 'image/png';
}

export function readImageFilesAsAssets(fileList) {
  const files = Array.from(fileList || []).filter(isImportableImageFile);
  if (files.length === 0) return Promise.resolve([]);
  const timestamp = Date.now().toString(36);
  return Promise.all(files.map((file, index) => (
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target && event.target.result ? String(event.target.result) : null;
        if (!dataUrl) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.onload = () => {
          resolve({
            id: `img_${timestamp}_${index + 1}`,
            kind: 'image',
            mime: imageMimeForFile(file),
            name: String(file.name || 'image').replace(/\.[^.]+$/, ''),
            url: dataUrl,
            previewUrl: dataUrl,
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
          });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    })
  ))).then((assets) => assets.filter(Boolean));
}

export function buildSpriteFrameAssets(sourceAsset, frames) {
  if (!sourceAsset || !Array.isArray(frames) || frames.length === 0) return [];
  const timestamp = Date.now().toString(36);
  const previewUrl = sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src || null;
  return frames.map((frame, index) => ({
    id: `frm_${timestamp}_${index}`,
    kind: 'image',
    mime: sourceAsset.mime || 'image/png',
    name: frame && frame.name ? frame.name : `frame_${index + 1}`,
    sourceAssetId: sourceAsset.id,
    frameRect: frame && frame.frameRect ? { ...frame.frameRect } : null,
    width: Number.isFinite(frame && frame.width) ? frame.width : 0,
    height: Number.isFinite(frame && frame.height) ? frame.height : 0,
    previewUrl,
  }));
}
