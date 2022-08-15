import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip = require("jszip");
import * as adapter from './adapter';
import * as structure from './structure';
import * as probe from 'probe-image-size';

export const createBase = (): JSZip => {
    const templatePath = getEpubTemplateFolderPath();
    const zip = new JSZip();
    zip.file('mimetype', fs.readFileSync(path.join(templatePath, 'mimetype')), {compression: 'STORE'});
    zip.file('META-INF/container.xml', fs.readFileSync(path.join(templatePath, 'META-INF/container.xml')));
    zip.file('EPUB/book.opf', '');
    zip.file('EPUB/css/default.css', fs.readFileSync(path.join(templatePath, 'EPUB/css/default.css')));
    zip.folder('EPUB/img');
    zip.file('EPUB/nav.xhtml', '');
    zip.file('EPUB/cover.xhtml', '');
    return zip;
};

export type ManifestItem = {id: string, path: string, mimetype: string};

export const appendOpf = (zip: JSZip, id: string, title: string, author: string, updated: Date, files: ManifestItem[], pages: string[]) => {
    const FILE_NAME: string = 'EPUB/book.opf';
    let dest: string = loadXmlFile(FILE_NAME);
    //
    dest = dest.replace(/<dc:identifier id="pub-id"><\/dc:identifier>/, `<dc:identifier id="pub-id">${escapeHTML(id)}</dc:identifier>`);
    dest = dest.replace(/<dc:title><\/dc:title>/, `<dc:title>${escapeHTML(title)}</dc:title>`);
    dest = dest.replace(/<dc:creator id="creator"><\/dc:creator>/, `<dc:creator id="creator">${escapeHTML(author)}</dc:creator>`);
    let modified = '';
    modified += `${updated.getUTCFullYear()}-${`00${updated.getUTCMonth()}`.slice(-2)}-${`00${updated.getUTCDate()}`.slice(-2)}`;
    modified += `T${`00${updated.getUTCHours()}`.slice(-2)}:${`00${updated.getUTCMinutes()}`.slice(-2)}:${`00${updated.getUTCSeconds()}`.slice(-2)}Z`;
    dest = dest.replace(/<meta property="dcterms:modified"><\/meta>/, `<meta property="dcterms:modified">${modified}</meta>`);
    //
    const byMetadata: string = files.map(val => {
        return `<item id="${escapeHTML(val.id)}" href="${escapeHTML(val.path)}" media-type="${escapeHTML(val.mimetype)}"/>`;
    }).join('');
    dest = dest.replace(/<\/manifest>/g, `${byMetadata}</manifest>`);
    //
    const byItemref: string = pages.map(val => {
        return `<itemref idref="${escapeHTML(val)}"/>`;
    }).join('');
    dest = dest.replace(/<\/spine>/g, `${byItemref}</spine>`);
    //
    {
        const imgFolder = zip.folder('EPUB/img');
        if (imgFolder !== null) {
            let cnt = 0;
            imgFolder.forEach(() => { cnt += 1; });
            if (cnt === 0) {
                zip.folder('EPUB')!.remove('img');
            }
        }
    }
    //
    zip.file(FILE_NAME, dest);
};

export type OutlineItem = {
    text: string,
    href?: string,
    children?: OutlineItem[]
};

export const appendNav = (zip: JSZip, outline: OutlineItem[]) => {
    const FILE_NAME: string = 'EPUB/nav.xhtml';
    let dest: string = loadXmlFile(FILE_NAME);
    const toXml = (item: OutlineItem): string => {
        let mutChildHtml = '';
        //
        if (Object.prototype.hasOwnProperty.call(item, 'href')) {
            mutChildHtml += `<a href="${escapeHTML(item.href!)}">${escapeHTML(item.text)}</a>`
        } else {
            mutChildHtml += `<span>${escapeHTML(item.text)}</span>`
        }
        //
        if (Object.prototype.hasOwnProperty.call(item, 'children')) {
            mutChildHtml += `<ol>${item.children!.map(toXml).join('')}</ol>`;
        }
        return `<li>${mutChildHtml}</li>`
    };
    dest = dest.replace('></ol>', `>${outline.map(toXml).join('')}</ol>`);
    zip.file(FILE_NAME, dest);
};

export const appendCover = (zip: JSZip, title: string, infomations: Map<string,string[]>) => {
    const FILE_NAME: string = 'EPUB/cover.xhtml';
    let dest: string = loadXmlFile(FILE_NAME);
    dest = dest.replace('></h1>', `>${escapeHTML(title)}</h1>`); //'h1[class="heading title"]'
    const tbody = [...infomations].map(([th, td]: [string, string[]]) => {
        return `<tr><th>${escapeHTML(th)}</th><td>${td.map(escapeHTML).join('<br/>')}</td></tr>`;
    }).join('');
    dest = dest.replace('<tbody></tbody>', `<tbody>${tbody}</tbody>`); //'table[class="informations"] > tbody'

    zip.file(FILE_NAME, dest);
};

