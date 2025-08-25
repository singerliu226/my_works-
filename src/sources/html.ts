import axios from 'axios';
import { load } from 'cheerio';
import { URL } from 'node:url';
import { createLogger } from '../logger.js';
import type { RawItem } from '../types.js';

const logger = createLogger('src:html');

/**
 * 通用 HTML 列表抓取器（用于无 RSS 的新闻列表页）
 * 设计原因：部分站点无公开 RSS，需要以页面为源；为简化配置，采用通用选择器与后置过滤
 * 实现方式：
 * - 提取页面中指向 .shtml 的链接，去重与域名校验，仅保留符合域名的新闻条目
 * - 标题采用链接文本；摘要为空（可后续扩展二级抓取）
 */
export async function fetchHtmlList(entry: string, sourceId: string, sourceType: RawItem['sourceType'], options?: { allowedHosts?: string[]; hrefPatterns?: string[] }): Promise<RawItem[]> {
    const start = Date.now();
    try {
        const res = await axios.get(entry, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 HotspotLite/1.0' } });
        const $ = load(res.data);
        const base = new URL(entry);
        const allowedHosts = options?.allowedHosts && options.allowedHosts.length > 0 ? options.allowedHosts : [base.hostname];
        const hrefRegexes = (options?.hrefPatterns || [
            ".*\\.shtml$",
            ".*\\.htm$",
            "/newsDetail_forward_\\d+",
            "/news/\\d{4}-\\d{2}-\\d{2}/[A-Za-z0-9_-]+\\.html$"
        ]).map((p) => new RegExp(p));
        const seen = new Set<string>();
        const items: RawItem[] = [];
        $('a[href]').each((_i, el) => {
            let href = ($(el).attr('href') || '').trim();
            let title = $(el).text().trim();
            if (!href || !title || title.length < 6) return;
            const lower = title.toLowerCase();
            // 过滤“视频/直播/音频/图集/小视频”等非文字新闻
            if (/视频|直播|Vlog|vlog|音频|图集|图说|短视频|微视频|小视频|Live|live/.test(title)) return;
            // 过滤评论类
            if (/评论|述评|观察|社论|观点|点评|锐评|漫评|时评|社评/.test(title)) return;
            // 过滤生活小贴士/技巧类
            if (/小贴士|妙招|窍门|技巧|攻略|指南|干货|这(几|些)招|这样做|收藏备用|生活常识|生活小常识|科普小知识/.test(title)) return;
            // 绝对化 URL
            try {
                const abs = new URL(href, base);
                const hostOk = allowedHosts.some((h) => abs.hostname === h || abs.hostname.endsWith(`.${h}`));
                if (!hostOk) return;
                const urlStr = abs.toString();
                const matchOk = hrefRegexes.some((re) => re.test(urlStr));
                if (!matchOk) return;
                // URL 级别再过滤：常见视频/图集路径
                if (/\/video\/|\/shipin|\/live|\/photo|\/pics|\/picture\//i.test(urlStr)) return;
                if (seen.has(urlStr)) return; seen.add(urlStr);
                items.push({ title, url: urlStr, sourceId, sourceType });
            } catch { /* noop */ }
        });
        // 限制前 50 条
        const out = items.slice(0, 50);
        logger.info('html.ok', { sourceId, count: out.length, ms: Date.now() - start });
        return out;
    } catch (e: any) {
        logger.warn('html.fail', { sourceId, entry, err: e.message });
        return [];
    }
}


