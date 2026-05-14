import { ipcMain, app, BrowserWindow, desktopCapturer, shell, screen } from 'electron'
import { logger } from './logger'
import { getStore } from './store'
import { screenshot } from './services/screenshot'
import { controlMouse, controlKeyboard } from './services/control'
import { sendToAgent } from './agent'

export function setupIpcHandlers(): void {
  // ============ App Info ============
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:get-path', (_, name: string) => {
    return app.getPath(name as any)
  })

  ipcMain.handle('app:open-external', async (_, url: string) => {
    await shell.openExternal(url)
  })

  // ============ Store ============
  ipcMain.handle('store:get', (_, key: string) => {
    return getStore().get(key)
  })

  ipcMain.handle('store:set', (_, key: string, value: any) => {
    getStore().set(key, value)
  })

  ipcMain.handle('store:delete', (_, key: string) => {
    getStore().delete(key)
  })

  // ============ Screenshot ============
  ipcMain.handle('screenshot:capture', async (_, options?: { region?: { x: number; y: number; width: number; height: number } }) => {
    try {
      return await screenshot(options?.region)
    } catch (error) {
      logger.error('截图失败:', error)
      throw error
    }
  })

  ipcMain.handle('screenshot:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 300, height: 200 }
      })
      return sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL()
      }))
    } catch (error) {
      logger.error('获取屏幕源失败:', error)
      throw error
    }
  })

  // ============ Screen Info ============
  ipcMain.handle('screen:get-primary-size', () => {
    const primaryDisplay = screen.getPrimaryDisplay()
    return {
      width: primaryDisplay.size.width,
      height: primaryDisplay.size.height,
      scaleFactor: primaryDisplay.scaleFactor
    }
  })

  ipcMain.handle('screen:get-all-displays', () => {
    return screen.getAllDisplays().map(d => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === screen.getPrimaryDisplay().id
    }))
  })

  // ============ Mouse Control ============
  ipcMain.handle('control:mouse-move', (_, x: number, y: number) => {
    return controlMouse.move(x, y)
  })

  ipcMain.handle('control:mouse-click', (_, button: 'left' | 'right' | 'middle', action: 'down' | 'up' | 'click' | 'doubleClick') => {
    return controlMouse.click(button, action)
  })

  ipcMain.handle('control:mouse-scroll', (_, deltaX: number, deltaY: number) => {
    return controlMouse.scroll(deltaX, deltaY)
  })

  ipcMain.handle('control:mouse-drag', (_, startX: number, startY: number, endX: number, endY: number, button: 'left' | 'right' = 'left') => {
    return controlMouse.drag(startX, startY, endX, endY, button)
  })

  // ============ Keyboard Control ============
  ipcMain.handle('control:keyboard-type', (_, text: string) => {
    return controlKeyboard.type(text)
  })

  ipcMain.handle('control:keyboard-hotkey', (_, keys: string[]) => {
    return controlKeyboard.hotkey(keys)
  })

  ipcMain.handle('control:keyboard-press', (_, key: string) => {
    return controlKeyboard.press(key)
  })

  // ============ Agent Communication ============
  ipcMain.handle('agent:send-message', async (_, message: string, context?: any) => {
    try {
      return await sendToAgent(message, context)
    } catch (error) {
      logger.error('Agent 消息发送失败:', error)
      throw error
    }
  })

  ipcMain.handle('agent:get-status', () => {
    return {
      connected: true,
      model: getStore().get('settings.model', 'UI-TARS-1.5-7B'),
      mode: getStore().get('settings.mode', 'local')
    }
  })

  // ============ Window Control ============
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.isMaximized() ?? false
  })

  // ============ Task History ============
  ipcMain.handle('tasks:get-all', () => {
    return getStore().get('tasks', [])
  })

  ipcMain.handle('tasks:save', (_, task: any) => {
    const tasks = getStore().get('tasks', []) as any[]
    const existingIndex = tasks.findIndex(t => t.id === task.id)
    if (existingIndex >= 0) {
      tasks[existingIndex] = task
    } else {
      tasks.push(task)
    }
    getStore().set('tasks', tasks)
  })

  ipcMain.handle('tasks:delete', (_, taskId: string) => {
    const tasks = getStore().get('tasks', []) as any[]
    getStore().set('tasks', tasks.filter(t => t.id !== taskId))
  })

  ipcMain.handle('tasks:clear', () => {
    getStore().set('tasks', [])
  })

  logger.info('IPC handlers 注册完成')
}
