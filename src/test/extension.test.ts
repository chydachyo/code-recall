import * as assert from 'assert';
import * as vscode from 'vscode';
import { RecallTrainer } from '../extension';

suite('Code Recall', () => {
    let trainer: RecallTrainer;

    setup(() => {
        trainer = new RecallTrainer();
    });

    teardown(() => {
        trainer.dispose();
    });

    async function source(content: string): Promise<vscode.TextEditor> {
        const doc = await vscode.workspace.openTextDocument({ language: 'cpp', content });
        return vscode.window.showTextDocument(doc, { preview: false });
    }

    test('Пустое выделение не открывает тренировку', async () => {
        const editor = await source('int value = 1;');
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await trainer.start();
        assert.strictEqual(vscode.window.activeTextEditor?.document, editor.document);
    });

    test('Выделение создаёт пустую попытку; diff использует снимок, а не изменённый исходник', async () => {
        const text = 'int sum(int a, int b) { return a + b; }';
        const editor = await source(text + '\n// outside selection');
        editor.selection = new vscode.Selection(0, 0, 0, text.length);
        await trainer.start();
        const attempt = vscode.window.activeTextEditor!;
        assert.notStrictEqual(attempt.document, editor.document);
        assert.strictEqual(attempt.document.getText(), '');
        assert.strictEqual(attempt.document.languageId, 'cpp');
        assert.strictEqual(editor.document.getText(), text + '\n// outside selection');

        await editor.edit(edit => edit.replace(new vscode.Range(0, 0, 0, text.length), 'changed source'));
        await attempt.edit(edit => edit.insert(new vscode.Position(0, 0), 'my attempt'));
        await trainer.compare();
        const diff = vscode.window.tabGroups.all.flatMap(group => group.tabs)
            .map(tab => tab.input)
            .find((input): input is vscode.TabInputTextDiff =>
                input instanceof vscode.TabInputTextDiff &&
                input.modified.toString() === attempt.document.uri.toString());
        assert.ok(diff, 'Открыта вкладка сравнения');
        const original = await vscode.workspace.openTextDocument(diff.original);
        assert.strictEqual(original.getText(), text);
        assert.strictEqual(original.languageId, 'cpp');
        await trainer.resume();
        assert.strictEqual(vscode.window.activeTextEditor?.document, attempt.document);
        assert.strictEqual(attempt.document.getText(), 'my attempt');
    });
});
