import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // App
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),

  // Store
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key: string) => ipcRenderer.invoke('store:delete', key),

  // Screenshot
  captureScreen: (options?: { region?: { x: number; y: number; width: number; height: number } }) =>
    ipcRenderer.invoke('screenshot:capture', options),
  getScreenSources: () => ipcRenderer.invoke('screenshot:get-sources'),

  // Screen info
  getPrimaryScreenSize: () => ipcRenderer.invoke('screen:get-primary-size'),
  getAllDisplays: () => ipcRenderer.invoke('screen:get-all-displays'),

  // Mouse control
  mouseMove: (x: number, y: number) => ipcRenderer.invoke('control:mouse-move', x, y),
  mouseClick: (button?: 'left' | 'right' | 'middle', action?: 'down' | 'up' | 'click' | 'doubleClick') =>
    ipcRenderer.invoke('control:mouse-click', button, action),
  mouseScroll: (deltaX: number, deltaY: number) => ipcRenderer.invoke('control:mouse-scroll', deltaX, deltaY),
  mouseDrag: (startX: number, startY: number, endX: number, endY: number, button?: 'left' | 'right') =>
    ipcRenderer.invoke('control:mouse-drag', startX, startY, endX, endY, button),

  // Keyboard control
  keyboardType: (text: string) => ipcRenderer.invoke('control:keyboard-type', text),
  keyboardPress: (key: string) => ipcRenderer.invoke('control:keyboard-press', key),
  keyboardHotkey: (keys: string[]) => ipcRenderer.invoke('control:keyboard-hotkey', keys),

  // Agent
  sendToAgent: (message: string, context?: any) => ipcRenderer.invoke('agent:send-message', message, context),
  getAgentStatus: () => ipcRenderer.invoke('agent:get-status'),

  // Tasks
  getTasks: () => ipcRenderer.invoke('tasks:get-all'),
  saveTask: (task: any) => ipcRenderer.invoke('tasks:save', task),
  deleteTask: (taskId: string) => ipcRenderer.invoke('tasks:delete', taskId),
  clearTasks: () => ipcRenderer.invoke('tasks:clear'),

  // Window
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Events
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on('navigate', (_, path) => callback(path))
  },
  onNewTask: (callback: () => void) => {
    ipcRenderer.on('new-task', () => callback())
  },
  onStartRecording: (callback: () => void) => {
    ipcRenderer.on('start-recording', () => callback())
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on('stop-recording', () => callback())
  },
  onShowAbout: (callback: () => void) => {
    ipcRenderer.on('show-about', () => callback())
  },
  onCheckUpdates: (callback: () => void) => {
    ipcRenderer.on('check-updates', () => callback())
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
