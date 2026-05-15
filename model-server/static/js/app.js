// 学霸帝Claw 模型服务器 - 控制面板 JavaScript

const API_BASE = '';

// ============================================================
// 状态轮询
// ============================================================

let pollInterval = null;

function startPolling() {
    updateStatus();
    pollInterval = setInterval(updateStatus, 3000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

async function updateStatus() {
    try {
        const resp = await fetch(`${API_BASE}/api/status`);
        const data = await resp.json();
        
        // 更新服务器状态
        document.getElementById('serverStatus').innerHTML = '● 运行中';
        document.getElementById('serverStatus').className = 'value status-online';
        
        // 更新模型状态
        if (data.model && data.model.loaded) {
            document.getElementById('modelStatus').innerHTML = '● 已加载';
            document.getElementById('modelStatus').className = 'value status-online';
            
            // 显示模型信息
            showModelInfo(data.model);
            
            // 启用卸载按钮
            document.getElementById('unloadBtn').disabled = false;
            document.getElementById('loadBtn').disabled = true;
        } else {
            document.getElementById('modelStatus').innerHTML = '● 未加载';
            document.getElementById('modelStatus').className = 'value status-offline';
            hideModelInfo();
            document.getElementById('unloadBtn').disabled = true;
            document.getElementById('loadBtn').disabled = false;
        }
        
        // 更新运行时间和请求次数
        if (data.server) {
            document.getElementById('uptime').textContent = data.server.uptime || '00:00:00';
        }
        if (data.requests) {
            document.getElementById('requestCount').textContent = data.requests.total || 0;
        }
    } catch (e) {
        console.error('状态更新失败:', e);
        document.getElementById('serverStatus').innerHTML = '● 断开连接';
        document.getElementById('serverStatus').className = 'value status-danger';
    }
}

// ============================================================
// 模型管理
// ============================================================

async function loadModel() {
    const btn = document.getElementById('loadBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    btn.disabled = true;
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '连接服务器...';
    
    const val = document.getElementById('modelSelect').value;
    
    try {
        if (val.startsWith('gguf:')) {
            const modelId = val.split(':')[1];
            addLog('info', `加载 GGUF 模型: ${modelId}`);
            await loadModelSSE(
                `${API_BASE}/api/gguf/load/stream`,
                { model_id: modelId, n_ctx: 4096, n_threads: null, n_gpu_layers: 0 }
            );
        } else if (val.startsWith('transformers:')) {
            const modelName = val.split(':')[1];
            addLog('info', `加载 Transformers 模型: ${modelName}`);
            await loadModelSSE(
                `${API_BASE}/api/model/load/stream`,
                {
                    model_name: modelName,
                    model_path: document.getElementById('modelPath').value || null,
                    device: document.getElementById('deviceSelect').value === 'auto' ? null : document.getElementById('deviceSelect').value,
                    load_in_8bit: document.getElementById('quantSelect').value === '8bit',
                    load_in_4bit: document.getElementById('quantSelect').value === '4bit',
                }
            );
        } else {
            throw new Error('请选择模型');
        }
    } catch (e) {
        addLog('error', `加载失败: ${e.message}`);
        progressText.textContent = `❌ ${e.message}`;
        progressFill.style.background = 'linear-gradient(90deg, #f44336, #ff5722)';
        btn.disabled = false;
    }
}

async function loadModelSSE(url, config) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({detail: `HTTP ${resp.status}`}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        let currentEvent = null;
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7);
            } else if (line.startsWith('data: ') && currentEvent) {
                const data = JSON.parse(line.slice(6));
                const { phase, progress, message } = data;
                
                if (currentEvent === 'progress') {
                    if (progress >= 0) progressFill.style.width = `${Math.min(progress, 100)}%`;
                    progressText.textContent = message;
                    
                    if (phase === 'download') {
                        progressFill.style.background = 'linear-gradient(90deg, #2196F3, #03A9F4)';
                        addLog('info', message);
                    } else if (phase === 'error') {
                        progressFill.style.background = 'linear-gradient(90deg, #f44336, #ff5722)';
                        addLog('error', message);
                    } else {
                        progressFill.style.background = 'linear-gradient(90deg, #F5A623, #FFD700)';
                        addLog('info', message);
                    }
                } else if (currentEvent === 'done') {
                    progressFill.style.width = '100%';
                    progressFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
                    progressText.textContent = '✅ ' + (data.message || '加载完成！');
                    addLog('success', data.message || '模型加载成功！');
                    setTimeout(() => updateStatus(), 500);
                } else if (currentEvent === 'error') {
                    throw new Error(data.message || '未知错误');
                }
                currentEvent = null;
            }
        }
    }
}

async function unloadModel() {
    const btn = document.getElementById('unloadBtn');
    btn.disabled = true;
    
    addLog('warning', '正在卸载模型...');
    
    try {
        const resp = await fetch(`${API_BASE}/api/model/unload`, { method: 'POST' });
        const result = await resp.json();
        addLog('success', result.message || '模型已卸载');
        setTimeout(() => updateStatus(), 500);
    } catch (e) {
        addLog('error', `卸载失败: ${e.message}`);
        btn.disabled = false;
    }
}

function showModelInfo(model) {
    const infoDiv = document.getElementById('modelInfo');
    infoDiv.style.display = 'block';
    
    document.getElementById('infoName').textContent = model.model_name || '-';
    document.getElementById('infoDevice').textContent = model.device || '-';
    document.getElementById('infoDtype').textContent = model.dtype || '-';
    document.getElementById('infoLoadTime').textContent = model.load_time || '-';
    
    const mem = model.memory;
    if (mem) {
        const memStr = Object.values(mem).join(', ') || '-';
        document.getElementById('infoMemory').textContent = memStr;
    }
}

