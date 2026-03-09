const { contextBridge, ipcRenderer } = require('electron');
// Expose safe APIs here
contextBridge.exposeInMainWorld('api', {
  exportBuild: (payload) => ipcRenderer.invoke('export:build', payload),
  onExportProgress: (handler) => {
    const ch = 'export:progress';
    const cb = (_event, payload) => handler(payload);
    ipcRenderer.on(ch, cb);
    return () => ipcRenderer.removeListener(ch, cb);
  },
  onMenuEvent: (handler) => {
    const channels = ['menu-save', 'menu-load', 'menu-export'];
    const listeners = channels.map((ch) => {
      const cb = () => handler(ch);
      ipcRenderer.on(ch, cb);
      return { ch, cb };
    });
    return () => {
      listeners.forEach(({ ch, cb }) => ipcRenderer.removeListener(ch, cb));
    };
  },
});
