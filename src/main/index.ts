import { app, BrowserWindow, globalShortcut, clipboard, ipcMain, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import Store from 'electron-store';
import OpenAI from 'openai';
import Database from 'better-sqlite3';

const dbPath = path.join(app.getPath('userData'), 'chat_history.db');
const db = new Database(dbPath);

try {
    db.prepare('SELECT session_id FROM messages LIMIT 1').run();
} catch (e) {
    console.log('Migrating database schema...');
    db.exec('DROP TABLE IF EXISTS messages');
    db.exec('DROP TABLE IF EXISTS sessions');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

interface StoreSchema {
    apiKey: string;
    provider: 'openai' | 'anthropic';
}
const store = new Store<StoreSchema>({
    defaults: { apiKey: '', provider: 'openai' }
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        frame: false,
        transparent: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        vibrancy: 'under-window',
        visualEffectState: 'active',
        type: 'panel',
        skipTaskbar: true,
        fullscreenable: false,
        icon: path.join(__dirname, '../../assets/icon.png')
    });

    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'floating', 1);

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
            return false;
        }
    });

    mainWindow.on('blur', () => {
        if (!mainWindow?.webContents.isDevToolsOpened()) {
            mainWindow?.hide();
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.meta || input.control)) {
            const key = input.key.toLowerCase();
            switch (key) {
                case 'v':
                    mainWindow?.webContents.paste();
                    event.preventDefault();
                    break;
                case 'c':
                    mainWindow?.webContents.copy();
                    event.preventDefault();
                    break;
                case 'x':
                    mainWindow?.webContents.cut();
                    event.preventDefault();
                    break;
                case 'a':
                    mainWindow?.webContents.selectAll();
                    event.preventDefault();
                    break;
                case 'z':
                    if (input.shift) {
                        mainWindow?.webContents.redo();
                    } else {
                        mainWindow?.webContents.undo();
                    }
                    event.preventDefault();
                    break;
                case 'y':
                    mainWindow?.webContents.redo();
                    event.preventDefault();
                    break;
            }
        }
    });
}

let isQuitting = false;

function createTray() {
    if (tray) return;
    const iconPath = path.join(__dirname, '../../assets/tray-template.png');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow?.show() },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);
    tray.setToolTip('Sparky');
    tray.setContextMenu(contextMenu);
}

function createMenu() {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: 'Cmd+Q',
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { role: 'close', accelerator: 'Cmd+W' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function getSelectedText(): Promise<string> {
    const originalClipboard = clipboard.readText();
    clipboard.writeText('');

    const simulateCopy = (useKeyCode = false) => {
        const script = useKeyCode
            ? `tell application "System Events" to key code 8 using {command down}`
            : `tell application "System Events" to keystroke "c" using {command down}`;

        return new Promise((resolve) => {
            exec(`osascript -e '${script}'`, (error) => {
                if (error) console.error('AppleScript Error:', error);
                resolve(!error);
            });
        });
    };

    await new Promise(r => setTimeout(r, 200));

    await simulateCopy(false);
    await new Promise(r => setTimeout(r, 400));
    let text = clipboard.readText();

    if (!text || text === '') {
        await simulateCopy(true);
        await new Promise(r => setTimeout(r, 400));
        text = clipboard.readText();
    }

    if (!text || text.trim() === '') {
        console.log('Context capture: No text found, restoring clipboard.');
        clipboard.writeText(originalClipboard);
        return '';
    }

    console.log('Context capture: Success, length:', text.length);
    return text;
}

ipcMain.handle('get-settings', () => ({
    apiKey: store.get('apiKey'),
    provider: store.get('provider')
}));

ipcMain.handle('save-settings', (_event, settings: StoreSchema) => {
    store.set('apiKey', settings.apiKey);
    store.set('provider', settings.provider);
    return true;
});

ipcMain.handle('get-sessions', () => {
    try {
        return db.prepare('SELECT * FROM sessions ORDER BY timestamp DESC').all();
    } catch (e) { return []; }
});

ipcMain.handle('create-session', (_event, title) => {
    const stmt = db.prepare('INSERT INTO sessions (title) VALUES (?)');
    const info = stmt.run(title || 'New Chat');
    return info.lastInsertRowid;
});

ipcMain.handle('get-history', (_event, sessionId) => {
    try {
        if (!sessionId) return [];
        return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC').all(sessionId);
    } catch (e) { return []; }
});

ipcMain.handle('delete-session', (_event, sessionId) => {
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return true;
});

ipcMain.handle('clear-history', () => {
    db.exec('DELETE FROM messages');
    db.exec('DELETE FROM sessions');
    return true;
});

ipcMain.on('ask-llm', async (event, { messages, context, sessionId }) => {
    const apiKey = store.get('apiKey');
    if (!apiKey) {
        event.reply('llm-error', 'API Key missing. Settings > Add Key.');
        return;
    }

    let currentSessionId = sessionId;

    if (!currentSessionId) {
        const stmt = db.prepare('INSERT INTO sessions (title) VALUES (?)');
        const info = stmt.run(messages[messages.length - 1]?.content?.slice(0, 30) || 'New Chat');
        currentSessionId = info.lastInsertRowid;
        event.reply('session-created', currentSessionId);
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
        const stmt = db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)');
        stmt.run(currentSessionId, lastMsg.role, lastMsg.content);
    }

    try {
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: false });
        const systemPrompt = `You are a helpful AI assistant for macOS (Sparky). 
        You are running in a global floating window.
        The user may provide "Context" from their clipboard.
        Priority: Answer the user's question. Use context if relevant.
        Keep answers concise and clear.`;

        const conversation = [
            { role: 'system', content: systemPrompt },
        ];

        if (context) {
            conversation.push({ role: 'user', content: `[CONTEXT FROM USER SELECTION]:\n${context}\n\nPlease use the above context to help answer my next message.` });
        }

        conversation.push(...messages.map((m: any) => ({ role: m.role, content: m.content })));

        const stream = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: conversation as any,
            stream: true,
        });

        let fullResponse = '';

        for await (const chunk of stream as any) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                event.reply('llm-chunk', content);
            }
        }
        
        const stmt = db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)');
        stmt.run(currentSessionId, 'assistant', fullResponse);

        event.reply('llm-done');

    } catch (error: any) {
        console.error('LLM Error:', error);
        event.reply('llm-error', error.message || 'Unknown LLM Error');
    }
});

app.whenReady().then(() => {
    createTray();
    createMenu();
    createWindow();

    globalShortcut.register('Control+I', async () => {
        if (!mainWindow) return;

        if (mainWindow.isVisible() && mainWindow.isFocused()) {
            mainWindow.hide();
        } else {
            const text = await getSelectedText();
            if (text) {
                mainWindow.webContents.send('set-context', text);
            }

            const { screen } = require('electron');
            const point = screen.getCursorScreenPoint();
            const windowSize = mainWindow.getSize();
            mainWindow.setPosition(
                Math.floor(point.x - windowSize[0] / 2),
                Math.floor(point.y - 20)
            );

            mainWindow.show();
            mainWindow.focus();

            setTimeout(() => {
                mainWindow?.focus();
                mainWindow?.webContents.focus();
            }, 100);
        }
    });

    if (app.dock) app.dock.hide();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