function hideModelInfo() {
    document.getElementById('modelInfo').style.display = 'none';
}

function getProgressText(p) {
    if (p < 20) return '初始化...';
    if (p < 40) return '下载模型权重...';
    if (p < 60) return '加载到内存...';
    if (p < 80) return '编译计算图...';
    return '准备就绪...';
}

// ============================================================
// 对话测试
// ============================================================

let chatHistory = [];

async function sendMessage() {
    const input = document.getElementById('userInput');
    const text = input.value.trim();
    if (!text) return;
    
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    
    // 添加用户消息
    addChatMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    input.value = '';
    
    // 添加等待消息
    const waitingId = addChatMessage('assistant', '🤔 思考中...', true);
    
    try {
        const resp = await fetch(`${API_BASE}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'ui-tars-1.5-7b',
                messages: chatHistory,
                temperature: 0.7,
                max_tokens: 2048,
                stream: false
            })
        });
        
        removeWaitingMessage(waitingId);
        
        if (!resp.ok) {
            if (resp.status === 503) {
                addChatMessage('assistant', '⚠️ 模型未加载，请先在左侧面板加载模型。');
            } else {
                const err = await resp.json();
                addChatMessage('assistant', `❌ 错误: ${err.detail || resp.statusText}`);
            }
            sendBtn.disabled = false;
            return;
        }
        
        const data = await resp.json();
        const reply = data.choices[0].message.content;
        
        addChatMessage('assistant', reply);
        chatHistory.push({ role: 'assistant', content: reply });
        addLog('info', `对话完成 (${data.usage?.total_tokens || '?'} tokens)`);
        
    } catch (e) {
        removeWaitingMessage(waitingId);
        addChatMessage('assistant', `❌ 网络错误: ${e.message}`);
        addLog('error', `请求失败: ${e.message}`);
    }
    
    sendBtn.disabled = false;
}

function addChatMessage(role, content, isWaiting = false) {
    const container = document.getElementById('chatMessages');
    const id = 'msg-' + Date.now();
    
    const div = document.createElement('div');
    div.className = `msg msg-${role}${isWaiting ? ' waiting' : ''}`;
    div.id = id;
    div.innerHTML = `<div class="msg-bubble">${escapeHtml(content)}</div>`;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    
    return id;
}

function removeWaitingMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function clearChat() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="system-msg">对话已清空。</div>';
    chatHistory = [];
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// ============================================================
// 标签页切换
// ============================================================

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').style.display = 'block';
}

// ============================================================
// 日志
// ============================================================

function addLog(type, message) {
    const container = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString('zh-CN');
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${message}`;
    
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    
    // 限制日志条数
    while (container.children.length > 50) {
        container.removeChild(container.firstChild);
    }
}

// ============================================================
// 工具函数
// ============================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    startPolling();
    addLog('info', '控制面板已加载');
    
    // 检查模型是否已存在
    checkModelExists();
});

async function checkModelExists() {
    const modelName = document.getElementById('modelSelect').value;
    if (modelName === 'custom') return;
    try {
        const resp = await fetch(`${API_BASE}/api/model/check/${encodeURIComponent(modelName)}`);
        if (resp.ok) {
            const data = await resp.json();
            if (data.exists) {
                addLog('success', `✅ 模型已存在本地 (${data.size_gb}GB)`);
            } else {
                addLog('warning', '📦 模型未下载，点击「加载模型」将自动下载');
            }
        }
    } catch (e) {
        // ignore
    }
}

function onModelChange() {
    const sel = document.getElementById('modelSelect');
    const hint = document.getElementById('modelHint');
    const pathInput = document.getElementById('modelPath');
    const val = sel.value;
    
    if (val.startsWith('gguf:')) {
        hint.textContent = 'GGUF 模式用 llama.cpp 推理，CPU 速度快 5-10 倍';
        pathInput.placeholder = 'GGUF 模式不需要本地路径';
        pathInput.disabled = true;
        pathInput.value = '';
        // 检查 GGUF 模型是否已下载
        const modelId = val.split(':')[1];
        fetch(`${API_BASE}/api/gguf/check/${encodeURIComponent(modelId)}`)
            .then(r => r.json())
            .then(data => {
                if (data.exists) {
                    addLog('success', `✅ GGUF 已下载 (${data.gguf_size_gb}GB)`);
                } else {
                    addLog('warning', '📦 首次加载将自动从 ModelScope 下载');
                }
            }).catch(() => {});
    } else if (val.startsWith('transformers:')) {
        const modelName = val.split(':')[1];
        hint.textContent = 'PyTorch 模式，速度较慢但支持完整多模态';
        pathInput.placeholder = '留空则自动下载';
        pathInput.disabled = false;
        fetch(`${API_BASE}/api/model/check/${encodeURIComponent(modelName)}`)
            .then(r => r.json())
            .then(data => {
                if (data.exists) {
                    addLog('success', `✅ 模型已存在本地 (${data.size_gb}GB)`);
                } else {
                    addLog('warning', '📦 模型未下载，点击加载将自动下载');
                }
            }).catch(() => {});
    } else {
        hint.textContent = '自定义模型';
        pathInput.disabled = false;
        pathInput.placeholder = '本地模型路径';
        pathInput.focus();
    }
}
