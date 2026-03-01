#!/usr/bin/env node
/**
 * migrate-images-to-r2.js
 *
 * 将博客文章中的图片迁移到 Cloudflare R2：
 *  1. {% img https://... %}  — 外部图床（GitHub PicGo 等），下载后上传至 R2
 *  2. {% asset_img ... %}    — Hexo asset folder 本地图片，直接上传至 R2
 *  3. ![alt](https://...)    — 标准 Markdown 外链图片，下载后上传至 R2
 *
 * 依赖（仅 Node.js 内置 + AWS SDK v3 for R2）:
 *   npm install @aws-sdk/client-s3
 *
 * 配置说明：
 *   通过环境变量或修改下方 CONFIG 对象设置 R2 各参数。
 *
 * 用法：
 *   node scripts/migrate-images-to-r2.js [--dry-run] [--posts-dir <path>]
 *
 *   --dry-run      只扫描，不实际上传 / 修改文件
 *   --posts-dir    指定文章目录，默认为 ./source/_posts
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ────────────────────────────────────────────
//  配置区（优先读取环境变量）
// ────────────────────────────────────────────
const CONFIG = {
    // Cloudflare R2 Access Key ID
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    // Cloudflare R2 Secret Access Key
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    // Cloudflare Account ID
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    // R2 Bucket 名称
    r2Bucket: process.env.R2_BUCKET || '',
    // R2 R2自定义域名 (公开访问 URL 前缀，末尾不带 /)
    // 例如: https://images.example.com 或 https://pub-xxxx.r2.dev
    r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || '',
    // 上传到 R2 的路径前缀（Key 前缀），可以留空
    r2KeyPrefix: process.env.R2_KEY_PREFIX || 'blog/',
    // 文章目录（默认 ./source/_posts 相对脚本运行目录）
    postsDir: process.env.POSTS_DIR || path.join(process.cwd(), 'source/_posts'),
    // HTTP/HTTPS 代理地址（用于下载外链图片），例如 http://127.0.0.1:7890
    // 优先读取 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY 环境变量，也可直接填写
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '',
};

// ────────────────────────────────────────────
//  解析命令行参数
// ────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const postsDirArg = args.indexOf('--posts-dir');
if (postsDirArg !== -1 && args[postsDirArg + 1]) {
    CONFIG.postsDir = path.resolve(args[postsDirArg + 1]);
}

// ────────────────────────────────────────────
//  校验配置
// ────────────────────────────────────────────
function validateConfig() {
    const required = ['r2AccessKeyId', 'r2SecretAccessKey', 'r2AccountId', 'r2Bucket', 'r2PublicBaseUrl'];
    const missing = required.filter(k => !CONFIG[k]);
    if (missing.length > 0) {
        console.error('❌ 缺少必要配置，请设置以下环境变量：');
        missing.forEach(k => {
            const envName = k.replace(/([A-Z])/g, '_$1').toUpperCase();
            console.error(`   ${envName}`);
        });
        process.exit(1);
    }
}

// ────────────────────────────────────────────
//  初始化 S3 客户端（兼容 R2）
// ────────────────────────────────────────────
function createR2Client() {
    return new S3Client({
        region: 'auto',
        endpoint: `https://${CONFIG.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: CONFIG.r2AccessKeyId,
            secretAccessKey: CONFIG.r2SecretAccessKey,
        },
    });
}

// ────────────────────────────────────────────
//  工具函数
// ────────────────────────────────────────────

/** 从 URL 或文件名中提取扩展名 */
function getExt(nameOrUrl) {
    const base = nameOrUrl.split('?')[0].split('#')[0];
    const ext = path.extname(base).toLowerCase();
    return ext || '.png';
}

/** 根据文件内容猜 MIME */
function getMime(filename) {
    const ext = getExt(filename).replace('.', '');
    const map = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        bmp: 'image/bmp',
        ico: 'image/x-icon',
    };
    return map[ext] || 'application/octet-stream';
}

