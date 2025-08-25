import axios from 'axios';
import { load } from 'cheerio';
import { createLogger } from '../logger.js';
import type { RawItem } from '../types.js';

const logger = createLogger('src:tophub');

/**
 * 抓取 TopHub 滚动新闻
 * 原因：高实时线索；仅做热度，不做可信
 * 实现：解析标题/链接/榜位，返回标准 RawItem 列表
 */
export async function fetchTopHub(entry: string): Promise<RawItem[]> {
    const start = Date.now();
    try {
        const res = await axios.get(entry, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 HotspotLite/1.0' } });
        const $ = load(res.data);
        const items: RawItem[] = [];
        $('.weui_panel_bd .weui_media_box').each((_i, el) => {
            const titleEl = $(el).find('.weui_media_title');
            const title = titleEl.text().trim();
            const href = titleEl.attr('href');
            const rankText = $(el).find('.weui_media_desc').first().text().trim();
            const rank = parseInt((rankText.match(/\d+/) || [])[0] || '', 10);
            if (title && href) {
                const url = href.startsWith('http') ? href : `https://tophub.today${href}`;
                items.push({ title, url, sourceId: 'tophub', sourceType: 'D', via: 'TopHub', heatRank: Number.isFinite(rank) ? rank : undefined });
            }
        });
        logger.info('tophub.ok', { count: items.length, ms: Date.now() - start });
        return items;
    } catch (e: any) {
        logger.warn('tophub.fail', { err: e.message, ms: Date.now() - start });
        return [];
    }
}


