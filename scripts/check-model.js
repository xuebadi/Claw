#!/usr/bin/env node
/**
 * Model Check Script
 * Checks if UI-TARS-1.5-7B model is available and configured
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function log(message, type = 'info') {
    const prefix = {
        info: 'ℹ️ ',
        success: '✅',
        warning: '⚠️',
        error: '❌'
    }[type];
    console.log(`${prefix} ${message}`);
}

function checkLocalModel(modelPath) {
    if (fs.existsSync(modelPath)) {
        log(`本地模型路径已配置: ${modelPath}`, 'success');
        return true;
    }
    return false;
}

async function checkApiEndpoint(endpoint, apiKey) {
    try {
        log(`检查 API 端点: ${endpoint}`);
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await new Promise((resolve, reject) => {
            const req = https.request(`${endpoint}/models`, {
                method: 'GET',
                headers,
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, data }));
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
            
            req.end();
        });

        if (response.status === 200) {
            log('API 端点可访问', 'success');
            return true;
        } else {
            log(`API 端点返回状态码: ${response.status}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`API 端点不可用: ${error.message}`, 'error');
        return false;
    }
}

function checkOllama() {
    try {
        const output = execSync('ollama list 2>/dev/null', { encoding: 'utf-8' });
        if (output.includes('ui-tars') || output.includes('UI-TARS')) {
            log('Ollama 中已配置 UI-TARS 模型', 'success');
            return true;
        }
        log('Ollama 已安装但未配置 UI-TARS 模型', 'warning');
        return false;
    } catch {
        log('Ollama 未安装', 'warning');
        return false;
    }
}

async function main() {
    console.log('');
    log('学霸帝Claw - 模型状态检查', 'info');
    log('========================', 'info');
    console.log('');

    // Check local model path
    const configPath = path.join(os.homedir(), '.config', 'xueba-tars-desktop', 'config.json');
    let localModelPath = '';
    let apiEndpoint = 'http://localhost:8000/v1';
    let apiKey = '';

    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            localModelPath = config.settings?.modelPath || '';
            apiEndpoint = config.settings?.apiEndpoint || apiEndpoint;
            apiKey = config.settings?.apiKey || '';
        }
    } catch (e) {
        // Config not found, use defaults
    }

    let hasModel = false;

    // Check local model
    if (localModelPath && checkLocalModel(localModelPath)) {
        hasModel = true;
    }

    // Check Ollama
    if (checkOllama()) {
        hasModel = true;
    }

    // Check API endpoint
    if (await checkApiEndpoint(apiEndpoint, apiKey)) {
        hasModel = true;
    }

    console.log('');
    if (hasModel) {
        log('模型已配置，学霸帝Claw 可以正常工作', 'success');
    } else {
        log('未检测到已配置的模型', 'warning');
        log('');
        log('请选择以下方式之一配置模型：', 'info');
        log('1. 使用 npm run model:download 下载模型', 'info');
        log('2. 在设置中配置 API 端点', 'info');
        log('3. 安装 Ollama 并导入模型', 'info');
    }
    console.log('');
}

main().catch(console.error);
