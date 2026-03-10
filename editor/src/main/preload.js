const { contextBridge, ipcRenderer } = require('electron');
// Expose safe APIs here
contextBridge.exposeInMainWorld('api', {
  exportBuild: (payload) => ipcRenderer.invoke('export:build', payload),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  openProjectDialog: () => ipcRenderer.invoke('projects:openDialog'),
  loadProject: (projectPath) => ipcRenderer.invoke('projects:load', { projectPath }),
  saveProject: (payload) => ipcRenderer.invoke('projects:save', payload),
  saveProjectAs: (payload) => ipcRenderer.invoke('projects:saveAs', payload),
  listScripts: (projectPath) => ipcRenderer.invoke('scripts:list', { projectPath }),
  loadScript: (projectPath, filePath) => ipcRenderer.invoke('scripts:load', { projectPath, filePath }),
  saveScript: (projectPath, filePath, content) => ipcRenderer.invoke('scripts:save', { projectPath, filePath, content }),
  deleteScript: (projectPath, filePath) => ipcRenderer.invoke('scripts:delete', { projectPath, filePath }),
  openInEditor: (filePath, editorOrOptions) => (
    typeof editorOrOptions === 'string'
      ? ipcRenderer.invoke('editor:openFile', { filePath, editor: editorOrOptions })
      : ipcRenderer.invoke('editor:openFile', { filePath, ...(editorOrOptions || {}) })
  ),
  onExportProgress: (handler) => {
    const ch = 'export:progress';
    const cb = (_event, payload) => handler(payload);
    ipcRenderer.on(ch, cb);
    return () => ipcRenderer.removeListener(ch, cb);
  },
  onMenuEvent: (handler) => {
    const channels = ['menu-save', 'menu-save-as', 'menu-load', 'menu-export'];
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