/** 通过 HTTP/HTTPS 下载文件，返回 Buffer（支持代理） */
function downloadUrl(url, redirectCount = 0) {
    if (redirectCount > 5) {
        return Promise.reject(new Error(`超过最大重定向次数: ${url}`));
    }
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const protocol = isHttps ? https : http;

        const options = { method: 'GET' };

        // 如果配置了代理，使用 HttpsProxyAgent
        if (CONFIG.proxy) {
            options.agent = new HttpsProxyAgent(CONFIG.proxy);
        }

        protocol.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                const location = res.headers.location;
                if (!location) return reject(new Error(`重定向但无 Location 头: ${url}`));
                // 处理相对路径重定向
                const nextUrl = location.startsWith('http') ? location : new URL(location, url).href;
                return downloadUrl(nextUrl, redirectCount + 1).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/** 读取本地文件，返回 Buffer */
function readLocal(filePath) {
    return Promise.resolve(fs.readFileSync(filePath));
}

/** 检查 R2 中是否已存在该 Key */
async function existsInR2(client, key) {
    try {
        await client.send(new HeadObjectCommand({ Bucket: CONFIG.r2Bucket, Key: key }));
        return true;
    } catch {
        return false;
    }
}

/** 上传 Buffer 到 R2，返回公开 URL */
async function uploadToR2(client, key, buffer, mime) {
    if (DRY_RUN) {
        console.log(`  [dry-run] 将上传: ${key} (${buffer.length} bytes)`);
        return `${CONFIG.r2PublicBaseUrl}/${key}`;
    }
    await client.send(new PutObjectCommand({
        Bucket: CONFIG.r2Bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        // 公开读（需要 Bucket 已配置为公开，或使用自定义域名）
        // ACL: 'public-read',  // R2 不直接支持 ACL，通过 Bucket 设置控制
    }));
    return `${CONFIG.r2PublicBaseUrl}/${key}`;
}

/** 递归列出目录中的所有 .md 文件 */
function listMarkdownFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...listMarkdownFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

// ────────────────────────────────────────────
//  正则匹配模式
// ────────────────────────────────────────────

/**
 * 匹配 {% img <url> ['<alt>'] %} 或 {% img <url> %}
 * 捕获组: [1] = 完整的标签, [2] = url, [3] = optional alt/title string
 */
const RE_HEXO_IMG = /(\{%\s*img\s+(https?:\/\/[^\s'"]+)(?:\s+'([^']*)')?\s*%\})/g;

/**
 * 匹配 {% asset_img <filename> [alt] %}
 * 捕获组: [1] = 完整标签, [2] = 文件名（含扩展名）, [3] = optional alt
 */
const RE_ASSET_IMG = /(\{%\s*asset_img\s+([^\s%]+)(?:\s+([^%]*?))?\s*%\})/g;

/**
 * 匹配标准 Markdown 图片：![alt](url "title") 其中 url 为 http/https
 * 捕获组: [1] = 完整标签, [2] = alt, [3] = url, [4] = optional title
 */
const RE_MD_IMG = /(!\[([^\]]*)\]\((https?:\/\/[^\s)]+?)(?:\s+"([^"]*)")?\))/g;

// ────────────────────────────────────────────
//  核心处理逻辑
// ────────────────────────────────────────────

/**
 * 处理单个 .md 文件
 * @param {S3Client} client
 * @param {string} mdFile    md 文件的绝对路径
 * @param {{ uploaded: number, skipped: number, failed: number }} stats
 */
async function processMdFile(client, mdFile, stats) {
    let content = fs.readFileSync(mdFile, 'utf-8');
    let changed = false;

    // ── 1. 推断 asset 文件夹路径 ──────────────────────────────
    // Hexo asset folder: source/_posts/<文章名>/<图片>
    const mdBaseName = path.basename(mdFile, '.md');
    const assetDir = path.join(path.dirname(mdFile), mdBaseName);

    console.log(`\n📄 ${path.relative(CONFIG.postsDir, mdFile)}`);

    // 收集所有需要处理的替换，避免重复替换冲突
    // 用 Map<originalTag, newTag> 来记录
    const replacements = new Map();

    // ── 2. 匹配 {% img <url> %} ────────────────────────────────
    {
        let match;
        RE_HEXO_IMG.lastIndex = 0;
        while ((match = RE_HEXO_IMG.exec(content)) !== null) {
            const [fullTag, , imgUrl, altRaw] = match;
            if (replacements.has(fullTag)) continue;

            const filename = path.basename(imgUrl.split('?')[0]);
            const r2Key = `${CONFIG.r2KeyPrefix}${mdBaseName}/${filename}`;

            try {
                const alreadyExists = await existsInR2(client, r2Key);
                let buffer;
                if (alreadyExists && !DRY_RUN) {
                    console.log(`  ⏭  已存在 R2，跳过上传: ${r2Key}`);
                    stats.skipped++;
                } else {
                    console.log(`  ⬇  下载外链图片: ${imgUrl}`);
                    buffer = await downloadUrl(imgUrl);
                    const publicUrl = await uploadToR2(client, r2Key, buffer, getMime(filename));
                    console.log(`  ✅ 上传成功: ${publicUrl}`);
                    stats.uploaded++;
                }

                const publicUrl = `${CONFIG.r2PublicBaseUrl}/${r2Key}`;
                // 保持 alt，构造新的 {% img %} 或改为标准 md 图片
                // 这里改为标准 Markdown，方便未来迁移；如果你想保留 hexo img 标签请改这里
                const altText = altRaw ? altRaw.replace(/["']/g, '').trim() : filename;
                const newTag = `![${altText}](${publicUrl})`;
                replacements.set(fullTag, newTag);
            } catch (err) {
                console.error(`  ❌ 处理失败: ${imgUrl}\n     ${err.message}`);
                stats.failed++;
            }
        }
    }

    // ── 3. 匹配 {% asset_img <filename> %} ────────────────────
    {
        let match;
        RE_ASSET_IMG.lastIndex = 0;
        while ((match = RE_ASSET_IMG.exec(content)) !== null) {
            const [fullTag, , filename, altRaw] = match;
            if (replacements.has(fullTag)) continue;

            const localPath = path.join(assetDir, filename);
            if (!fs.existsSync(localPath)) {
                console.warn(`  ⚠  Asset 文件不存在，跳过: ${localPath}`);
                stats.failed++;
                continue;
            }

            const r2Key = `${CONFIG.r2KeyPrefix}${mdBaseName}/${filename}`;

            try {
                const alreadyExists = await existsInR2(client, r2Key);
                if (alreadyExists && !DRY_RUN) {
                    console.log(`  ⏭  已存在 R2，跳过上传: ${r2Key}`);
                    stats.skipped++;
                } else {
                    console.log(`  ⬆  上传本地 asset: ${filename}`);
                    const buffer = await readLocal(localPath);
                    const publicUrl = await uploadToR2(client, r2Key, buffer, getMime(filename));
                    console.log(`  ✅ 上传成功: ${publicUrl}`);
                    stats.uploaded++;
                }

                const publicUrl = `${CONFIG.r2PublicBaseUrl}/${r2Key}`;
                const altText = altRaw ? altRaw.trim() : filename;
                const newTag = `![${altText}](${publicUrl})`;
                replacements.set(fullTag, newTag);
            } catch (err) {
                console.error(`  ❌ 处理失败: ${localPath}\n     ${err.message}`);
                stats.failed++;
            }
        }
    }

    // ── 4. 匹配标准 Markdown 图片 ![alt](url) ─────────────────
    {
        let match;
        RE_MD_IMG.lastIndex = 0;
        while ((match = RE_MD_IMG.exec(content)) !== null) {
            const [fullTag, , altText, imgUrl, titleText] = match;
            if (replacements.has(fullTag)) continue;

            // 如果已经是 R2 公开 URL，跳过
            if (imgUrl.startsWith(CONFIG.r2PublicBaseUrl)) {
                continue;
            }

            const filename = path.basename(imgUrl.split('?')[0]);
            const r2Key = `${CONFIG.r2KeyPrefix}${mdBaseName}/${filename}`;

            try {
                const alreadyExists = await existsInR2(client, r2Key);
                if (alreadyExists && !DRY_RUN) {
                    console.log(`  ⏭  已存在 R2，跳过上传: ${r2Key}`);
                    stats.skipped++;
                } else {
                    console.log(`  ⬇  下载 MD 外链图片: ${imgUrl}`);
                    const buffer = await downloadUrl(imgUrl);
                    const publicUrl = await uploadToR2(client, r2Key, buffer, getMime(filename));
                    console.log(`  ✅ 上传成功: ${publicUrl}`);
                    stats.uploaded++;
                }

                const publicUrl = `${CONFIG.r2PublicBaseUrl}/${r2Key}`;
                const titlePart = titleText ? ` "${titleText}"` : '';
                const newTag = `![${altText}](${publicUrl}${titlePart})`;
                replacements.set(fullTag, newTag);
            } catch (err) {
                console.error(`  ❌ 处理失败: ${imgUrl}\n     ${err.message}`);
                stats.failed++;
            }
        }
    }

    // ── 5. 应用所有替换 ────────────────────────────────────────
    if (replacements.size > 0) {
        for (const [original, replacement] of replacements) {
            // 使用 split/join 避免 replaceAll 中特殊字符问题
            content = content.split(original).join(replacement);
        }
        changed = true;
    }

    // ── 6. 写回文件 ────────────────────────────────────────────
    if (changed) {
        if (!DRY_RUN) {
            fs.writeFileSync(mdFile, content, 'utf-8');
            console.log(`  💾 文件已更新: ${path.basename(mdFile)}`);
        } else {
            console.log(`  [dry-run] 文件将被更新: ${path.basename(mdFile)}`);
        }
    } else {
        console.log(`  ℹ  没有需要迁移的图片`);
    }
}

// ────────────────────────────────────────────
//  入口
// ────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  Hexo 博客图片迁移到 Cloudflare R2');
    console.log('═══════════════════════════════════════════════');

    if (DRY_RUN) {
        console.log('⚠️  DRY RUN 模式，不会实际上传或修改文件\n');
    }

    validateConfig();

    console.log(`📁 文章目录: ${CONFIG.postsDir}`);
    console.log(`🪣 R2 Bucket: ${CONFIG.r2Bucket}`);
    console.log(`🔑 Key 前缀: ${CONFIG.r2KeyPrefix}`);
    console.log(`🌐 公开 URL: ${CONFIG.r2PublicBaseUrl}`);
    console.log(`🔌 下载代理: ${CONFIG.proxy || '(未设置，直连)'}\n`);

    const client = createR2Client();
    const mdFiles = listMarkdownFiles(CONFIG.postsDir);

    if (mdFiles.length === 0) {
        console.log('❌ 未找到任何 .md 文件，请检查 --posts-dir 参数。');
        process.exit(0);
    }

    console.log(`找到 ${mdFiles.length} 篇文章，开始处理...\n`);

    const stats = { uploaded: 0, skipped: 0, failed: 0 };

    for (const mdFile of mdFiles) {
        await processMdFile(client, mdFile, stats);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('  迁移完成');
    console.log('═══════════════════════════════════════════════');
    console.log(`  ✅ 上传成功: ${stats.uploaded} 张`);
    console.log(`  ⏭  已存在跳过: ${stats.skipped} 张`);
    console.log(`  ❌ 失败: ${stats.failed} 张`);

    if (stats.failed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('💥 未预期错误:', err);
    process.exit(1);
});
