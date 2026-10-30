const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Настоящие обработчики с минимальной имитацией API без запуска окна VS Code.
test('Жизненный цикл тренировки и защита пользовательского кода', async () => {
    const documents = [];
    const commands = new Map();
    const providers = new Map();
    const notices = [];
    const tabs = [];
    let cancelClose = false;
    class TextTab { constructor(uri) { this.uri = uri; } }
    class DiffTab { constructor(original, modified) { this.original = original; this.modified = modified; } }
    let closeDocument;
    let confirmation;
    let diff;
    const disposable = () => ({ dispose() {} });
    const uri = value => ({ scheme: value.split(':')[0], toString: () => value });
    const document = (content, language = 'cpp', address = 'untitled:' + documents.length) => {
        const doc = { uri: uri(address), languageId: language, isClosed: false,
            content, getText(selection) {
                return selection ? this.content.slice(selection.start, selection.end) : this.content;
            } };
        documents.push(doc);
        return doc;
    };
    const api = {
        TabInputText: TextTab,
        TabInputTextDiff: DiffTab,
        StatusBarAlignment: { Right: 1 },
        Uri: { from: ({ scheme, path }) => uri(scheme + ':' + path) },
        window: {
            tabGroups: {
                all: [{ tabs }],
                close: async selected => {
                    if (cancelClose) { return false; }
                    for (const tab of selected) { tabs.splice(tabs.indexOf(tab), 1); }
                    return true;
                }
            },
            activeTextEditor: undefined,
            createStatusBarItem: () => ({ ...disposable(), show() {}, hide() {} }),
            showWarningMessage: async (message, options) => {
                notices.push(message);
                return options?.modal ? confirmation : undefined;
            },
            showInformationMessage: async message => { notices.push(message); },
            showErrorMessage: async message => { throw new Error(message); },
            showTextDocument: async doc => {
                if (!tabs.some(tab => tab.input instanceof TextTab && tab.input.uri === doc.uri)) {
                    tabs.push({ input: new TextTab(doc.uri) });
                }
                api.window.activeTextEditor = { document: doc };
                return api.window.activeTextEditor;
            }
        },
        workspace: {
            textDocuments: documents,
            registerTextDocumentContentProvider: (scheme, provider) => {
                providers.set(scheme, provider); return disposable();
            },
            onDidCloseTextDocument: callback => { closeDocument = callback; return disposable(); },
            openTextDocument: async options => {
                if (options.toString && options.scheme) {
                    const existing = documents.find(doc => doc.uri.toString() === options.toString());
                    return existing || document(
                        providers.get(options.scheme).provideTextDocumentContent(options),
                        'plaintext', options.toString());
                }
                return document(options.content, options.language);
            }
        },
        languages: { setTextDocumentLanguage: async (doc, language) => {
            doc.languageId = language; return doc;
        } },
        commands: {
            registerCommand: (id, callback) => { commands.set(id, callback); return disposable(); },
            executeCommand: async (id, ...args) => {
                diff = args;
                assert.equal(id, 'vscode.diff');
                tabs.push({ input: new DiffTab(args[0], args[1]) });
            }
        }
    };
    const exported = {};
    const code = fs.readFileSync(require.resolve('../out/extension.js'), 'utf8');
    vm.runInNewContext(code, {
        exports: exported,
        require: id => id === 'vscode' ? api : id === 'node:crypto' ? crypto : require(id)
    });
    const context = { subscriptions: [] };
    exported.activate(context);
    const run = id => commands.get('code-recall.' + id)();
    const source = document('prefix\nint x = 1;\nsuffix');
    const sourceTab = { input: new TextTab(source.uri) };
    tabs.push(sourceTab);
    const select = (start, end) => {
        const selection = { start, end, isEmpty: start === end };
        api.window.activeTextEditor = { document: source, selection, selections: [selection] };
    };

    await run('compare');
    assert.match(notices.at(-1), /нет активной/);
    select(0, 0);
    await run('start');
    assert.equal(documents.length, 1, 'Пустое выделение не создаёт попытку');
    select(0, 6);
    api.window.activeTextEditor.selections.push({ start: 7, end: 10 });
    await run('start');
    assert.equal(documents.length, 1, 'Несколько выделений отклоняются');
    select(7, 17);
    await run('start');
    const attempt = api.window.activeTextEditor.document;
    assert.equal(attempt.content, '');
    assert.equal(attempt.languageId, 'cpp');
    assert.equal(source.content, 'prefix\nint x = 1;\nsuffix');
    source.content = 'changed source';
    attempt.content = 'int x = 2;';
    await run('compare');
    const original = documents.find(doc => doc.uri.toString() === diff[0].toString());
    assert.equal(original.content, 'int x = 1;', 'Эталон не зависит от изменения исходного файла');
    assert.equal(diff[1], attempt.uri);
    await run('resume');
    assert.equal(api.window.activeTextEditor.document, attempt);
    select(0, 7);
    confirmation = undefined;
    await run('start');
    await run('resume');
    assert.equal(api.window.activeTextEditor.document, attempt, 'Отмена сохраняет тренировку');
    attempt.content = 'int x = 1;';
    await run('compare');
    assert.match(notices.at(-1), /полностью совпадает/);
    confirmation = 'Завершить';
    cancelClose = true;
    await run('finish');
    await run('resume');
    assert.equal(api.window.activeTextEditor.document, attempt, 'Отмена закрытия сохраняет тренировку');
    cancelClose = false;
    await run('finish');
    assert.ok(tabs.includes(sourceTab), 'Исходная вкладка остаётся открытой');
    assert.ok(!tabs.some(tab => tab.input instanceof TextTab && tab.input.uri === attempt.uri),
        'Вкладка попытки закрыта');
    assert.ok(!tabs.some(tab => tab.input instanceof DiffTab), 'Сравнения текущей тренировки закрыты');
    assert.equal(attempt.content, 'int x = 1;', 'Завершение не стирает попытку');
    await run('compare');
    assert.match(notices.at(-1), /нет активной/);
    select(0, 7);
    await run('start');
    const nextAttempt = api.window.activeTextEditor.document;
    nextAttempt.isClosed = true;
    closeDocument(nextAttempt);
    await run('resume');
    assert.match(notices.at(-1), /нет активной/);
    context.subscriptions.forEach(resource => resource.dispose());
});
