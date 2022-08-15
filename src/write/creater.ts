import * as fs from 'node:fs';
import * as path from 'node:path';
import * as epub from './base';
import * as adapter from './adapter';


type EpubWriterOption = {
    output: string
};

/**
 * 
 */
export class EpubWriter {
    private loader: adapter.ILoader
    private option: EpubWriterOption
    constructor(src: adapter.ILoader, option: EpubWriterOption) {
        this.loader = src;
        this.option = option;
    }
    async create() {
        const {info, getSections} = this.loader.start();
        //
        const book = epub.createBase();
        epub.appendCover(
            book,
            info.title,
            info.infomations
        );
        //
        let sectionFiles: epub.ManifestItem[] = [];
        let imgFiles: epub.ManifestItem[] = [];
        const pageList: string[] = [];
        const outlineList: epub.OutlineItem[] = [];
        let thisOutline: epub.OutlineItem[] = outlineList;
        let chapterCounter = 0;
        let chapterTitle: (null|string)
        for await (const section of getSections()) {
            chapterTitle = null;
            if (info.outline.length > 0 && info.outline.length > chapterCounter) {
                if (section.no === info.outline[chapterCounter].begin) {
                    thisOutline = [];
                    outlineList.push({
                        text: info.outline[chapterCounter].title,
                        children: thisOutline,
                    });
                    chapterTitle = info.outline[chapterCounter].title;
                    chapterCounter += 1;
                }
            }
            const tmp = epub.appendSection(
                book,
                chapterTitle,
                section
            );
            pageList.push(tmp.page.id);
            sectionFiles.push(tmp.page);
            imgFiles = imgFiles.concat(tmp.img);
            thisOutline.push({
                text: tmp.title,
                href: tmp.page.path,
            });
        }
        //
        epub.appendNav(
            book,
            outlineList
        );
        //
        epub.appendOpf(
            book,
            info.id,
            info.title,
            info.author,
            info.updated,
            [...sectionFiles, ...imgFiles],
            pageList
        );
        //
        book.generateAsync({
            type: 'uint8array',
            compression: 'DEFLATE', 
            compressionOptions: {
                level: 9
            }
        }).then((content) => {
            const fileName = `[${info.author}]${info.title}.epub`;
            fs.writeFileSync(path.join(this.option.output, fileName), content, 'binary');
        });
    }
}
