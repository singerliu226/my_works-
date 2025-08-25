import axios from 'axios';

export type Classification = { newsType: string; confidence: number };

const CATEGORY_MAP: Record<string, string[]> = {
  '财经': ['A股','股票','股市','指数','上证','深证','创业板','港股','美股','货币','利率','汇率','通胀','通缩','降息','加息','央行','存款','贷款','财政','赤字','税收','发债','城投','券商','基金','期货','大宗','原油','金价','铜','煤','钢','地产','房企','收购','并购','IPO','上市','退市','年报','季报','利润','营收','净利','亏损','增收','降本','供给侧','金融','交易所','上交所','深交所','港交所','监管','并表'],
  '社会': ['社会','案件','警方','警情','法院','判决','纠纷','治安','校园','舆论','网传','网络暴力','打人','斗殴','交通事故','地震','灾情','火灾','坍塌','走失','寻人','救援','通报'],
  '民生': ['医保','社保','养老金','就业','失业','薪资','住房','公积金','保障房','教育','学位','招生','中考','高考','消费券','电价','水价','气价','供暖','菜价','米面油','米价','蔬菜','猪肉'],
  '国际': ['联合国','美方','欧盟','俄罗斯','乌克兰','中东','以色列','巴勒斯坦','朝鲜','韩国','日本','英国','法国','德国','印度','东南亚','北约','G7','G20','APEC','上合','金砖','外交','制裁','关税'],
  '政务公告': ['国务院','部委','住建部','发改委','财政部','统计局','证监会','应急管理部','公告','公示','通知','通告','倡议','意见','征求意见','实施方案','方案','条例','规定','发布会','权威发布'],
  '应急安全': ['台风','暴雨','暴雪','高温','寒潮','地震','泥石流','山体滑坡','疫情','感染','疾控','防疫','流感','航班延误','临时管控','危化','矿难','爆炸','险情','预警','Ⅰ级响应','Ⅱ级响应','Ⅲ级响应','Ⅳ级响应'],
  '科技': ['芯片','半导体','AI','人工智能','算法','大模型','生成式','光刻','EDA','研发','专利','科技','科研','卫星','火箭','载人','航天','量子','5G','6G','云计算','算力','数据中心','电动车','新能源','电池'],
  '文体': ['文娱','明星','演唱会','综艺','影视','票房','体育','足球','篮球','奥运','亚运','世界杯','夺冠','联赛','CBA','NBA','中超','娱乐'],
  '评论观察': ['评论','观察','述评','盘点','展望','社论','特稿','点评','风向','社评','观点'],
};

const CATEGORY_ORDER = Object.keys(CATEGORY_MAP);

export function classifyByRules(input: { title: string; summary?: string; sourceId?: string }): Classification {
  const text = [input.title || '', input.summary || ''].join(' ').slice(0, 400);
  let best: { cat: string; score: number } = { cat: '其他', score: 0 };
  for (const cat of CATEGORY_ORDER) {
    const keys = CATEGORY_MAP[cat];
    let s = 0;
    for (const k of keys) {
      const idx = text.indexOf(k);
      if (idx >= 0) s += k.length >= 3 ? 2 : 1;
    }
    if (s > best.score) best = { cat, score: s };
  }
  if ((input.sourceId || '').includes('cctv') || (input.sourceId || '').includes('people')) {
    best.score += 1;
  }
  const confidence = Math.max(0.2, Math.min(1, best.score / 6));
  // 对不抓取范围的类型直接回退为“其他”，并降低置信度
  if (best.cat === '评论观察') {
    return { newsType: '其他', confidence: Math.min(confidence, 0.4) };
  }
  return { newsType: best.cat, confidence };
}

export async function classifyWithLLM(input: { title: string; summary?: string }): Promise<Classification | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const prompt = '你是新闻分类助手。只在以下固定标签中选一类并给出0-1置信度：财经、社会、民生、国际、政务公告、应急安全、科技、文体、评论观察、其他。\n' +
                 '标题: ' + (input.title || '') + '\n' +
                 '摘要: ' + (input.summary || '') + '\n' +
                 '仅返回 JSON，如 {"category":"财经","confidence":0.82}';
  try {
    const resp = await axios.post(base + '/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: '你将对中文新闻进行精确分类，只能输出JSON，不要多余文本。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
    }, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, timeout: 8000
    });
    const content: string = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const category: string = String(parsed.category || parsed.type || '').trim();
    const confidenceNum = Number(parsed.confidence || 0.7);
    const allowed = new Set((CATEGORY_ORDER as string[]).concat(['其他']));
    return { newsType: allowed.has(category) ? category : '其他', confidence: Math.max(0.2, Math.min(1, confidenceNum)) };
  } catch {
    return null;
  }
}
