import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import cron from 'node-cron';
import { createServer } from './server';
import { createLogger } from './logger';
import { fetchTopHub } from './sources/tophub';
import { fetchRss } from './sources/rss';
import { fetchHtmlList } from './sources/html';
import { upsertArticles } from './pipeline';
import { articles } from './storage/db';
import { scoreItem } from './scoring';
import { rebuildRecentClusters } from './cluster';
import { runtimeState, setSourceStatus } from './state';

const logger = createLogger('main');
try { await import('dotenv/config'); } catch { /* optional */ }

type Config = {
    tophub: { enabled: boolean; entry: string; frequencySec: number };
    rss: Array<{ id: string; name: string; enabled: boolean; entry: string; type: 'A'|'B'|'C'|'D'|'E'; frequencySec: number }>;
    html?: Array<{ id: string; name: string; enabled: boolean; entry: string; type: 'A'|'B'|'C'|'D'|'E'; frequencySec: number }>
};

function loadConfig(): Config {
    const cfgPath = path.resolve('./configs/sources.yaml');
    const cfg = yaml.load(fs.readFileSync(cfgPath, 'utf-8')) as any;
    runtimeState.config = cfg;
    return cfg as Config;
}

async function tickOnce(batch: RawBatch) {
    const { id, kind, promise } = batch;
    try {
        const list = await promise;
        await upsertArticles(list);
        setSourceStatus({ id, kind, enabled: true, lastSuccessAt: new Date().toISOString(), lastError: undefined as any, lastCount: list.length });
        return list.length;
    } catch (e: any) {
        setSourceStatus({ id, kind, enabled: true, lastError: e?.message || String(e) });
        return 0;
    }
}

type RawBatch = { id: string; kind: 'html' | 'rss' | 'tophub'; promise: Promise<any[]> };

async function tick(cfg: Config) {
    const tasks: RawBatch[] = [];
    if (cfg.tophub?.enabled) tasks.push({ id: 'tophub', kind: 'tophub', promise: fetchTopHub(cfg.tophub.entry) });
    for (const r of cfg.rss?.filter(r => r.enabled) || []) tasks.push({ id: r.id, kind: 'rss', promise: fetchRss(r.entry, r.id, r.type) });
    for (const h of cfg.html?.filter(h => h.enabled) || []) tasks.push({ id: h.id, kind: 'html', promise: fetchHtmlList(h.entry, h.id, h.type, { allowedHosts: (h as any).allowedHosts, hrefPatterns: (h as any).hrefPatterns }) });
    const counts = await Promise.all(tasks.map((t) => tickOnce(t)));
    const total = counts.reduce((a, b) => a + b, 0);

    // 入库
    // 其余流程（打分与聚类）

    // 简易可信锚定：标题在 A/C 源是否出现过
    const acRows = await articles.find({ sourceType: { $in: ['A','C'] } }, { title: 1 });
    const anchors = acRows.map((r: any) => r.title);
    const list = await articles.find({}, { id: 1, title: 1, firstSeenAt: 1, publishTime: 1, heatRank: 1 });
    list.sort((a: any, b: any) => (b._id as any) - (a._id as any));
    for (const row of list as any[]) {
        const isAnchored = anchors.some(t => t === row.title);
        const publishMs = row.publishTime ? Date.parse(row.publishTime) : undefined;
        const firstSeenMs = Date.parse(row.firstSeenAt);
        const { score } = scoreItem({ publishMs, firstSeenMs, heatRank: row.heatRank || undefined, isAnchored, title: row.title });
        await articles.update({ _id: row._id }, { $set: { credibility: isAnchored ? 1 : 0, score } }, { multi: false });
        // 此处可扩展：将 score 持久化
    }

    // 重建近时窗聚类
    await rebuildRecentClusters(200, 0.65);
}

async function main() {
    const cfg = loadConfig();

    // 先启动 Web，避免前端空白等待
    const app = createServer();
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => logger.info(`server.started http://localhost:${port}`));

    // 异步触发首次抓取/入库（不阻塞启动）
    tick(cfg).catch((e) => logger.error('tick.error', { err: e.message }));

    // 独立调度
    if (cfg.tophub?.enabled) cron.schedule(`*/${Math.max(20, cfg.tophub.frequencySec)} * * * * *`, () => tick(loadConfig())).start();
    for (const r of cfg.rss || []) {
        if (!r.enabled) continue;
        cron.schedule(`*/${Math.max(30, r.frequencySec)} * * * * *`, () => tick(loadConfig())).start();
    }
    for (const h of cfg.html || []) {
        if (!h.enabled) continue;
        cron.schedule(`*/${Math.max(30, h.frequencySec)} * * * * *`, () => tick(loadConfig())).start();
    }
}

main().catch((e) => {
    logger.error('fatal', { err: e.message });
    process.exit(1);
});


