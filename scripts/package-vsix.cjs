// Минимальный автономный упаковщик VSIX для локальной установки.
// Не публикует расширение в Marketplace и не обращается к сети.
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

async function main() {
    const root = path.resolve(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const escape = value => String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[char]));
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json"/>
<Default Extension="js" ContentType="application/javascript"/>
<Default Extension="md" ContentType="text/markdown"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>`);
    zip.file('extension.vsixmanifest', `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
<Metadata>
<Identity Language="ru-RU" Id="${escape(pkg.name)}" Version="${escape(pkg.version)}" Publisher="${escape(pkg.publisher)}"/>
<DisplayName>${escape(pkg.displayName)}</DisplayName>
<Description xml:space="preserve">${escape(pkg.description)}</Description>
<Categories>Education</Categories>
<Properties>
<Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escape(pkg.engines.vscode)}"/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
<Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true"/>
</Properties>
</Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
<Dependencies/>
<Assets>
<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/>
</Assets>
</PackageManifest>`);
    // В установку входят только необходимые для работы файлы.
    for (const file of ['package.json', 'README.md', 'CHANGELOG.md', 'dist/extension.js',
        'docs/images/installed.png', 'docs/images/comparison.png']) {
        zip.file('extension/' + file, fs.readFileSync(path.join(root, file)));
    }
    const output = path.join(root, `${pkg.name}-${pkg.version}.vsix`);
    fs.writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    console.log(`Created ${path.basename(output)}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
