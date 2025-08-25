import crypto from 'node:crypto';
import { articles } from './storage/db.js';
import type { RawItem } from './types.js';
import { createLogger } from './logger.js';
import { classifyByRules, classifyWithLLM } from './classifier.js';

const logger = createLogger('pipeline');

/**
 * 标准化与去重入库
 * 原因：避免重复抓取与脏数据；为后续 FTS 与聚类铺路
 * 实现：urlHash + cleaned 文本哈希；入库后写入 FTS 索引
 */
export async function upsertArticles(items: RawItem[]) {
    let inserted = 0;
    for (const it of items) {
        const urlHash = sha1(it.url);
        const cleanHash = sha1((it.title || '') + '|' + (it.summary || ''));
        const now = new Date().toISOString();
        // 规则分类
        const ruleCls = classifyByRules({ title: it.title, summary: it.summary, sourceId: it.sourceId });
        const existing = await articles.findOne({ urlHash });
        if (existing) {
            await articles.update({ urlHash }, { $set: { ...it, canonicalUrl: it.url, urlHash, cleanHash, newsType: existing.newsType || ruleCls.newsType, typeConfidence: existing.typeConfidence ?? ruleCls.confidence } });
        } else {
            let newsType = ruleCls.newsType; let typeConfidence = ruleCls.confidence;
            if (typeConfidence < 0.6 && process.env.DEEPSEEK_API_KEY) {
                const llm = await classifyWithLLM({ title: it.title, summary: it.summary });
                if (llm) { newsType = llm.newsType; typeConfidence = llm.confidence; }
            }
            await articles.insert({ ...it, canonicalUrl: it.url, urlHash, cleanHash, firstSeenAt: now, newsType, typeConfidence });
            inserted++;
        }
    }
    logger.info('pipeline.upsert', { count: items.length, inserted });
}

function sha1(s: string) { return crypto.createHash('sha1').update(s).digest('hex'); }


