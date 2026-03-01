'use strict';

/**
 * cf-image-transform.js
 *
 * Hexo Filter：在 HTML 渲染完成后，将 R2 图片链接替换为
 * Cloudflare Images 转换链接（/cdn-cgi/image/...），
 * 源 Markdown 文件保持不变。
 *
 * 配置（在 _config.yml 中添加 cf_image_transform 节）：
 *
 *   cf_image_transform:
 *     enable: true
 *     enable_dev: false          # hexo server 时是否也生效
 *     r2_base_url: "https://image.woshiren.com"
 *     transform_options: "format=auto,quality=85,metadata=none"
 *
 * 转换结果示例：
 *   src="https://image.woshiren.com/blog/xxx/image.png"
 *     ↓
 *   src="/cdn-cgi/image/format=auto,quality=85,metadata=none/https://image.woshiren.com/blog/xxx/image.png"
 */

const CONFIG_KEY = 'cf_image_transform';

const DEFAULTS = {
    enable: true,
    enable_dev: false,
    r2_base_url: '',
    transform_options: 'format=auto,quality=85,metadata=none',
};

hexo.extend.filter.register('after_render:html', function cfImageTransform(html) {
    const cfg = Object.assign({}, DEFAULTS, hexo.config[CONFIG_KEY] || {});

    // 开发服务器模式下，默认跳过（避免本地预览时请求走 CDN 转换）
    if (hexo.env.cmd === 'server' && !cfg.enable_dev) {
        return html;
    }

    if (!cfg.enable) {
        return html;
    }

    const r2Base = (cfg.r2_base_url || '').replace(/\/$/, '');
    if (!r2Base) {
        hexo.log.warn('[cf-image-transform] r2_base_url 未配置，插件跳过。');
        return html;
    }

    const opts = (cfg.transform_options || '').replace(/^\/|\/$/g, '');
    const cdnPrefix = `/cdn-cgi/image/${opts}/`;

    // 转义 r2Base，用于构建正则
    const escaped = r2Base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // ── 1. 替换 src / data-src / data-original 属性 ──────────────
    // 匹配: src="https://image.woshiren.com/..." 或单引号版本
    // 同时处理懒加载常用的 data-src、data-original
    const reAttr = new RegExp(
        `((?:src|data-src|data-original|data-lazy-src)=["'])(${escaped}/[^"' >\\n]+)(["'])`,
        'gi'
    );
    html = html.replace(reAttr, (_, attrPrefix, url, quote) => {
        return `${attrPrefix}${cdnPrefix}${url}${quote}`;
    });

    // ── 2. 替换 srcset 属性（格式：url [width/density], url ...）──
    // 先找到 srcset="..." 块，再逐条替换其中的 URL
    const reSrcset = new RegExp(
        `(srcset=["'])([^"']+)(["'])`,
        'gi'
    );
    const reUrlInSrcset = new RegExp(`${escaped}/[^\\s,]+`, 'gi');
    html = html.replace(reSrcset, (_, prefix, srcsetVal, suffix) => {
        const newVal = srcsetVal.replace(reUrlInSrcset, (url) => `${cdnPrefix}${url}`);
        return `${prefix}${newVal}${suffix}`;
    });

    // ── 3. 替换 CSS style 属性中的 url(...)（行内背景图）────────────
    const reStyle = new RegExp(
        `(url\\(["']?)(${escaped}/[^"')\\s]+)(["']?\\))`,
        'gi'
    );
    html = html.replace(reStyle, (_, urlPrefix, url, urlSuffix) => {
        return `${urlPrefix}${cdnPrefix}${url}${urlSuffix}`;
    });

    return html;

}, 20); // priority=20，在大多数渲染 filter 之后运行
