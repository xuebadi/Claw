import { desktopCapturer, screen } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { app } from 'electron'
import { logger } from '../logger'

const execAsync = promisify(exec)

interface ScreenshotResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

interface Region {
  x: number
  y: number
  width: number
  height: number
}

export async function screenshot(region?: Region): Promise<ScreenshotResult> {
  logger.info('执行截图...', region ? JSON.stringify(region) : '全屏')
  
  const timestamp = Date.now()
  const tmpPath = join(app.getPath('temp'), `screenshot_${timestamp}.png`)
  
  try {
    // Use macOS screencapture command
    let cmd = `screencapture -x -m "${tmpPath}"`
    
    if (region) {
      // macOS screencapture doesn't support region directly
      // We'll capture full screen and crop
      cmd = `screencapture -x "${tmpPath}"`
    }
    
    await execAsync(cmd)
    
    // Read the screenshot and convert to base64
    const { readFile } = await import('fs/promises')
    const imageBuffer = await readFile(tmpPath)
    const base64 = imageBuffer.toString('base64')
    
    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size
    
    // Clean up temp file
    try {
      await unlink(tmpPath)
    } catch {
      // Ignore cleanup errors
    }
    
    const result: ScreenshotResult = {
      dataUrl: `data:image/png;base64,${base64}`,
      width: region?.width || width,
      height: region?.height || height,
      timestamp
    }
    
    logger.info(`截图完成: ${result.width}x${result.height}`)
    return result
  } catch (error) {
    logger.error('截图失败:', error)
    
    // Fallback: try using Electron's desktopCapturer
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      
      if (sources.length > 0) {
        const thumbnail = sources[0].thumbnail
        return {
          dataUrl: thumbnail.toDataURL(),
          width: thumbnail.getSize().width,
          height: thumbnail.getSize().height,
          timestamp
        }
      }
    } catch (fallbackError) {
      logger.error('Fallback 截图也失败:', fallbackError)
    }
    
    throw error
  }
}

export async function captureScreenThumbnail(): Promise<string> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 800, height: 600 }
    })
    
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL()
    }
    
    throw new Error('没有可用的屏幕源')
  } catch (error) {
    logger.error('获取屏幕缩略图失败:', error)
    throw error
  }
}
