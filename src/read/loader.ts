import * as fs from 'node:fs';
import * as adapter from '../write/adapter';
import * as analyzer from './sectionAnalyzer';

const SUMMARY_FILE_NAME: string = 'summary.json';


type ChapterConstitution = {
    'title': string,
    'begin': number,
    'last': number,
};
type SummaryStrict = {
	'共通ファイル名': string,
	'タイトル': string,
	'作者名': string,
	'あらすじ': string[],
	'キーワード': string[],
    'ジャンル': string,
	'掲載日': string,
	'更新': string,
	'URL': string,
	'chapters': ChapterConstitution[]
};
type chapterFile = {
    num: number,
    path: string,
};


export class NovelLoader implements adapter.ILoader {
    private srcPath: string;
    constructor(srcPath: string) {
        this.srcPath = srcPath;
    }
    start(): adapter.LoaderResult {
        const jsonText = fs.readFileSync(`${this.srcPath}/${SUMMARY_FILE_NAME}`, {encoding: 'utf-8'});
        const summaryData = JSON.parse(jsonText) as SummaryStrict;
        summaryData['chapters'] = summaryData['chapters'].sort((a, b) => {
            if (a.begin < b.begin) {
                return -1;
            }
            if (a.begin > b.begin) {
                return 1;
            }
            return 0;
        });

        const ncode = summaryData['共通ファイル名'];
        const tmp: Map<string, (string[])> = new Map();
        tmp.set('あらすじ', summaryData['あらすじ']);
        tmp.set('作者', [summaryData['作者名']]);
        tmp.set('キーワード', [summaryData['キーワード'].join(' ')]);
        if (Object.prototype.hasOwnProperty.call(summaryData, 'ジャンル')) tmp.set('ジャンル', [summaryData['ジャンル']]);
        tmp.set('掲載日', [summaryData['掲載日']]);
        tmp.set('更新', [summaryData['更新']]);
        tmp.set('URL', [summaryData['URL']]);
        const reader = new SectionFilesReader(this.srcPath, ncode);
        return {
            info: {
                title: summaryData['タイトル'],
                author: summaryData['作者名'],
                updated: new Date(summaryData['更新']),
                id: summaryData['URL'],
                infomations: tmp,
                outline: summaryData['chapters'],
            },
            getSections: reader.readChapters.bind(reader),
        };
    }
}

class SectionFilesReader {
    private srcPath: string
    private commonName: string
    constructor(path: string, ncode: string) {
        this.srcPath = path
        this.commonName = ncode
    }
    async *readChapters(): AsyncGenerator<adapter.BookSection> {
        const chapterList: chapterFile[] = await getFilePathList(this.commonName, this.srcPath);
        for (const chapterInfo of chapterList) {
            const textFile = fs.readFileSync(chapterInfo.path, {encoding: 'utf-8'});
            yield analyzer.analyzeSection(textFile, chapterInfo.num, this.srcPath);
        }
    }
}

/**
 * 
 * @param nCode 
 * @param srcPath 
 * @returns 
 */
async function getFilePathList(nCode: string, srcPath: string): Promise<chapterFile[]> {
    const fileMatch = new RegExp(`^${nCode}-(\\d+)\\.txt`, 'i');
    const targetFiles: chapterFile[] = fs.readdirSync(srcPath).filter((name) => {
        return fs.statSync(`${srcPath}/${name}`).isFile() && fileMatch.test(name); //絞り込み
    }).map((name) => {
        return {num: Number(fileMatch.exec(name)![1]), path: `${srcPath}/${name}`};
    });
    return new Promise((resolve) => {
        resolve(targetFiles.sort((a, b) => {
            if (a.num < b.num) {
                return -1;
            }
            if (a.num > b.num) {
                return 1;
            }
            return 0;
        }));
    });
};
