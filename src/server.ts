import express, { Request, Response } from 'express';
import { articles, events } from './storage/db';
import { rebuildRecentClusters } from './cluster';
import { runtimeState } from './state';

export function createServer() {
    const app = express();

    app.get('/feed', async (req: Request, res: Response) => {
        const { limit = '100', sourceId, type, q, sinceMinutes } = req.query as Record<string, string>;
        const query: any = {};
        if (sourceId) query.sourceId = sourceId;
        if (type) query.sourceType = type;
        if (q) query.title = new RegExp(q, 'i');
        let rows = await articles.find(query, { _id: 0, id: 1, title: 1, sourceId: 1, sourceType: 1, publishTime: 1, firstSeenAt: 1, url: 1, via: 1, heatRank: 1, credibility: 1, score: 1, newsType: 1, typeConfidence: 1 });
        if (sinceMinutes) {
            const mins = Number(sinceMinutes);
            if (!Number.isNaN(mins) && mins > 0) {
                const cutoff = Date.now() - mins * 60 * 1000;
                rows = rows.filter((r: any) => new Date(r.firstSeenAt || 0).getTime() >= cutoff);
            }
        }
        rows.sort((a: any, b: any) => (b.score || 0) - (a.score || 0) || new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime());
        res.json(rows.slice(0, Math.min(500, Math.max(1, Number(limit) || 100))));
    });

    app.get('/items/:id', async (req: Request, res: Response) => {
        const row = await articles.findOne({ _id: req.params.id });
        if (!row) return res.status(404).json({ error: 'not found' });
        res.json(row);
    });

    app.get('/events', async (req: Request, res: Response) => {
        const rows = await events.find({}, { _id: 0 });
        rows.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        const wantsHtml = /text\/html/.test(String(req.headers.accept)) || String(req.url).includes('view=html');
        const sliced = rows.slice(0, 100);
        if (wantsHtml) {
            const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>事件聚类</title>
            <style>
              :root{--bg:#0b1020;--panel:#111831;--text:#e6ebff;--muted:#9aa4c7;--border:#22305b;--accent:#5b8cff}
              *{box-sizing:border-box}
              body{margin:0;padding:24px;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;background:linear-gradient(180deg,#070b18,#0f1733);color:var(--text)}
              header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
              h1{margin:0;font-size:20px;font-weight:700}
              .card{background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
              table{width:100%;border-collapse:separate;border-spacing:0}
              thead th{position:sticky;top:0;background:rgba(10,16,35,.9);backdrop-filter:saturate(140%) blur(6px);text-align:left;color:var(--muted);font-weight:600}
              th,td{padding:12px 14px;border-bottom:1px solid var(--border)}
              tr:hover td{background:rgba(91,140,255,.06)}
              .badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-size:12px}
              a{color:var(--accent);text-decoration:none}
            </style></head>
            <body>
              <header>
                <h1>事件聚类</h1>
                <div><a href="/">返回首页</a></div>
              </header>
              <div class="card">
                <table>
                  <thead><tr><th>标题代表</th><th>成员数</th><th>得分</th><th>更新时间</th></tr></thead>
                  <tbody>
                    ${sliced.map((e: any) => `<tr>
                      <td>${escapeXml(e.title || '')}</td>
                      <td><span class="badge">${Array.isArray(e.memberIds)?e.memberIds.length:0}</span></td>
                      <td>${e.score ?? ''}</td>
                      <td>${e.updatedAt ?? ''}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </body></html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } else {
            res.json(sliced);
        }
    });

    app.get('/health', (_req: Request, res: Response) => {
        res.json({ ok: true, time: new Date().toISOString() });
    });

    app.post('/recluster', async (_req: Request, res: Response) => {
        await rebuildRecentClusters(200, 0.65);
        res.json({ ok: true });
    });

    app.get('/rss/:sourceId', async (req: Request, res: Response) => {
        const { sourceId } = req.params;
        const items = await articles.find({ sourceId }, { title: 1, url: 1, summary: 1, publishTime: 1, firstSeenAt: 1 });
        items.sort((a: any, b: any) => new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime());
        const site = `http://localhost:${process.env.PORT || 3000}`;
        const rss = `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<rss version=\"2.0\">\n` +
          `<channel>\n` +
          `<title>${escapeXml(`hotspot-lite ${sourceId}`)}</title>\n` +
          `<link>${escapeXml(site)}</link>\n` +
          `<description>${escapeXml(`RSS feed for ${sourceId}`)}</description>\n` +
          items.slice(0, 50).map((it: any) => (
            `<item>\n` +
            `<title>${escapeXml(it.title || '')}</title>\n` +
            `<link>${escapeXml(it.url || '')}</link>\n` +
            `<description>${escapeXml(it.summary || '')}</description>\n` +
            `<pubDate>${new Date(it.publishTime || it.firstSeenAt || Date.now()).toUTCString()}</pubDate>\n` +
            `</item>`
          )).join('\n') +
          `\n</channel>\n</rss>`;
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.send(rss);
    });

    app.get('/sources', (_req: Request, res: Response) => {
        const list = Array.from(runtimeState.sourceStatus.values());
        res.json(list);
    });

    app.get('/', async (_req: Request, res: Response) => {
        const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>热点流</title>
        <style>
          :root{--bg:#0b1020;--panel:#111831;--text:#e6ebff;--muted:#9aa4c7;--border:#22305b;--accent:#5b8cff}
          *{box-sizing:border-box}
          body{margin:0;padding:22px;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;background:linear-gradient(180deg,#070b18,#0f1733);color:var(--text)}
          header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
          h1{margin:0;font-size:20px;font-weight:700}
          .panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
          .toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px}
          label{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:12px}
          input,select,button{height:36px;border-radius:8px;border:1px solid var(--border);background:#0c1328;color:var(--text);padding:0 10px}
          button{background:linear-gradient(180deg,#3557ff,#2b49d1);border:none;cursor:pointer}
          button.secondary{background:#18224a;border:1px solid var(--border)}
          table{width:100%;border-collapse:separate;border-spacing:0}
          thead th{position:sticky;top:0;background:rgba(10,16,35,.9);backdrop-filter:saturate(140%) blur(6px);text-align:left;color:var(--muted);font-weight:600}
          th,td{padding:10px 12px;border-bottom:1px solid var(--border)}
          tr:hover td{background:rgba(91,140,255,.06)}
          a{color:var(--accent);text-decoration:none}
          .row{display:flex;align-items:center;gap:10px}
          .badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-size:12px}
          .score{display:inline-block;min-width:42px}
          .bar{height:8px;border-radius:999px;background:#0b1230;border:1px solid var(--border);overflow:hidden}
          .bar > span{display:block;height:100%;background:linear-gradient(90deg,#3aa9ff,#6ae3ff)}
          .muted{color:var(--muted)}
          .warn{color:#f59e0b}
          .copy{margin-left:8px;height:26px;padding:0 10px;font-size:12px;border-radius:6px;background:#1d2b5a;border:1px solid var(--border)}
          .copy:hover{background:#223469}
        </style>
        </head>
        <body>
          <header>
            <h1>热点流</h1>
            <div class="row muted"><a href="/events?view=html">事件聚类</a></div>
          </header>
          <div class="panel">
            <div class="toolbar">
              <label>来源类别
                <select id="type">
                  <option value="">全部</option>
                  <option value="A">A 权威/官方</option>
                  <option value="B">B 主流媒体</option>
                  <option value="C">C 地方官方</option>
                  <option value="D">D 聚合线索</option>
                </select>
              </label>
              <label>关键词
                <input id="q" placeholder="如：利率/养老金/交易所" />
              </label>
              <label>近几分钟
                <input id="since" type="number" min="0" value="120" />
              </label>
              <label>条数
                <input id="limit" type="number" min="1" max="500" value="100" />
              </label>
              <button id="refresh">刷新</button>
              <button id="auto" class="secondary">自动刷新: 关</button>
              <span id="meta" class="muted"></span>
              <span id="lastErr" class="warn" style="margin-left:10px"></span>
            </div>
            <div style="overflow:auto;border-radius:10px">
              <table>
                <thead><tr><th>标题</th><th>来源</th><th>新闻类型</th><th>分数</th><th>时间</th></tr></thead>
                <tbody id="tbody"><tr><td class="muted">加载中...</td><td></td><td></td><td></td><td></td></tr></tbody>
              </table>
            </div>
          </div>
          <script>
            const el = (id)=>document.getElementById(id);
            const fmt = (t)=> t ? new Date(t).toLocaleString() : '';
            const badge = (sType, sId)=>'<span class="badge">'+(sType||'')+(sId?(' · '+sId):'')+'</span>';
            const sourceName = (id)=>({
              chinanews:'中国新闻网',
              thepaper:'澎湃新闻',
              people:'人民网',
              xinhuanet:'新华网',
              cctv:'央视网',
              china_com_cn:'中国网',
              gmw:'光明网',
              yicai:'第一财经',
              tophub:'TopHub'
            })[id]||id;
            const scoreBar = (v)=>{ const p = Math.round((v||0)*100); return '<div class="score">'+(v||0).toFixed(2)+'</div><div class="bar"><span style="width:'+p+'%"></span></div>'; };
            function setBtnLoading(loading){ const b=el('refresh'); if(!b) return; b.disabled=!!loading; b.textContent=loading?'刷新中…':'刷新'; }
            async function load(){
              setBtnLoading(true);
              const p = new URLSearchParams();
              const type = el('type').value.trim();
              const q = el('q').value.trim();
              const since = el('since').value.trim();
              const limit = el('limit').value.trim();
              if(type) p.set('type', type);
              if(q) p.set('q', q);
              if(since) p.set('sinceMinutes', since);
              if(limit) p.set('limit', limit);
              const tb = el('tbody');
              let data = [];
              try{
                p.set('t', String(Date.now()));
                const res = await fetch('/feed?'+p.toString());
                if(!res.ok) throw new Error('HTTP '+res.status);
                data = await res.json();
                el('lastErr').textContent='';
              }catch(err){
                console.error('load feed error', err);
                tb.innerHTML = '<tr><td class="muted">加载失败，请重试</td><td></td><td></td><td></td><td></td></tr>';
                el('meta').textContent='';
                el('lastErr').textContent='错误：'+(err && (err.message||String(err)));
                setBtnLoading(false);
                return;
              }
              if(!Array.isArray(data) || data.length===0){ tb.innerHTML = '<tr><td class="muted">无数据</td><td></td><td></td><td></td><td></td></tr>'; el('meta').textContent=''; return; }
              tb.innerHTML = data.map(function(r){
                return '<tr>'+
                  '<td><a href="'+r.url+'" target="_blank" rel="noopener">'+String(r.title||'').replace(/[<>]/g,'')+'</a>'+
                  '<button class="copy" data-url="'+r.url+'">转发</button></td>'+
                  '<td>'+badge('', sourceName(r.sourceId))+'</td>'+
                  '<td>'+badge(r.newsType||'未分类', (r.typeConfidence!=null? (Math.round((r.typeConfidence||0)*100)+'%') : ''))+'</td>'+
                  '<td>'+scoreBar(r.score)+'</td>'+
                  '<td>'+fmt(r.firstSeenAt)+'</td>'+
                '</tr>';
              }).join('');
              el('meta').textContent = '共 '+data.length+' 条 · 更新于 '+new Date().toLocaleTimeString();
              setBtnLoading(false);
            }
            el('refresh').onclick=load;
            let timer=setInterval(load, 60000); el('auto').textContent='自动刷新: 开';
            el('auto').onclick=()=>{ if(timer){ clearInterval(timer); timer=null; el('auto').textContent='自动刷新: 关'; } else { timer=setInterval(load, 60000); el('auto').textContent='自动刷新: 开'; } };
            async function copyLink(url){
              try{
                if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(url); return true; }
              }catch(e){}
              const ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(e){}; document.body.removeChild(ta); return true;
            }
            document.addEventListener('click', function(e){
              const t = e.target; if(t && t.classList && t.classList.contains('copy')){ const u=t.getAttribute('data-url'); copyLink(u).then(()=>{ const old=t.textContent; t.textContent='已复制'; setTimeout(()=>{ t.textContent=old; }, 1200); }); }
            });
            document.addEventListener('keydown', function(e){
              if((e.key==='r' || e.key==='R') && !e.ctrlKey && !e.metaKey && !e.altKey){
                const tag = (e.target && e.target.tagName) || '';
                if(!/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); load(); }
              }
            });
            load();
          </script>
        </body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    });

    return app;
}

function escapeXml(s: string) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as any)[c]);
}


