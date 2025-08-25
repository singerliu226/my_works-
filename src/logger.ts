import winston from 'winston';

/**
 * 创建 Winston 日志器
 * 设计原因：统一日志结构，便于追踪抓取—入库—评分全链路；控制不同等级输出
 * 实现方式：开发态彩色控制台，生产态 JSON；注入模块名
 */
export function createLogger(moduleName: string) {
	const { combine, timestamp, printf, colorize, json } = winston.format;
	const devFmt = combine(
		colorize(),
		timestamp(),
		printf((info) => `[${info.timestamp}] ${info.level} ${moduleName}: ${info.message} ${JSON.stringify({ ...info, level: undefined, message: undefined, timestamp: undefined })}`)
	);
	return winston.createLogger({
		level: process.env.LOG_LEVEL || 'info',
		format: process.env.NODE_ENV === 'production' ? combine(timestamp(), json()) : devFmt,
		defaultMeta: { module: moduleName },
		transports: [new winston.transports.Console()]
	});
}


