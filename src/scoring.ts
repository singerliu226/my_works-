/**
 * 评分器
 * 原因：简化且可解释；个人工具不引入重模型
 * 实现：新鲜度衰减 + TopHub 榜位热度 + 权威命中可信 + 关键词偏好
 */
export function scoreItem(params: { publishMs?: number; firstSeenMs: number; heatRank?: number; isAnchored: boolean; title: string }) {
    const now = Date.now();
    const freshness = decay(now - (params.publishMs || params.firstSeenMs), 60 * 60 * 1000); // 半衰期60m
    const heat = params.heatRank ? Math.max(0, 1 - (params.heatRank / 50)) : 0;
    const cred = params.isAnchored ? 1 : 0.4;
    const fit = keywordFit(params.title);
    const score = 0.35 * cred + 0.30 * freshness + 0.20 * heat + 0.15 * fit;
    return { score, parts: { cred, freshness, heat, fit } };
}

function decay(deltaMs: number, halfLifeMs: number) {
    const k = Math.LN2 / halfLifeMs;
    return Math.exp(-k * deltaMs);
}
function keywordFit(title: string) {
    const keys = ['财经','货币','利率','通胀','就业','医保','住房','养老金','教育','基建','社保','财政','券商','A股','交易所'];
    const hits = keys.filter(k => title.includes(k)).length;
    return Math.min(1, hits / 2);
}


