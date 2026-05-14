import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '../logger'

const execAsync = promisify(exec)

// Mouse control using AppleScript on macOS
export const controlMouse = {
  async move(x: number, y: number): Promise<boolean> {
    try {
      const script = `osascript -e 'tell application "System Events" to set position of (first process whose frontmost is true) to {${x}, ${y}}'`
      await execAsync(`osascript -e 'tell application "System Events" to set the position of the mouse to {${x}, ${y}}'`)
      logger.info(`鼠标移动到 (${x}, ${y})`)
      return true
    } catch (error) {
      logger.error('鼠标移动失败:', error)
      // Fallback: use cliclick or mouse100
      try {
        await execAsync(`/usr/bin cliclick m:${x},${y}`)
        return true
      } catch {
        // cliclick not installed, try mouse100
        try {
          await execAsync(`mouse100 move ${x} ${y}`)
          return true
        } catch {
          logger.error('所有鼠标控制方法均失败')
          return false
        }
      }
    }
  },

  async click(button: 'left' | 'right' | 'middle' = 'left', action: 'click' | 'doubleClick' | 'down' | 'up' = 'click'): Promise<boolean> {
    try {
      let script = ''
      switch (action) {
        case 'click':
          script = `osascript -e 'tell application "System Events" to click'`
          break
        case 'doubleClick':
          script = `osascript -e 'tell application "System Events" to click at (get the position of the mouse)'`
          // Usecliclick for double click
          await execAsync(`/usr/bin/cliclick dc:`)
          return true
        case 'down':
          script = button === 'left' 
            ? `osascript -e 'tell application "System Events" to mouse down'`
            : `osascript -e 'tell application "System Events" to mouse down button number 2'`
          break
        case 'up':
          script = button === 'left'
            ? `osascript -e 'tell application "System Events" to mouse up'`
            : `osascript -e 'tell application "System Events" to mouse up button number 2'`
          break
      }
      await execAsync(script)
      logger.info(`鼠标${button}键${action}`)
      return true
    } catch (error) {
      logger.error('鼠标点击失败:', error)
      return false
    }
  },

  async scroll(deltaX: number, deltaY: number): Promise<boolean> {
    try {
      // Positive deltaY = scroll down, negative = scroll up
      const clicks = Math.abs(deltaY) / 100
      if (clicks < 1) return true
      
      const direction = deltaY > 0 ? 'wd' : 'wu'
      await execAsync(`/usr/bin/cliclick ${direction}:${Math.round(clicks)}`)
      logger.info(`鼠标滚动 (${deltaX}, ${deltaY})`)
      return true
    } catch (error) {
      logger.error('鼠标滚动失败:', error)
      return false
    }
  },

  async drag(startX: number, startY: number, endX: number, endY: number, button: 'left' | 'right' = 'left'): Promise<boolean> {
    try {
      // Move to start position
      await execAsync(`/usr/bin/cliclick m:${startX},${startY}`)
      await execAsync(`/usr/bin/cliclick cd:`) // click down
      await execAsync(`/usr/bin/cliclick m:${endX},${endY}`)
      await execAsync(`/usr/bin/cliclick cu:`) // click up
      logger.info(`鼠标拖拽 (${startX},${startY}) -> (${endX},${endY})`)
      return true
    } catch (error) {
      logger.error('鼠标拖拽失败:', error)
      return false
    }
  }
}

// Keyboard control using AppleScript on macOS
export const controlKeyboard = {
  async type(text: string): Promise<boolean> {
    try {
      // Escape special characters
      const escapedText = text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
      
      const script = `osascript -e 'tell application "System Events" to keystroke "${escapedText}"'`
      await execAsync(script)
      logger.info(`键盘输入: "${text.substring(0, 20)}..."`)
      return true
    } catch (error) {
      logger.error('键盘输入失败:', error)
      return false
    }
  },

  async press(key: string): Promise<boolean> {
    try {
      // Map common key names
      const keyMap: Record<string, string> = {
        'return': 'return',
        'enter': 'return',
        'tab': 'tab',
        'space': 'space',
        'escape': 'escape',
        'esc': 'escape',
        'delete': 'delete',
        'backspace': (await import('os').then(m => m.platform() === 'darwin')) ? 'ASCII 8' : 'backspace',
        'up': 'up arrow',
        'down': 'down arrow',
        'left': 'left arrow',
        'right': 'right arrow',
        'up arrow': 'up arrow',
        'down arrow': 'down arrow',
        'left arrow': 'left arrow',
        'right arrow': 'right arrow',
        'pageup': 'page up',
        'pagedown': 'page down',
        'home': 'home',
        'end': 'end',
        'help': 'help',
        'forward delete': 'forward delete'
      }
      
      const mappedKey = keyMap[key.toLowerCase()] || key
      const script = `osascript -e 'tell application "System Events" to keystroke ${mappedKey}'`
      await execAsync(script)
      logger.info(`键盘按键: ${key}`)
      return true
    } catch (error) {
      logger.error('键盘按键失败:', error)
      return false
    }
  },

  async hotkey(keys: string[]): Promise<boolean> {
    try {
      if (keys.length === 0) return false
      
      // Parse keys - support Cmd, Ctrl, Alt, Shift modifiers
      const modifiers: string[] = []
      let key = ''
      
      for (const k of keys) {
        const lower = k.toLowerCase()
        if (['cmd', 'command', 'cmdorctrl', 'control', 'ctrl', 'alt', 'shift'].includes(lower)) {
          const modMap: Record<string, string> = {
            'cmd': 'command down',
            'command': 'command down',
            'cmdorctrl': 'command down',
            'control': 'control down',
            'ctrl': 'control down',
            'alt': 'option down',
            'shift': 'shift down'
          }
          modifiers.push(modMap[lower])
        } else {
          key = k
        }
      }
      
      if (!key) return false
      
      const modStr = modifiers.length > 0 ? `using ${modifiers.join(' and ')}` : ''
      const script = `osascript -e 'tell application "System Events" to keystroke "${key}" ${modStr}'`
      await execAsync(script)
      logger.info(`快捷键: ${keys.join('+')}`)
      return true
    } catch (error) {
      logger.error('快捷键失败:', error)
      return false
    }
  }
}
