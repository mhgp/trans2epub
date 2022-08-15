import * as fs from 'node:fs';
import * as path from 'node:path';
import * as structure from '../write/structure';
import * as adapter from '../write/adapter';
// header
// ********************************************
// title
// body
// ************************************************
// footer

const HEADER_BORDER_STRING: string = '********************************************';
const FOOTER_BORDER_STRING: string = '************************************************';

/**
 * 
 * @param textFileString 
 * @returns 
 */
export const analyzeSection = (textFileString: string, no: number, srcPath: string): adapter.BookSection => {
    const contentLines = textFileString.split(/\r?\n/g);
    const headerBoderIdx = contentLines.indexOf(HEADER_BORDER_STRING);
    const footerBoderIdx = contentLines.indexOf(FOOTER_BORDER_STRING);
    const result: adapter.BookSection = {
        no,
        title: '',
        body: [],
    };
    let currentLine = 0;
    if (headerBoderIdx !== -1) {
        //前書き
        result.foreword = contentLines.slice(0, headerBoderIdx).map((line) => analyzeParagraph(line, srcPath));
        currentLine = headerBoderIdx + 1;
    }
    //title
    result.title = contentLines[currentLine];
    currentLine += 2;
    if (footerBoderIdx === -1) {
        //本文
        result.body = contentLines.slice(currentLine).map((line) => analyzeParagraph(line, srcPath));
    } else {
        //本文
        result.body = contentLines.slice(currentLine, footerBoderIdx).map((line) => analyzeParagraph(line, srcPath));
        //後書き
        result.afterword = contentLines.slice(footerBoderIdx + 1).map((line) => analyzeParagraph(line, srcPath));
    }

    return result;
};


type RubyMatched = {
    name: 'ruby',
    content: {
        'start'       : (null|string),
        'base'        : string,
        'beginBracket': string,
        'text'        : string,
        'endBracket'  : string,
    },
    index: number,
    length: number
};
type ImgMatched = {
    name: 'img',
    content: {
        'user': string,
        'id'  : string,
    },
    index: number,
    length: number
};
type Matched = (RubyMatched|ImgMatched);

const bracketPair = new Map([
    ['《', '》'],
    ['〈', '〉'],
    ['（', '）'],
    ['(', ')'],
]);
//https://so-zou.jp/software/tech/programming/tech/regular-expression/meta-character/variable-width-encoding.htm
const rubyReg = /(?:([\u3000々〇〻\u3400-\u9FFF\uF900-\uFAFF\uD840-\uD87F\uDC00-\uDFFF]{1,10})([《〈（\(])([\u3000\u3041-\u3096\u30A1-\u30FA]{1,10})([\)）〉》])|([|｜])([^《〈（\(]{0,10})([《〈（\()])(?<text>[^\)）〉》]{1,10})([\)）〉》]))/g;
const imgReg = /<(i\d+)\|(\d+)>/g;

export const analyzeParagraph = (text: string, srcPath: string): structure.Paragraph => {
    const rubyMatched = [...text.matchAll(rubyReg)].map((match): RubyMatched => {
        if (typeof match[1] === 'string') {
            return {
                name: 'ruby',
                content: {
                    'start'       : null,
                    'base'        : match[1],
                    'beginBracket': match[2],
                    'text'        : match[3],
                    'endBracket'  : match[4],
                },
                index: match.index!,
                length: match[0].length,
            };
        } else {
            return {
                name: 'ruby',
                content: {
                    'start'       : match[5],
                    'base'        : match[6],
                    'beginBracket': match[7],
                    'text'        : match[8],
                    'endBracket'  : match[9],
                },
                index: match.index!,
                length: match[0].length,
            };
        }
    }).filter((val) => {
        return bracketPair.get((<RubyMatched>val).content.beginBracket) == (<RubyMatched>val).content.endBracket;
    });
    const imgMatched = [...text.matchAll(imgReg)].map((match): ImgMatched => {
        return {
            name: 'img',
            content: {
                'user': match[1],
                'id'  : match[2],
            },
            index: match.index!,
            length: match[0].length,
        };
    });
    const parsedArray: Matched[] = [...rubyMatched, ...imgMatched].sort((a, b) => {
        if (a.index < b.index) return -1;
        if (a.index > b.index) return  1;
        return 0;
    });
    const results: (structure.ParagraphChild)[] = [];
    let beginIndex: number = 0;
    for (let i = 0; i < parsedArray.length; i++) {
        const parsedItem = parsedArray[i];
        results.push(text.substring(beginIndex, parsedItem.index));
        if (parsedItem.name === 'ruby') {
            if (parsedItem.content.base == '') {
                results.push(<structure.Comment>{name: '-comment', text: parsedItem.content.start});
                results.push(`${parsedItem.content.beginBracket}${parsedItem.content.text}${parsedItem.content.endBracket}`);
            } else {
                const rubyChildren: structure.RubyChild[] = [];
                if (parsedItem.content.start !== null) {
                    rubyChildren.push(<structure.Rp>{name: 'rp', text: parsedItem.content.start});
                }
                rubyChildren.push(<structure.Rb>{name: 'rb', text: parsedItem.content.base});
                rubyChildren.push(<structure.Rp>{name: 'rp', text: parsedItem.content.beginBracket});
                rubyChildren.push(<structure.Rt>{name: 'rt', text: parsedItem.content.text});
                rubyChildren.push(<structure.Rp>{name: 'rp', text: parsedItem.content.endBracket});
                results.push({
                    name: 'ruby',
                    children: rubyChildren,
                });
            }
        } else if (parsedItem.name === 'img') {
            const fileMatch = new RegExp(`^${parsedItem.content.user}_${parsedItem.content.id}\.[^.]+`, 'i');
            const imsFolderPath = path.join(srcPath, 'img');
            const targetFiles: string[] = fs.readdirSync(imsFolderPath).filter((name) => {
                return fs.statSync(`${imsFolderPath}/${name}`).isFile() && fileMatch.test(name); //絞り込み
            });
            if (targetFiles.length === 1) {
                results.push({
                    name: 'img',
                    fullpath: path.join(imsFolderPath, targetFiles[0]),
                    alt: `<${parsedItem.content.user}|${parsedItem.content.id}>`
                });
            } else {
                console.warn(`"${`<${parsedItem.content.user}|${parsedItem.content.id}>`}"に対応する画像が見つかりません。`);
                results.push(text.substring(parsedItem.index, parsedItem.length));
            }
        }
        beginIndex = parsedItem.index + parsedItem.length;
    }
    results.push(text.substring(beginIndex));
    return {name: 'p', children: results};
};
