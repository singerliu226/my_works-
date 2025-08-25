import Datastore from 'nedb-promises';
import { createLogger } from '../logger';

const logger = createLogger('db');

/**
 * 初始化 NeDB（基于文件的轻量 DB）
 * 原因：纯 JS，无需原生编译，适合个人小工具；支持简单查询与索引
 * 实现：articles、events 两个集合；对 urlHash 建索引防重复
 */
export const articles = Datastore.create({ filename: './data/articles.db', autoload: true, timestampData: true }) as any;
export const events = Datastore.create({ filename: './data/events.db', autoload: true, timestampData: true }) as any;

// 唯一索引：urlHash
// @ts-ignore
articles.ensureIndex({ fieldName: 'urlHash', unique: true }).catch(() => {});
logger.info('db.init.done');


