import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';

/** Снимок выделения и отдельный документ для восстановления по памяти. */
interface Training {
    original: string;
    language: string;
    originalUri: vscode.Uri;
    attempt: vscode.TextDocument;
}

/** Управляет одной тренировкой в текущем окне редактора. */
export class RecallTrainer implements vscode.Disposable {
    private training: Training | undefined;
    private busy = false;
    private readonly snapshots = new Map<string, string>();
    private readonly resources: vscode.Disposable[] = [];
    private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    constructor() {
        this.resources.push(this.status);
        // Виртуальные оригиналы доступны только для чтения.
        this.resources.push(vscode.workspace.registerTextDocumentContentProvider('code-recall', {
            provideTextDocumentContent: uri => this.snapshots.get(uri.toString()) ?? ''
        }));
        this.resources.push(vscode.workspace.onDidCloseTextDocument(document => {
            if (document === this.training?.attempt) {
                this.clearTraining();
            }
            if (document.uri.scheme === 'code-recall' &&
                document.uri.toString() !== this.training?.originalUri.toString()) {
                this.snapshots.delete(document.uri.toString());
            }
        }));
        this.status.command = 'code-recall.compare';
        this.status.tooltip = 'Сравнить текущую попытку с оригиналом';
    }

    /** Блокировка предотвращает пересечение команд во время диалогов. */
    async run(action: () => Promise<void>): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        try {
            await action();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await vscode.window.showErrorMessage(`Code Recall: ${message}`);
        } finally {
            this.busy = false;
        }
    }

    /** Запоминает выделение без изменения исходного файла. */
    async start(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            void vscode.window.showWarningMessage('Code Recall: открой файл и выдели код.');
            return;
        }
        if (editor.selections.length !== 1) {
            void vscode.window.showWarningMessage('Code Recall: выбери один непрерывный фрагмент.');
            return;
        }
        const original = editor.document.getText(editor.selection);
        if (editor.selection.isEmpty || original.trim().length === 0) {
            void vscode.window.showWarningMessage('Code Recall: сначала выдели непустой фрагмент кода.');
            return;
        }
        const language = editor.document.languageId;
        if (this.training) {
            const answer = await vscode.window.showWarningMessage(
                'Завершить текущую тренировку и начать новую? Вкладка с предыдущей попыткой останется открытой.',
                { modal: true }, 'Начать новую'
            );
            if (answer !== 'Начать новую') {
                return;
            }
        }
        const attempt = await vscode.workspace.openTextDocument({ language, content: '' });
        await vscode.window.showTextDocument(attempt, { preview: false, viewColumn: editor.viewColumn });
        this.clearTraining();
        const originalUri = vscode.Uri.from({
            scheme: 'code-recall', path: `/${randomUUID()}/Оригинал`
        });
        this.snapshots.set(originalUri.toString(), original);
        this.training = { original, language, originalUri, attempt };
        this.status.text = '$(diff) Code Recall: сравнить';
        this.status.show();
        void vscode.window.showInformationMessage(
            'Code Recall: восстанови код в пустой вкладке. Для проверки нажми «Code Recall: сравнить» в строке состояния.'
        );
    }

    /** Слева неизменяемый эталон, справа редактируемая попытка. */
    async compare(): Promise<void> {
        const training = await this.getTraining();
        if (!training) {
            return;
        }
        const document = await vscode.workspace.openTextDocument(training.originalUri);
        await vscode.languages.setTextDocumentLanguage(document, training.language);
        await vscode.commands.executeCommand(
            'vscode.diff', training.originalUri, training.attempt.uri,
            'Code Recall — оригинал ↔ твоя попытка', { preview: false }
        );
        const normalize = (text: string) => text.replace(/\r\n/g, '\n');
        if (normalize(training.original) === normalize(training.attempt.getText())) {
            void vscode.window.showInformationMessage('Code Recall: код полностью совпадает с оригиналом!');
        }
    }

    async resume(): Promise<void> {
        const training = await this.getTraining();
        if (training) {
            await vscode.window.showTextDocument(training.attempt, { preview: false });
        }
    }

    /** Закрывает только вкладки текущей тренировки, сохраняя стандартный запрос сохранения. */
    async finish(): Promise<void> {
        const training = await this.getTraining();
        if (!training) {
            return;
        }
        const answer = await vscode.window.showWarningMessage(
            'Завершить тренировку и закрыть её вкладки? Для несохранённого кода VS Code предложит сохранение.',
            { modal: true }, 'Завершить'
        );
        if (answer === 'Завершить') {
            const attemptUri = training.attempt.uri.toString();
            const originalUri = training.originalUri.toString();
            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => {
                const input = tab.input;
                if (input instanceof vscode.TabInputText) {
                    return input.uri.toString() === attemptUri || input.uri.toString() === originalUri;
                }
                return input instanceof vscode.TabInputTextDiff &&
                    input.original.toString() === originalUri && input.modified.toString() === attemptUri;
            });
            // При отмене сохранения попытка остаётся доступна для продолжения.
            if (tabs.length > 0 && !await vscode.window.tabGroups.close(tabs)) {
                return;
            }
            this.clearTraining();
            this.snapshots.delete(originalUri);
        }
    }

    private async getTraining(): Promise<Training | undefined> {
        if (this.training?.attempt.isClosed) {
            this.clearTraining();
        }
        if (!this.training) {
            void vscode.window.showInformationMessage('Code Recall: нет активной тренировки. Выдели код и начни новую.');
        }
        return this.training;
    }

    private clearTraining(): void {
        const uri = this.training?.originalUri;
        this.training = undefined;
        this.status.hide();
        // Открытое сравнение сохраняет эталон до закрытия его документа.
        if (uri && !vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString())) {
            this.snapshots.delete(uri.toString());
        }
    }

    dispose(): void {
        this.training = undefined;
        this.snapshots.clear();
        this.resources.forEach(resource => resource.dispose());
    }
}

/** Точка входа. Подписки автоматически освобождаются при отключении. */
export function activate(context: vscode.ExtensionContext): void {
    const trainer = new RecallTrainer();
    context.subscriptions.push(trainer);
    const commands: [string, () => Promise<void>][] = [
        ['code-recall.start', () => trainer.start()],
        ['code-recall.compare', () => trainer.compare()],
        ['code-recall.resume', () => trainer.resume()],
        ['code-recall.finish', () => trainer.finish()]
    ];
    for (const [id, action] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, () => trainer.run(action)));
    }
}

export function deactivate(): void {}
