import { logger } from './logger'
import { getStore } from './store'
import { screenshot } from './services/screenshot'

interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  image?: string
}

interface AgentResponse {
  action?: string
  reasoning?: string
  screenshot?: string
  error?: string
}

// Agent state
let agentConnected = false
let agentModel: string = 'UI-TARS-1.5-7B'

export async function initAgent(): Promise<void> {
  logger.info('初始化 Agent...')
  
  const settings = getStore().get('settings')
  agentModel = settings.model || 'UI-TARS-1.5-7B'
  
  // Check if model endpoint is configured
  const apiEndpoint = settings.apiEndpoint
  if (apiEndpoint) {
    try {
      // Try to connect to the model server
      const response = await fetch(`${apiEndpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.apiKey || ''}`
        },
        signal: AbortSignal.timeout(15000)
      })
      
      if (response.ok) {
        agentConnected = true
        logger.info('Agent 已连接到模型服务器:', apiEndpoint)
      } else {
        logger.warn('Agent 无法连接到模型服务器，状态:', response.status)
        agentConnected = false
      }
    } catch (error) {
      logger.warn('Agent 无法连接到模型服务器:', error)
      agentConnected = false
    }
  } else {
    logger.info('未配置模型服务器端点，将使用本地模式')
  }
}

export async function sendToAgent(
  message: string, 
  context?: {
    screenshot?: string
    taskHistory?: any[]
    screenSize?: { width: number; height: number }
  }
): Promise<AgentResponse> {
  logger.info('发送消息到 Agent:', message.substring(0, 100))
  
  const settings = getStore().get('settings')
  const apiEndpoint = settings.apiEndpoint
  const apiKey = settings.apiKey
  
  // Prepare messages
  const messages: AgentMessage[] = []
  
  // System prompt (Chinese)
  const systemPrompt = `你是学霸帝Claw，一个基于 UI-TARS-1.5-7B 模型的智能桌面助手。

你的能力：
1. 屏幕识别：分析截取的屏幕图像，理解界面内容
2. 鼠标控制：移动、点击、拖拽鼠标
3. 键盘控制：输入文字、按下快捷键
4. 任务规划：将复杂任务分解为可执行的步骤

工作流程：
1. 理解用户的自然语言指令
2. 截取屏幕了解当前状态
3. 规划操作步骤
4. 执行操作并反馈结果
5. 确认任务完成

重要规则：
- 在执行任何操作前，先截屏了解当前状态
- 每次操作后截屏确认结果
- 用中文回复
- 简洁明了地描述你在做什么

当前屏幕信息：${context?.screenSize ? `${context.screenSize.width}x${context.screenSize.height}` : '未知'}`

  messages.push({ role: 'system', content: systemPrompt })
  
  // Add screenshot if available
  if (context?.screenshot) {
    messages.push({
      role: 'user',
      content: message,
      image: context.screenshot
    })
  } else {
    messages.push({ role: 'user', content: message })
  }
  
  // If API endpoint is configured, send to model
  if (apiEndpoint && agentConnected) {
    try {
      const response = await fetch(`${apiEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey || ''}`
        },
        body: JSON.stringify({
          model: agentModel,
          messages: messages.map(m => ({
            role: m.role,
            content: m.image 
              ? [
                  { type: 'text', text: m.content },
                  { type: 'image_url', image_url: { url: m.image } }
                ]
              : m.content
          })),
          max_tokens: 4096,
          stream: false
        }),
        signal: AbortSignal.timeout(300000) // 5 min timeout (CPU-only inference is slow)
      })
      
      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`)
      }
      
      const data = await response.json()
      const assistantMessage = data.choices?.[0]?.message?.content || ''
      
      logger.info('Agent 响应:', assistantMessage.substring(0, 100))
      
      // Parse agent response and extract actions
      return parseAgentResponse(assistantMessage)
    } catch (error) {
      logger.error('Agent API 请求失败:', error)
      return {
        error: `Agent 请求失败: ${error}`
      }
    }
  } else {
    // Demo mode - no model server connected
    logger.info('Agent 运行在演示模式')
    return {
      action: 'demo',
      reasoning: '当前未连接到模型服务器。请在设置中配置模型端点后重试。\n\n演示模式下可用功能：\n- 屏幕截图\n- 鼠标控制\n- 键盘输入\n- 任务历史记录\n\n要连接真实模型，请：\n1. 下载 UI-TARS-1.5-7B 模型\n2. 使用 vLLM 或其他推理服务器启动\n3. 在设置中填入服务器地址'
    }
  }
}

function parseAgentResponse(response: string): AgentResponse {
  // Parse the agent's response to extract actions
  // The agent should respond in a structured format
  const lines = response.split('\n')
  
  let action = ''
  let reasoning = ''
  
  for (const line of lines) {
    if (line.startsWith('## 行动：') || line.startsWith('**行动：**')) {
      action = line.replace(/^(## )?\*\*行动：\*\*\s*/, '').trim()
    } else if (line.startsWith('## 思考：') || line.startsWith('**思考：**')) {
      reasoning = line.replace(/^(## )?\*\*思考：\*\*\s*/, '').trim()
    }
  }
  
  // If no structured format, use the whole response as reasoning
  if (!action && !reasoning) {
    reasoning = response
  }
  
  return {
    action: action || undefined,
    reasoning,
    screenshot: undefined
  }
}

export function getAgentStatus(): { connected: boolean; model: string } {
  return {
    connected: agentConnected,
    model: agentModel
  }
}
