const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');

// Detect dev mode: check if Vite dev server is running on 5173
function checkViteRunning() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(5173, '127.0.0.1');
  });
}

const { Menu, shell } = require('electron');

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Auto-detect: if Vite is running use it, otherwise load built files
  const isDev = process.env.NODE_ENV === 'development'
    || process.argv.includes('--dev')
    || await checkViteRunning();

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    const distPath = path.join(__dirname, '../renderer/dist/index.html');
    win.loadFile(distPath);
  }

  // Custom menu
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => { win.webContents.send('menu-save'); } },
        { label: 'Load', accelerator: 'CmdOrCtrl+O', click: () => { win.webContents.send('menu-load'); } },
        { label: 'Export', accelerator: 'CmdOrCtrl+E', click: () => { win.webContents.send('menu-export'); } },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Koz Engine GitHub',
          click: async () => {
            await shell.openExternal('https://github.com/DavidKozdra/Koz_Engine_boilerPlate');
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
