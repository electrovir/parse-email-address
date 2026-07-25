import {describe, itCases} from '@augment-vir/test';
import {
    type AddressListToken,
    AddressListTokenType,
    tokenizeAddressList,
} from './address-list-tokens.js';

function word(raw: string, overrides: Partial<AddressListToken> = {}): AddressListToken {
    return {
        type: AddressListTokenType.Word,
        raw,
        text: raw,
        isSpaced: false,
        ...overrides,
    };
}

function spacedWord(raw: string, overrides: Partial<AddressListToken> = {}): AddressListToken {
    return word(raw, {
        isSpaced: true,
        ...overrides,
    });
}

function special(raw: string, overrides: Partial<AddressListToken> = {}): AddressListToken {
    return word(raw, {
        type: AddressListTokenType.Special,
        ...overrides,
    });
}

function domainLiteral(raw: string, overrides: Partial<AddressListToken> = {}): AddressListToken {
    return word(raw, {
        type: AddressListTokenType.DomainLiteral,
        ...overrides,
    });
}

const noBreakSpace = String.fromCodePoint(0xa0);
const c1Control = String.fromCodePoint(0x80);
const grinningFace = String.fromCodePoint(0x1_f6_00);

describe(tokenizeAddressList.name, () => {
    itCases(tokenizeAddressList, [
        {
            it: 'returns nothing for an empty header',
            input: '',
            expect: [],
        },
        {
            it: 'splits an address into its user, at sign, and domain',
            input: 'jane@example.org',
            expect: [
                word('jane'),
                special('@'),
                word('example.org'),
            ],
        },
        {
            it: 'keeps a whole dot atom in one token',
            input: 'a.b.c',
            expect: [
                word('a.b.c'),
            ],
        },
        {
            it: 'marks every token that whitespace precedes',
            input: 'Jane Doe <jane@example.org>',
            expect: [
                word('Jane'),
                spacedWord('Doe'),
                special('<', {
                    isSpaced: true,
                }),
                word('jane'),
                special('@'),
                word('example.org'),
                special('>'),
            ],
        },
        {
            it: 'keeps a quoted string in one token and reads its value',
            input: '"Doe, John"',
            expect: [
                word('"Doe, John"', {
                    text: 'Doe, John',
                }),
            ],
        },
        {
            it: 'unescapes a quoted pair in the value but not the raw token',
            input: String.raw`"a\"b"`,
            expect: [
                word(String.raw`"a\"b"`, {
                    text: 'a"b',
                }),
            ],
        },
        {
            it: 'collapses folding whitespace in a quoted value',
            input: '"Doe,\r\n   John"',
            expect: [
                word('"Doe,\r\n   John"', {
                    text: 'Doe, John',
                }),
            ],
        },
        {
            it: 'reads an empty quoted string as an empty value',
            input: '""',
            expect: [
                word('""', {
                    text: '',
                }),
            ],
        },
        {
            it: 'drops a comment but marks what follows it as spaced',
            input: 'Jane(the sender)Doe',
            expect: [
                word('Jane'),
                spacedWord('Doe'),
            ],
        },
        {
            it: 'drops a nested comment as one comment',
            input: 'jane@example.org (outer (inner) still outer)',
            expect: [
                word('jane'),
                special('@'),
                word('example.org'),
            ],
        },
        {
            it: 'keeps a domain literal in one token',
            input: 'jane@[192.0.2.10]',
            expect: [
                word('jane'),
                special('@'),
                domainLiteral('[192.0.2.10]'),
            ],
        },
        {
            it: 'keeps an escaped closing bracket inside a domain literal',
            input: String.raw`jane@[a\]b]`,
            expect: [
                word('jane'),
                special('@'),
                domainLiteral(String.raw`[a\]b]`),
            ],
        },
        {
            it: 'tokenizes the structure of a group',
            input: 'Team: jane@example.org;',
            expect: [
                word('Team'),
                special(':'),
                spacedWord('jane'),
                special('@'),
                word('example.org'),
                special(';'),
            ],
        },
        {
            it: 'resumes at the next entry after an unterminated comment',
            input: '(unterminated, jane@example.org',
            expect: [
                special(',', {
                    isSpaced: true,
                }),
                spacedWord('jane'),
                special('@'),
                word('example.org'),
            ],
        },
        {
            it: 'resumes at the angle address after an unterminated quoted string',
            input: '"unterminated <jane@example.org>',
            expect: [
                special('<', {
                    isSpaced: true,
                }),
                word('jane'),
                special('@'),
                word('example.org'),
                special('>'),
            ],
        },
        {
            it: 'resumes at the next entry after an unterminated domain literal',
            input: 'jane@[192.0.2.1, john@example.org',
            expect: [
                word('jane'),
                special('@'),
                special(',', {
                    isSpaced: true,
                }),
                spacedWord('john'),
                special('@'),
                word('example.org'),
            ],
        },
        {
            it: 'drops an unterminated comment with nothing to resume at',
            input: 'jane (unterminated',
            expect: [
                word('jane'),
            ],
        },
        {
            it: 'treats a no-break space as whitespace',
            input: `jane${noBreakSpace}doe`,
            expect: [
                word('jane'),
                spacedWord('doe'),
            ],
        },
        {
            it: 'treats a C1 control character as whitespace',
            input: `jane${c1Control}doe`,
            expect: [
                word('jane'),
                spacedWord('doe'),
            ],
        },
        {
            it: 'keeps a surrogate pair inside a word',
            input: `jane${grinningFace}`,
            expect: [
                word(`jane${grinningFace}`),
            ],
        },
        {
            it: 'treats a stray backslash as whitespace',
            input: String.raw`jane \doe`,
            expect: [
                word('jane'),
                spacedWord('doe'),
            ],
        },
    ]);
});
