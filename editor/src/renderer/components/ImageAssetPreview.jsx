import React from 'react';

function imageSrc(asset) {
  return asset && (asset.previewUrl || asset.url || asset.src) ? (asset.previewUrl || asset.url || asset.src) : null;
}

function hasValidFrameRect(asset) {
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

export default function ImageAssetPreview({
  asset,
  assetById,
  alt = '',
  fit = 'cover',
  style,
  imageStyle,
  fallback = null,
}) {
  const sourceAsset = asset && asset.sourceAssetId && assetById ? assetById.get(asset.sourceAssetId) : null;
  const src = imageSrc(sourceAsset || asset);
  const canCrop = !!(
    sourceAsset
    && hasValidFrameRect(asset)
    && Number.isFinite(sourceAsset.width)
    && Number.isFinite(sourceAsset.height)
    && sourceAsset.width > 0
    && sourceAsset.height > 0
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}>
      {!src && fallback}
      {src && canCrop && (
        <img
          src={src}
          alt={alt}
          style={{
            position: 'absolute',
            left: `${-((asset.frameRect.x / asset.frameRect.w) * 100)}%`,
            top: `${-((asset.frameRect.y / asset.frameRect.h) * 100)}%`,
            width: `${(sourceAsset.width / asset.frameRect.w) * 100}%`,
            height: `${(sourceAsset.height / asset.frameRect.h) * 100}%`,
            maxWidth: 'none',
            objectFit: 'fill',
            pointerEvents: 'none',
            ...imageStyle,
          }}
        />
      )}
      {src && !canCrop && (
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            display: 'block',
            pointerEvents: 'none',
            ...imageStyle,
          }}
        />
      )}
    </div>
  );
}
