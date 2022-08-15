import * as fs from 'node:fs';
import { NovelLoader } from './read/loader';
import { EpubWriter } from './write/creater';

if (process.argv.length <= 2) throw new Error('フォルダを指定してください。');
const folderPath = process.argv[2];
if (! fs.existsSync(folderPath)) throw new Error(`"${folderPath}"は存在しません。`);
new EpubWriter(new NovelLoader(folderPath), {output: folderPath}).create();