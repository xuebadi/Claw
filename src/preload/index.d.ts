import { ElectronAPI } from '@electron-toolkit/preload'

interface Api {
  // App
  getVersion: () => Promise<string>
  getPath: (name: string) => Promise<string>
  openExternal: (url: string) => Promise<void>

  // Store
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, value: any) => Promise<void>
  storeDelete: (key: string) => Promise<void>

  // Screenshot
  captureScreen: (options?: { region?: { x: number; y: number; width: number; height: number } }) =>
    Promise<{ dataUrl: string; width: number; height: number; timestamp: number }>
  getScreenSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>

  // Screen
  getPrimaryScreenSize: () => Promise<{ width: number; height: number; scaleFactor: number }>
  getAllDisplays: () => Promise<any[]>

  // Mouse control
  mouseMove: (x: number, y: number) => Promise<boolean>
  mouseClick: (button?: 'left' | 'right' | 'middle', action?: 'down' | 'up' | 'click' | 'doubleClick') => Promise<boolean>
  mouseScroll: (deltaX: number, deltaY: number) => Promise<boolean>
  mouseDrag: (startX: number, startY: number, endX: number, endY: number, button?: 'left' | 'right') => Promise<boolean>

  // Keyboard
  keyboardType: (text: string) => Promise<boolean>
  keyboardPress: (key: string) => Promise<boolean>
  keyboardHotkey: (keys: string[]) => Promise<boolean>

  // Agent
  sendToAgent: (message: string, context?: any) => Promise<{ action?: string; reasoning?: string; screenshot?: string; error?: string }>
  getAgentStatus: () => Promise<{ connected: boolean; model: string; mode: string }>

  // Tasks
  getTasks: () => Promise<any[]>
  saveTask: (task: any) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  clearTasks: () => Promise<void>

  // Window
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>

  // Events
  onNavigate: (callback: (path: string) => void) => void
  onNewTask: (callback: () => void) => void
  onStartRecording: (callback: () => void) => void
  onStopRecording: (callback: () => void) => void
  onShowAbout: (callback: () => void) => void
  onCheckUpdates: (callback: () => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
