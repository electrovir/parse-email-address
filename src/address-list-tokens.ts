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
    let index = 0;
    let isSpaced = false;

    while (index < headerValue.length) {
        const character = headerValue.charAt(index);

        if (character === '(') {
            index = scanToCommentEnd(headerValue, index).end;
            isSpaced = true;
        } else if (character === doubleQuote) {
            const scan = scanToClosingCharacter({
                headerValue,
                startIndex: index,
                closingCharacter: doubleQuote,
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
            const scan = scanToClosingCharacter({
                headerValue,
                startIndex: index,
                closingCharacter: ']',
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

/** Comments nest, so this tracks depth instead of stopping at the first `)`. */
function scanToCommentEnd(headerValue: string, startIndex: number): DelimitedScan {
    let index = startIndex + 1;
    let depth = 1;
    let recoveryIndex = -1;

    while (index < headerValue.length) {
        const character = headerValue.charAt(index);

        if (character === backslash) {
            index += 2;
            continue;
        } else if (character === '(') {
            depth++;
        } else if (character === ')') {
            depth--;

            if (!depth) {
                return {
                    end: index + 1,
                    isTerminated: true,
                };
            }
        } else if (recoveryIndex < 0 && recoveryCharacters.includes(character)) {
            recoveryIndex = index;
        }

        index++;
    }

    return unterminatedScan(headerValue, recoveryIndex);
}

function scanToClosingCharacter({
    headerValue,
    startIndex,
    closingCharacter,
}: Readonly<{
    headerValue: string;
    startIndex: number;
    closingCharacter: string;
}>): DelimitedScan {
    let index = startIndex + 1;
    let recoveryIndex = -1;

    while (index < headerValue.length) {
        const character = headerValue.charAt(index);

        if (character === backslash) {
            index += 2;
            continue;
        } else if (character === closingCharacter) {
            return {
                end: index + 1,
                isTerminated: true,
            };
        } else if (recoveryIndex < 0 && recoveryCharacters.includes(character)) {
            recoveryIndex = index;
        }

        index++;
    }

    return unterminatedScan(headerValue, recoveryIndex);
}

/**
 * An unterminated comment, quoted string, or domain literal resumes at its recovery point so that
 * one unbalanced delimiter in a display name cannot silently delete every address after it. The
 * recovery point was found during the same forward scan, so recovery stays linear.
 */
function unterminatedScan(headerValue: string, recoveryIndex: number): DelimitedScan {
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
