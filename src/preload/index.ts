import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    // for context
    onSetContext: (callback: (text: string) => void) =>
        ipcRenderer.on('set-context', (_event, value) => callback(value)),
    removeContextListener: () => ipcRenderer.removeAllListeners('set-context'),

    // for settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

    // for sessions & history
    getSessions: () => ipcRenderer.invoke('get-sessions'),
    createSession: (title?: string) => ipcRenderer.invoke('create-session', title),
    deleteSession: (id: number) => ipcRenderer.invoke('delete-session', id),
    getHistory: (sessionId: number) => ipcRenderer.invoke('get-history', sessionId),
    clearHistory: () => ipcRenderer.invoke('clear-history'),

    // for llm
    askLLM: (payload: any) => ipcRenderer.send('ask-llm', payload),
    onLLMChunk: (callback: (text: string) => void) =>
        ipcRenderer.on('llm-chunk', (_event, value) => callback(value)),
    onLLMError: (callback: (text: string) => void) =>
        ipcRenderer.on('llm-error', (_event, value) => callback(value)),
    onLLMDone: (callback: () => void) =>
        ipcRenderer.on('llm-done', (_event) => callback()),
    onSessionCreated: (callback: (id: number) => void) =>
        ipcRenderer.on('session-created', (_event, value) => callback(value)),

    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
