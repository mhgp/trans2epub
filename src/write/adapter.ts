import * as node from './structure';

export type BookSection = {
    no: number,
    title: string,
    foreword?: node.Paragraph[],
    body: node.Paragraph[],
    afterword?: node.Paragraph[],
};

export type OutlineItem = {
    title: string,
    begin: number
};

export type BookSummary = {
    title: string,
    author: string,
    updated: Date,
    id: string,
    infomations: Map<string, (string[])>,
    outline: OutlineItem[],
};

export type LoaderResult = {
    info: BookSummary,
    getSections: () => AsyncGenerator<BookSection>,
};

export interface ILoader {
    start(): LoaderResult
}
