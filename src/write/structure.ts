export type Node = {name: string};
export type ParagraphChild = (string|Comment|Image|Ruby);
export type Paragraph = {name: 'p', children: ParagraphChild[]};

export type Comment = {name: '-comment', text: string};
export type Image = {name: 'img', fullpath: string, alt: string};

export type RubyChild = (Rb|Rp|Rt);
export type Ruby = {name: 'ruby', children: RubyChild[]};
export type Rb = {name: 'rb', text: string};
export type Rp = {name: 'rp', text: string};
export type Rt = {name: 'rt', text: string};
