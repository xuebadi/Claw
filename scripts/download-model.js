#!/usr/bin/env node
/**
 * Model Download Script
 * Downloads UI-TARS-1.5-7B model from ModelScope or HuggingFace
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const MODEL_ID = 'ByteDance-Seed/UI-TARS-1.5-7B';
const MODELSCOPE_URL = `https://www.modelscope.cn/api/v1/models/${MODEL_ID}/repo?Revision=master&FilePath=README.md`;
const HF_URL = `https://huggingface.co/${MODEL_ID}/raw/main/README.md`;

const modelDir = path.join(os.homedir(), '.cache', 'huggingface', 'hub');

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        log(`Downloading: ${url}`);
        log(`To: ${destPath}`);

        const file = fs.createWriteStream(destPath);
        
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirects
                const redirectUrl = response.headers.location;
                file.close();
                downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                log(`Download complete: ${destPath}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

async function checkModelScope() {
    try {
        log('Checking ModelScope availability...');
        await downloadFile(MODELSCOPE_URL, path.join(os.tmpdir(), 'modelscope_check.txt'));
        return true;
    } catch (error) {
        log(`ModelScope not accessible: ${error.message}`);
        return false;
    }
}

async function main() {
    log('学霸帝Claw - UI-TARS-1.5-7B 模型下载工具');
    log('=========================================');
    log('');

    // Check ModelScope
    const modelScopeAvailable = await checkModelScope();

    if (modelScopeAvailable) {
        log('');
        log('✅ ModelScope 可用，建议从 ModelScope 下载');
        log('');
        log('下载命令：');
        log('1. 安装 modelscope CLI: pip install modelscope');
        log(`2. 下载模型: modelscope download --model_id ${MODEL_ID}`);
    } else {
        log('');
        log('⚠️ ModelScope 不可用');
        log('尝试从 HuggingFace 下载...');
        log('');
        log(`请访问 https://huggingface.co/${MODEL_ID}`);
        log('下载模型文件并放置在 ~/.cache/huggingface/hub/ 目录');
    }

    log('');
    log('模型下载完成后，在设置中配置模型路径或 API 端点');
    log('');
    log('对于 macOS (Apple Silicon)，推荐使用 Ollama 运行模型：');
    log('1. brew install ollama');
    log('2. ollama serve');
    log('3. 导入下载的 UI-TARS 模型');
}

main().catch(console.error);
