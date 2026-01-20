export { };

declare global {
    interface Window {
        electron: {
            onSetContext: (callback: (text: string) => void) => void;
            removeContextListener: () => void;

            getSettings: () => Promise<{ apiKey: string; provider: string }>;
            saveSettings: (settings: { apiKey: string; provider: string }) => Promise<boolean>;

            getSessions: () => Promise<{ id: number; title: string; timestamp: string }[]>;
            createSession: (title?: string) => Promise<number>;
            deleteSession: (id: number) => Promise<boolean>;
            getHistory: (sessionId: number) => Promise<{ role: string; content: string }[]>;
            clearHistory: () => Promise<boolean>;

            askLLM: (payload: { messages: any[]; context: string; sessionId: number | null }) => void;
            onLLMChunk: (callback: (text: string) => void) => void;
            onLLMError: (callback: (text: string) => void) => void;
            onLLMDone: (callback: () => void) => void;
            onSessionCreated: (callback: (id: number) => void) => void;

            removeAllListeners: (channel: string) => void;
        };
    }
}
