import Parser from 'rss-parser';
import { createLogger } from '../logger.js';
import type { RawItem } from '../types.js';

const parser = new Parser({ timeout: 8000 });
const logger = createLogger('src:rss');

/**
 * 抓取 RSS 源
 * 原因：合规、稳定；优先权威与地方官方
 * 实现：统一映射到 RawItem，publishTime 保留原始时间
 */
export async function fetchRss(entry: string, sourceId: string, sourceType: RawItem['sourceType']): Promise<RawItem[]> {
    try {
        const feed = await parser.parseURL(entry);
        return (feed.items || []).map((it) => ({
            title: (it.title || '').trim(),
            url: (it.link || '').trim(),
            summary: it.contentSnippet || (it as any).summary || it.content || '',
            publishTime: (it as any).isoDate || it.pubDate,
            sourceId,
            sourceType
        })).filter(x => x.title && x.url);
    } catch (e: any) {
        logger.warn('rss.fail', { entry, err: e.message });
        return [];
    }
}


