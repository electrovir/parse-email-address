// cspell:word atext

/**
 * The kinds of tokens that an [RFC 5322](https://datatracker.ietf.org/doc/html/rfc5322#section-3.4)
 * address list is built from. Whitespace and comments are not tokens: the tokenizer drops them and
 * records their presence in {@link AddressListToken.isSpaced}.
 */
export enum AddressListTokenType {
    /** An `atom` run or a `quoted-string`. */
    Word = 'word',
    /** A bracketed `domain-literal`, such as `[192.0.2.10]`. */
    DomainLiteral = 'domain-literal',
    /** One of the `specials` characters that give an address list its structure. */
    Special = 'special',
}

/** A single token produced by {@link tokenizeAddressList}. */
export type AddressListToken = {
    type: AddressListTokenType;
    /** The token exactly as it appeared in the header, with any quoting retained. */
    raw: string;
    /** The token's value with quoting removed and whitespace collapsed, suitable for display. */
    text: string;
    /**
     * Whether whitespace or a comment separated this token from the preceding one. An address's
     * `local-part` is a run of tokens with no separation between them, so this is what keeps `Jane
     * Doe <jane@example.org>` from reading as an address named `Doe`.
     */
    isSpaced: boolean;
};

/**
 * The `specials` characters that can appear in an address list without quoting. `[` and `]` are
 * handled as domain literals instead, and `(`, `)`, and `"` are consumed by the tokenizer.
 */
const specialCharacters = [
    '<',
    '>',
    '@',
    ',',
    ';',
    ':',
];

/**
 * Where tokenizing resumes after an unterminated comment, quoted string, or domain literal: the
 * start of the next entry, or of the angle-addr that a mangled display name was wrapping.
 */
const recoveryCharacters = [
    ',',
    ';',
    '<',
];

/** `atext` from RFC 5322, plus `.` so that a whole `dot-atom` becomes one token. */
const asciiAtomCharacterRegExp = /[\w!#$%&'*+\-./=?^`{|}~]/;

/** The first character that [RFC 6531](https://datatracker.ietf.org/doc/html/rfc6531) adds. */
const firstNonAsciiCharacter = String.fromCodePoint(0x80);

/**
 * Non-ASCII characters that RFC 6531 does _not_ add to `atext`: the C1 controls, the format
 * characters (a byte order mark or a zero width space), and every flavor of Unicode space. Letting
 * an invisible character into an address would silently join two of them into one.
 */
const nonAtomCharacterRegExp = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}]/u;

function isAtomCharacter(character: string): boolean {
    if (asciiAtomCharacterRegExp.test(character)) {
        return true;
    } else if (character < firstNonAsciiCharacter) {
        return false;
    }

    return !nonAtomCharacterRegExp.test(character);
}

const doubleQuote = '"';
const backslash = '\\';

/** Where a delimited run of characters (a comment, quoted string, or domain literal) ended. */
type DelimitedScan = {
    /**
     * The index to resume tokenizing at. For a terminated run that is one past the closing
     * delimiter; for an unterminated one it is the recovery point, so the run cannot consume the
     * entries after it.
     */
    end: number;
    isTerminated: boolean;
};

/**
 * Splits an RFC 5322 address list header value into tokens, discarding whitespace and comments.
 *
 * This is a single linear pass. Unlike the ambiguous RFC 5322 ABNF, it cannot fan out into a forest
 * of candidate parses, so header length alone bounds its cost.
 */
export function tokenizeAddressList(headerValue: string): AddressListToken[] {
    const tokens: AddressListToken[] = [];
    let scanTables: DelimiterScanTables | undefined;
    let index = 0;
    let isSpaced = false;

    while (index < headerValue.length) {
        const character = headerValue.charAt(index);

        if (character === '(') {
            scanTables ??= buildDelimiterScanTables(headerValue);
            index = scanDelimitedRun({
                headerValue,
                startIndex: index,
                endTable: scanTables.commentEnd,
                recoveryTable: scanTables.recovery,
            }).end;
            isSpaced = true;
        } else if (character === doubleQuote) {
            scanTables ??= buildDelimiterScanTables(headerValue);
            const scan = scanDelimitedRun({
                headerValue,
                startIndex: index,
                endTable: scanTables.quotedStringEnd,
                recoveryTable: scanTables.recovery,
            });
            const raw = headerValue.slice(index, scan.end);

            if (scan.isTerminated) {
                tokens.push({
                    type: AddressListTokenType.Word,
                    raw,
                    text: unquote(raw),
                    isSpaced,
                });
            }

            index = scan.end;
            isSpaced = !scan.isTerminated;
        } else if (character === '[') {
            scanTables ??= buildDelimiterScanTables(headerValue);
            const scan = scanDelimitedRun({
                headerValue,
                startIndex: index,
                endTable: scanTables.domainLiteralEnd,
                recoveryTable: scanTables.recovery,
            });
            const raw = headerValue.slice(index, scan.end);

            if (scan.isTerminated) {
                tokens.push({
                    type: AddressListTokenType.DomainLiteral,
                    raw,
                    text: raw,
                    isSpaced,
                });
            }

            index = scan.end;
            isSpaced = !scan.isTerminated;
        } else if (specialCharacters.includes(character)) {
            tokens.push({
                type: AddressListTokenType.Special,
                raw: character,
                text: character,
                isSpaced,
            });
            index++;
            isSpaced = false;
        } else if (isAtomCharacter(character)) {
            const end = findAtomEnd(headerValue, index);
            const raw = headerValue.slice(index, end);
            tokens.push({
                type: AddressListTokenType.Word,
                raw,
                text: raw,
                isSpaced,
            });
            index = end;
            isSpaced = false;
        } else {
            /**
             * Whitespace, including the CRLF of a folded header, plus any character that cannot
             * appear in an address at all. Either way it separates the tokens around it.
             */
            index++;
            isSpaced = true;
        }
    }

    return tokens;
}

