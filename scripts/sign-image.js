'use strict';

const crypto = require('crypto');
require('dotenv').config();

// 只对这个域名的图片 URL 添加签名
const IMAGE_DOMAIN = 'image.woshiren.com';
const SECRET = process.env.IMAGE_SIGN_SECRET;

if (!SECRET) {
    console.warn('[sign-image] Warning: IMAGE_SIGN_SECRET not found in .env, image signing is disabled.');
}

/**
 * 对单个图片 URL 进行 HMAC-SHA256 签名。
 * 签名内容为 URL 的 pathname，签名结果以 ?sig=<hex> 追加到 URL 末尾。
 * 如果 URL 不属于目标域名，则原样返回。
 *
 * @param {string} rawUrl - 原始图片 URL 字符串
 * @returns {string} - 签名后的 URL，或原始 URL（不需处理时）
 */
function signUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.hostname !== IMAGE_DOMAIN) return rawUrl;

        // 签名内容：pathname（含开头的 /），与 Cloudflare Worker 端保持一致
        const hmac = crypto.createHmac('sha256', SECRET);
        hmac.update(url.pathname);
        const sig = hmac.digest('hex');

        // 清除原有查询参数，追加签名
        return `${url.origin}${url.pathname}?sig=${sig}`;
    } catch (_) {
        // 非法 URL，跳过
        return rawUrl;
    }
}

/**
 * 替换 HTML 内容中所有 <img src="..."> 的 src 属性（已渲染阶段）。
 *
 * @param {string} html
 * @returns {string}
 */
function signImgTagsInHtml(html) {
    // 匹配 src="..." 或 src='...'，支持 http/https
    return html.replace(
        /(<img\s[^>]*?)src=(["'])(https?:\/\/[^"']+)\2/gi,
        (match, prefix, quote, url) => {
            return `${prefix}src=${quote}${signUrl(url)}${quote}`;
        }
    );
}

if (SECRET) {
    // after_post_render：此时 data.content 是渲染后的 HTML，处理 <img src> 标签
    hexo.extend.filter.register('after_post_render', function (data) {
        if (data.content) {
            data.content = signImgTagsInHtml(data.content);
        }
        if (data.excerpt) {
            data.excerpt = signImgTagsInHtml(data.excerpt);
        }
        return data;
    });

    hexo.log.info('[sign-image] Image URL signing enabled for domain: %s', IMAGE_DOMAIN);
}
