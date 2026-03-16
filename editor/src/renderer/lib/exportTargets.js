export const NATIVE_EXPORT_TARGETS = [
  { value: 'electron-exe', label: 'Electron based EXE' },
  { value: 'pwa', label: 'PWA' },
  { value: 'html-zip', label: 'HTML/ZIP' },
  { value: 'single-html', label: 'Single HTML' },
  { value: 'tarball', label: 'Tarball' },
];

export const BROWSER_EXPORT_TARGETS = [
  { value: 'single-html', label: 'Single HTML' },
];

export function getExportTargetOptions(hasNativeExport) {
  return hasNativeExport ? NATIVE_EXPORT_TARGETS : BROWSER_EXPORT_TARGETS;
}

export function getDefaultExportTarget(preferredTarget, hasNativeExport) {
  const options = getExportTargetOptions(hasNativeExport);
  if (options.some((option) => option.value === preferredTarget)) return preferredTarget;
  return (options[0] && options[0].value) || 'single-html';
}