/**
 * Per-header lookup tables for {@link scanDelimitedRun}. Each table answers "where does a run opened
 * just before this index end" in constant time. Without them, every unterminated `(`, `"`, or `[`
 * re-scans the whole remaining header before rewinding to its recovery point, so a header full of
 * unbalanced openers costs quadratic time: a cheap CPU denial of service.
 */
type DelimiterScanTables = {
    commentEnd: Int32Array;
    quotedStringEnd: Int32Array;
    domainLiteralEnd: Int32Array;
    recovery: Int32Array;
};

/** Built once per header value, on its first `(`, `"`, or `[`. */
function buildDelimiterScanTables(headerValue: string): DelimiterScanTables {
    return {
        commentEnd: buildCommentEndTable(headerValue),
        quotedStringEnd: buildFirstMatchTable(
            headerValue,
            (character) => character === doubleQuote,
        ),
        domainLiteralEnd: buildFirstMatchTable(headerValue, (character) => character === ']'),
        recovery: buildFirstMatchTable(headerValue, (character) =>
            recoveryCharacters.includes(character),
        ),
    };
}

/**
 * For each index, the first matching position at or after it along the scans' backslash-skipping
 * walk, or `-1` if the walk reaches the end of the header without a match. The two extra trailing
 * entries absorb the two-step jump of a backslash at the very end.
 */
function buildFirstMatchTable(
    headerValue: string,
    isMatch: (character: string) => boolean,
): Int32Array {
    const table = new Int32Array(headerValue.length + 2).fill(-1);

    for (let index = headerValue.length - 1; index >= 0; index--) {
        const character = headerValue.charAt(index);
        table[index] =
            character === backslash
                ? (table[index + 2] ?? -1)
                : isMatch(character)
                  ? index
                  : (table[index + 1] ?? -1);
    }

    return table;
}

/**
 * For each index, the `)` that ends a comment already one level deep at that index, or `-1` if that
 * comment never closes. Comments nest, so a nested `(` jumps past its own comment's end and
 * continues from there, which is what lets one right-to-left pass fill the whole table.
 */
function buildCommentEndTable(headerValue: string): Int32Array {
    const table = new Int32Array(headerValue.length + 2).fill(-1);

    for (let index = headerValue.length - 1; index >= 0; index--) {
        const character = headerValue.charAt(index);

        if (character === backslash) {
            table[index] = table[index + 2] ?? -1;
        } else if (character === ')') {
            table[index] = index;
        } else if (character === '(') {
            const nestedEnd = table[index + 1] ?? -1;
            table[index] = nestedEnd < 0 ? -1 : (table[nestedEnd + 1] ?? -1);
        } else {
            table[index] = table[index + 1] ?? -1;
        }
    }

    return table;
}

/**
 * Where the comment, quoted string, or domain literal opened at `startIndex` ends. An unterminated
 * run resumes at its recovery point so that one unbalanced delimiter in a display name cannot
 * silently delete every address after it.
 */
function scanDelimitedRun({
    headerValue,
    startIndex,
    endTable,
    recoveryTable,
}: Readonly<{
    headerValue: string;
    startIndex: number;
    endTable: Int32Array;
    recoveryTable: Int32Array;
}>): DelimitedScan {
    const closingIndex = endTable[startIndex + 1] ?? -1;

    if (closingIndex >= 0) {
        return {
            end: closingIndex + 1,
            isTerminated: true,
        };
    }

    const recoveryIndex = recoveryTable[startIndex + 1] ?? -1;

    return {
        end: recoveryIndex < 0 ? headerValue.length : recoveryIndex,
        isTerminated: false,
    };
}

function findAtomEnd(headerValue: string, startIndex: number): number {
    let index = startIndex;

    while (index < headerValue.length && isAtomCharacter(headerValue.charAt(index))) {
        index++;
    }

    return index;
}

/**
 * Reads the value of a `quoted-string` token, which is only ever built from a terminated one.
 * Quotes and quoted pairs are removed, and folding whitespace is collapsed so that no display name
 * can carry a newline into whatever consumes it.
 */
function unquote(raw: string): string {
    return raw
        .slice(1, -1)
        .replaceAll(/\\([\S\s])/g, '$1')
        .replaceAll(/\s+/g, ' ')
        .trim();
}