export type SectionResult = {
    title: string,
    page: ManifestItem,
    img: ManifestItem[],
};
export const appendSection = (zip: JSZip, chapterTitle: (null|string), sectionData: adapter.BookSection): SectionResult => {
    const FILE_NAME: string = 'EPUB/section-1.xhtml';
    let dest: string = loadXmlFile(FILE_NAME);
    dest = dest.replace(/<title>節<\/title>/g, `<title>${escapeHTML(sectionData.title)}</title>`)
    let bodyInner = '';
    if (chapterTitle === null) {
        bodyInner += `<h1 class="heading section">${escapeHTML(sectionData.title)}</h1>`;
    } else {
        bodyInner += `<h1 class="heading chapter">${escapeHTML(chapterTitle)}</h1>`;
        bodyInner += `<h2 class="heading section">${escapeHTML(sectionData.title)}</h2>`;
    }
    const fileList: ManifestItem[] = [];
    const imgFolder: JSZip = zip.folder('EPUB/img')!;
    const d = (arr: structure.Paragraph[]) => {
        return arr.map(
            (val) => toXmlFromParagraphStructure(val, fileList, imgFolder)
        ).join('<br/>');
    };
    if (Object.prototype.hasOwnProperty.call(sectionData, 'foreword')) {
        bodyInner += `<header>${d(sectionData.foreword!)}</header><hr/>`;
    }
    bodyInner += `<main>${d(sectionData.body)}</main>`;
    if (Object.prototype.hasOwnProperty.call(sectionData, 'afterword')) {
        bodyInner += `<hr/><footer>${d(sectionData.afterword!)}</footer>`;
    }
    dest = dest.replace(/<body><\/body>/g, `<body>${bodyInner}</body>`)
    zip.file(`EPUB/section-${sectionData.no}.xhtml`, dest);

    return {
        title: sectionData.title,
        page: {id: `section-${sectionData.no}`, path: `./section-${sectionData.no}.xhtml`, mimetype: 'application/xhtml+xml'},
        img: fileList,
    };
};

const toXmlFromParagraphStructure = (p: structure.Paragraph, fileList: ManifestItem[], imgFolder: JSZip) => {
    return p.children.reduce((output: string, val: structure.ParagraphChild) => {
        let str: string = '';
        if (typeof val === 'string') {
            str = escapeHTML(val);
        } else if (val.name === '-comment') {
            str = '';
        } else if (val.name === 'img') {
            const chunks = fs.readFileSync(val.fullpath, null);
            const imgInfo = probe.sync(chunks);
            if (imgInfo === null) throw new Error();
            const imgFilename =path.basename(val.fullpath);
            str = `<img src="./img/${imgFilename}" alt="${escapeHTML(val.alt)}" width="${imgInfo.width}" height="${imgInfo.height}"/>`;
            imgFolder.file(imgFilename, chunks);
            fileList.push({id: imgFilename, path: `./img/${imgFilename}`, mimetype: imgInfo.mime});
        } else if (val.name === 'ruby') {
            str = `<ruby>${val.children.map((rubyChild, idx) => {
                if (rubyChild.name === 'rb') {
                    return `${escapeHTML(rubyChild.text)}`;
                } else if (rubyChild.name === 'rp') {
                    if (idx === 0) return '';
                    return `<rp>${escapeHTML(rubyChild.text)}</rp>`;
                } else if (rubyChild.name === 'rt') {
                    return `<rt>${escapeHTML(rubyChild.text)}</rt>`;
                } else {
                    throw new Error('未定義');
                }
            }).join('')}</ruby>`;
        } else {
            throw new Error('未定義');
        }
        return `${output}${str}`;
    }, '');
};

const loadXmlFile = (filePath: string): string => {
    const src: string = fs.readFileSync(path.join(getEpubTemplateFolderPath(), filePath), 'utf8');
    return src.replace(/>\s+</g, '><');
};

const escapeReg = /[&<>"'{}]/g
const escapeMap = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#123;'],
    ['{', '&#123;'],
    ['}', '&#125;'],
]);
const escapeHTML = (val: string): string => {
    return val.replace(escapeReg, (char) => escapeMap.get(char)!);
};

const getEpubTemplateFolderPath = (): string => {
    return path.join(path.dirname(process.argv[1]), 'write/template');
};
