
import type { ANTLRInputStream as InputStream, CharStream } from 'antlr4ts';
import { Interval } from 'antlr4ts/misc/Interval';

export default class CaseChangingStream implements CharStream {
    private stream: InputStream;

    private upper: boolean;

    constructor(public sourceName: string, stream: InputStream, upper: boolean) {
        this.stream = stream;
        this.upper = upper;
    }

    LA(offset: number) {
        const c: any = this.stream.LA(offset);
        if (c <= 0) {
            return c;
        }
        return String.fromCodePoint(c)[this.upper ? 'toUpperCase' : 'toLowerCase']().codePointAt(0);
    }

    reset() {
        return this.stream.reset();
    }

    consume() {
        return this.stream.consume();
    }

    LT(offset: number) {
        return this.stream.LT(offset);
    }

    mark() {
        return this.stream.mark();
    }

    release(marker: any) {
        return this.stream.release(marker);
    }

    seek(_index: number) {
        return this.stream.seek(_index);
    }

    getText(interval: Interval) {
        return this.stream.getText(interval);
    }

    toString() {
        return this.stream.toString();
    }

    get index() {
        return this.stream.index;
    }

    get size() {
        return this.stream.size;
    }
}
