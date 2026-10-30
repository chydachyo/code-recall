"""Создание отчётов. Зависимость: python-docx. Запускать из корня проекта."""
from pathlib import Path
import sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'deliverables'
OUT.mkdir(exist_ok=True)
AUTHOR = 'Лукьянов Егор Юрьевич'
REPO = 'https://github.com/chydachyo/code-recall'

def base(number, title):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Inches(8.5), Inches(11)
    sec.top_margin = sec.bottom_margin = Inches(0.7)
    sec.left_margin = sec.right_margin = Inches(0.8)
    for name in ['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Caption']:
        style = doc.styles[name]
        style.font.name = 'Times New Roman'
        style.font.color.rgb = RGBColor(0, 0, 0)
    normal = doc.styles['Normal']
    normal.font.size = Pt(12)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(7)
    doc.styles['Title'].font.size = Pt(23)
    doc.styles['Heading 1'].font.size = Pt(16)
    doc.styles['Heading 2'].font.size = Pt(13)
    doc.styles['Caption'].font.size = Pt(10)
    # Убираем рамки и линии, унаследованные от встроенного шаблона Word.
    for border in list(doc.styles.element.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
    doc.core_properties.author = AUTHOR
    doc.core_properties.title = title
    p = doc.add_paragraph('Университет ИТМО')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = doc.add_paragraph('Инструментальные средства разработки программного обеспечения')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph('')
    doc.add_paragraph(title, 'Title')
    doc.add_paragraph(f'Отчёт по лабораторной работе {number}', 'Subtitle')
    doc.add_paragraph('Code Recall', 'Heading 1')
    doc.add_paragraph(f'Выполнил: {AUTHOR}\nГруппа: M3113\nДата: 30 октября 2026 года')
    return doc

def p(doc, text):
    doc.add_paragraph(text)

def h(doc, text):
    doc.add_paragraph(text, 'Heading 1')

def figure(doc, name, caption):
    para = doc.add_paragraph()
    para.paragraph_format.keep_with_next = True
    para.add_run().add_picture(str(ROOT / 'docs' / 'images' / name), width=Inches(6.8))
    doc.add_paragraph(caption, 'Caption')

def table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.autofit = False
    t.columns[0].width = Inches(1.65)
    t.columns[1].width = Inches(5.1)
    for c, text in zip(t.rows[0].cells, headers):
        c.text = text
        for run in c.paragraphs[0].runs:
            run.bold = True
    for row in rows:
        for c, text in zip(t.add_row().cells, row):
            c.text = text
    for i, row in enumerate(t.rows):
        for col, c in enumerate(row.cells):
            c.width = Inches(1.65 if col == 0 else 5.1)
            tcpr = c._tc.get_or_add_tcPr()
            borders = OxmlElement('w:tcBorders')
            for side in ['top', 'left', 'bottom', 'right']:
                b = OxmlElement('w:' + side)
                b.set(qn('w:val'), 'single')
                b.set(qn('w:sz'), '4')
                b.set(qn('w:color'), 'D9D9D9')
                borders.append(b)
            tcpr.append(borders)
            shade = OxmlElement('w:shd')
            shade.set(qn('w:fill'), 'E8EDF2' if i == 0 else ('F7F7F7' if i % 2 == 0 else 'FFFFFF'))
            tcpr.append(shade)
            for para in c.paragraphs:
                para.paragraph_format.space_after = Pt(5)
                para.paragraph_format.space_before = Pt(5)
                for run in para.runs:
                    run.font.size = Pt(10.5)

doc = base('3', 'Создание расширения для VS Code')
h(doc, 'Цель и результат работы')
p(doc, 'Цель работы — изучить механизм расширения среды разработки и реализовать собственный плагин. Разработан Code Recall — тренажёр восстановления выделенного кода по памяти. Пользователь получает пустую вкладку для попытки и сравнивает результат с сохранённым оригиналом.')
h(doc, 'Назначение расширения')
p(doc, 'Code Recall помогает готовиться к защите лабораторных работ: можно выделить функцию, написать её самостоятельно и увидеть текстовые различия. Исходный файл остаётся неизменным. Первая версия поддерживает одну активную тренировку и не отправляет код внешним сервисам.')
h(doc, 'Материалы проекта')
p(doc, f'Общедоступный репозиторий исходного кода:\n{REPO}\nУстановочный пакет: code-recall-0.0.1.vsix.\nОсновной исходный файл: src/extension.ts.\nАвторство и возможности приведены в README.md.')

doc.add_page_break()
h(doc, 'Архитектура VS Code и расширений')
p(doc, 'Редактор предоставляет интерфейс пользователя и Extension API для работы с документами, командами, вкладками и уведомлениями. Код расширений выполняется в среде Extension Host. Расширение объявляет свои возможности в манифесте package.json и использует API, не изменяя исходный код редактора.')
p(doc, 'В contributes.commands объявлены четыре команды Code Recall. VS Code активирует расширение при обращении к одной из них. Функция activate создаёт RecallTrainer и связывает идентификаторы команд с обработчиками. Зарегистрированные ресурсы помещаются в context.subscriptions для освобождения при отключении расширения.')
table(doc, ['Команда', 'Действие'], [
    ['code-recall.start', 'Проверяет выделение, сохраняет снимок оригинала и открывает пустую попытку.'],
    ['code-recall.compare', 'Открывает встроенное сравнение оригинала и попытки.'],
    ['code-recall.resume', 'Возвращает пользователя к редактируемому документу попытки.'],
    ['code-recall.finish', 'После подтверждения закрывает вкладки тренировки; предлагает сохранение несохранённого текста.']
])
h(doc, 'Хранение состояния и сравнение')
p(doc, 'Training хранит текст оригинала, идентификатор языка, URI оригинала и документ попытки. Оригинал предоставляется через TextDocumentContentProvider со схемой code-recall и доступен только для чтения. Попытка создаётся через workspace.openTextDocument и редактируется как обычный текстовый документ.')
p(doc, 'Команда vscode.diff показывает оба документа. Проверка полного совпадения сравнивает текст после нормализации CRLF в LF. Это не проверка семантики: другое корректное решение может отличаться от эталона. Обработчики не запускают компилятор пользовательского кода.')

doc.add_page_break()
h(doc, 'Разработка и проверка')
p(doc, 'Заготовка создана генератором Yeoman generator-code: TypeScript, сборщик esbuild, менеджер npm. Исходная команда Hello World заменена командами тренажёра. В манифест добавлены контекстное меню редактора, описание, авторство и ссылка на репозиторий.')
p(doc, 'Выполнены npm.cmd run compile и npm.cmd run test:logic. Проверка типов TypeScript, ESLint и сборка завершились успешно. Автоматическая проверка с имитацией API охватывает пустое и множественное выделение, неизменность снимка, отмену замены, сравнение, возврат, отмену закрытия и завершение.')
p(doc, 'Вручную в VS Code проверены создание попытки, подсветка отличий a + b и a * b, а также уведомление о полном совпадении после исправления. Интеграционный тестовый запуск отдельного VS Code был заблокирован ограничениями среды до выполнения тестов; он не учитывается как успешно пройденный.')
figure(doc, 'comparison.png', 'Рисунок 1 — сравнение оригинала и попытки в установленном Code Recall')
h(doc, 'Ограничения и вывод')
p(doc, 'Тренировка хранится в памяти текущего окна до перезагрузки или отключения расширения. Автодополнение других расширений не отключается. Получен работающий плагин с четырьмя командами, отдельной попыткой и сравнением; установка не требует запуска отладки F5.')
p(doc, 'Документация: https://code.visualstudio.com/api/references/vscode-api\nУпаковка: https://code.visualstudio.com/api/working-with-extensions/publishing-extension')
if '--installation-only' not in sys.argv:
    doc.save(OUT / 'Lab3_Code_Recall.docx')

doc = base('3-1', 'Установка и применение плагина')
h(doc, 'Цель и выбранное расширение')
p(doc, 'Цель работы — подключить плагин к выбранной среде разработки и показать его применение. Для VS Code установлен Code Recall версии 0.0.1, идентификатор chydachyo.code-recall. Расширение предназначено для самостоятельного восстановления фрагментов кода по памяти.')
doc.add_page_break()
h(doc, 'Процесс установки')
p(doc, 'Сначала подготовлен установочный пакет code-recall-0.0.1.vsix. Пакет содержит манифест расширения, README, журнал изменений и скомпилированный JavaScript. Для сборки использована команда npm.cmd run package:offline; автономный упаковщик включён в исходники проекта.')
p(doc, 'В обычном окне VS Code открыта палитра Ctrl+Shift+P, выбрана команда Extensions: Install from VSIX и указан файл пакета. После установки редактор показал сообщение Completed installing extension. В разделе Extensions появилась карточка Code Recall с кнопками Disable и Uninstall и источником установки VSIX.')
p(doc, 'Для использования установленного расширения F5 не требуется. F5 запускает отдельный Extension Development Host только при разработке. Остановка этого сеанса не является завершением отдельной тренировки.')
figure(doc, 'installed.png', 'Рисунок 1 — установленный Code Recall с идентификатором chydachyo.code-recall')

doc.add_page_break()
h(doc, 'Применение на практике')
p(doc, 'В файле examples/sum.cpp выделена функция sum, складывающая два числа. Через палитру вызвана команда Code Recall: Начать тренировку по выделенному коду. В пустой вкладке введена попытка с умышленным отличием: return a * b вместо return a + b.')
p(doc, 'Команда Code Recall: Сравнить с оригиналом открыла две части редактора. Слева находится неизменяемый оригинал, справа — редактируемая попытка. VS Code подсветил отличие операторов. Скриншот ниже фиксирует практическое применение после установки из VSIX.')
figure(doc, 'comparison.png', 'Рисунок 2 — выявление отличия между исходной функцией и восстановленной попыткой')
p(doc, 'При исправлении текста до полного совпадения расширение показывает уведомление. Для окончания занятия используется Code Recall: Завершить тренировку. После подтверждения закрываются вкладка попытки и её сравнения; несохранённый код обрабатывается стандартным запросом сохранения VS Code.')
h(doc, 'Вывод')
p(doc, 'Плагин установлен в обычный VS Code и применён для проверки восстановленного кода. Подключение расширения добавило команды и интерфейс сравнения без изменения редактора. Полученный инструмент можно использовать при подготовке к защите лабораторных работ.')
p(doc, f'Исходники и инструкция: {REPO}\nУстановка расширений: https://code.visualstudio.com/docs/configure/extensions/extension-marketplace')
doc.save(OUT / 'Lab3_1_Plugin_Installation.docx')
print('Created two reports')
