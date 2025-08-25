import stringSimilarity from 'string-similarity';
import { articles, events } from './storage/db.js';

/**
 * 简易事件聚类（标题相似）
 * 原因：快速看到“同一事件”的多源报道，不引入复杂在线聚类
 * 实现：最近N条文章基于相似度阈值（如0.6）归并，记录事件成员
 */
export async function rebuildRecentClusters(limit = 200, threshold = 0.6) {
    const rows = await articles.find({}, { id: 1, title: 1, firstSeenAt: 1 });
    (rows as any).sort((a: any, b: any) => new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime());
    const sliced = (rows as any).slice(0, limit);
    const clusters: Array<{ title: string; members: any[] }> = [];
    for (const row of sliced as any[]) {
        let placed = false;
        for (const c of clusters) {
            const sim = stringSimilarity.compareTwoStrings(row.title, c.title);
            if (sim >= threshold) {
                c.members.push(row.id || row._id);
                placed = true; break;
            }
        }
        if (!placed) clusters.push({ title: row.title, members: [row.id || row._id] });
    }
    for (const c of clusters) {
        await events.update(
            { title: c.title },
            { $set: { title: c.title, memberIds: c.members, score: Math.min(1, c.members.length / 5), updatedAt: new Date().toISOString() } },
            { upsert: true }
        );
    }
}


