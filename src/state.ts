export type SourceStatus = {
    id: string;
    kind: 'html' | 'rss' | 'tophub';
    name?: string;
    enabled: boolean;
    entry?: string;
    frequencySec?: number;
    lastSuccessAt?: string;
    lastError?: string;
    lastCount?: number;
};

export const runtimeState: {
    sourceStatus: Map<string, SourceStatus>;
    config: any;
} = {
    sourceStatus: new Map<string, SourceStatus>(),
    config: null,
};

export function setSourceStatus(partial: SourceStatus) {
    const prev = runtimeState.sourceStatus.get(partial.id) || {} as SourceStatus;
    const next = { ...prev, ...partial } as SourceStatus;
    runtimeState.sourceStatus.set(next.id, next);
}


