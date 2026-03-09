const { contextBridge } = require('electron');
// Expose safe APIs here
contextBridge.exposeInMainWorld('api', {
  // Example: add methods for IPC here
});
