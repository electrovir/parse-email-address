import {describe, itCases} from '@augment-vir/test';
import {
    maxAddressListLength,
    type ParsedHeaderEmailAddress,
    parseEmailAddressList,
    parseHeaderEmailAddress,
} from './index.js';

/**
 * Builds an expected mailbox from its `full` address. `normalized` defaults to the lowercased
 * address, which is correct for every address here that has no quoted local part.
 */
function mailbox(
    full: string,
    overrides: Partial<ParsedHeaderEmailAddress> = {},
): ParsedHeaderEmailAddress {
    const atIndex = full.lastIndexOf('@');

    return {
        user: full.slice(0, atIndex),
        domain: full.slice(atIndex + 1),
        full,
        displayName: undefined,
        groupName: undefined,
        normalized: full.toLowerCase(),
        ...overrides,
    };
}

describe(parseEmailAddressList.name, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'parses a bare address',
            input: 'jane@example.org',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses a display name address',
            input: 'Jane Doe <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane Doe',
                }),
            ],
        },
        {
            it: 'parses an angle address with no display name',
            input: '<jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses several comma separated addresses',
            input: 'jane@example.org, John Doe <john@example.org>, <jim@example.org>',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org', {
                    displayName: 'John Doe',
                }),
                mailbox('jim@example.org'),
            ],
        },
        {
            it: 'keeps a quoted display name holding a comma as one address',
            input: '"Doe, John" <john@example.org>',
            expect: [
                mailbox('john@example.org', {
                    displayName: 'Doe, John',
                }),
            ],
        },
        {
            it: 'ignores a display name that is itself an address',
            input: 'billing@example.com <attacker@example.org>',
            expect: [
                mailbox('attacker@example.org'),
            ],
        },
        {
            it: 'ignores a quoted display name that is itself an address',
            input: '"billing@example.com" <attacker@example.org>',
            expect: [
                mailbox('attacker@example.org', {
                    displayName: 'billing@example.com',
                }),
            ],
        },
        {
            it: 'ignores a trailing comment',
            input: 'jane@example.org (Jane Doe)',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'ignores a comment between the local part and the domain',
            input: 'jane(the sender)@example.org',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'ignores nested comments',
            input: 'jane@example.org (outer (inner) still outer)',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'ignores an unterminated comment',
            input: 'jane@example.org (unterminated',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'keeps reading a comment past an escaped closing parenthesis',
            input: String.raw`jane@example.org (not the end \) but this is)`,
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'unescapes a quoted pair in a display name',
            input: String.raw`"Jane \"The Sender\" Doe" <jane@example.org>`,
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane "The Sender" Doe',
                }),
            ],
        },
        {
            it: 'recovers the address after an unterminated quoted display name',
            input: '"Jane Doe <jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses a folded header',
            input: 'Jane Doe\r\n <jane@example.org>,\r\n\tJohn <john@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane Doe',
                }),
                mailbox('john@example.org', {
                    displayName: 'John',
                }),
            ],
        },
        {
            it: 'attributes group members to their group',
            input: 'Intake Team: jane@example.org, John <john@example.org>;',
            expect: [
                mailbox('jane@example.org', {
                    groupName: 'Intake Team',
                }),
                mailbox('john@example.org', {
                    displayName: 'John',
                    groupName: 'Intake Team',
                }),
            ],
        },
        {
            it: 'stops attributing addresses to a group once it closes',
            input: 'Intake Team: jane@example.org;, john@example.org',
            expect: [
                mailbox('jane@example.org', {
                    groupName: 'Intake Team',
                }),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'returns nothing for an empty group',
            input: 'undisclosed-recipients:;',
            expect: [],
        },
        {
            it: 'treats semicolons as separators outside of a group',
            input: 'jane@example.org; john@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'ignores an obsolete source route',
            input: '<@relay.example.org:jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'ignores a multi hop obsolete source route',
            input: '<@first.example.org,@second.example.org:jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'ignores trailing junk inside an angle address',
            input: '<jane@example.org unexpected>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'joins a local part split across a quoted string',
            input: 'jane."the sender"@example.org',
            expect: [
                mailbox('jane."the sender"@example.org', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'skips an obsolete route that never reaches its address',
            input: '<@relay.example.org>, jane@example.org',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'skips an unterminated obsolete route',
            input: '<@relay.example.org',
            expect: [],
        },
        {
            it: 'ends an unterminated angle address at a semicolon',
            input: '<jane@example.org; john@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'ends an unterminated angle address at the end of the header',
            input: 'Jane <jane@example.org',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane',
                }),
            ],
        },
        {
            it: 'parses a quoted local part',
            input: '"weird,name"@example.org',
            expect: [
                mailbox('"weird,name"@example.org'),
            ],
        },
        {
            it: 'parses a quoted local part inside an angle address',
            input: 'Jane <"weird name"@example.org>',
            expect: [
                mailbox('"weird name"@example.org', {
                    displayName: 'Jane',
                }),
            ],
        },
        {
            it: 'parses a domain literal',
            input: 'jane@[192.0.2.10]',
            expect: [
                mailbox('jane@[192.0.2.10]'),
            ],
        },
        {
            it: 'preserves a plus tag',
            input: 'jane+referrals@example.org',
            expect: [
                mailbox('jane+referrals@example.org'),
            ],
        },
        {
            it: 'preserves the sender casing and normalizes separately',
            input: 'JANE@EXAMPLE.ORG',
            expect: [
                mailbox('JANE@EXAMPLE.ORG'),
            ],
        },
        {
            it: 'reports an address with no normalized form when RFC 5321 rejects it',
            input: 'root@localhost',
            expect: [
                mailbox('root@localhost', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'leaves an encoded word display name undecoded',
            input: '=?utf-8?B?SmFuZQ==?= <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: '=?utf-8?B?SmFuZQ==?=',
                }),
            ],
        },
        {
            it: 'parses a non-ASCII address',
            input: 'Jane <我買@屋企.香港>',
            expect: [
                mailbox('我買@屋企.香港', {
                    displayName: 'Jane',
                }),
            ],
        },
        {
            it: 'skips an empty angle address',
            input: '<>, jane@example.org',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'skips an address with no local part',
            input: '@example.org, jane@example.org',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'skips an address with no domain',
            input: 'jane@, john@example.org',
            expect: [
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'does not let an unterminated angle address swallow the rest of the list',
            input: '<jane@example.org, john@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'returns nothing for a header with no address in it',
            input: 'undisclosed recipients',
            expect: [],
        },
        {
            it: 'returns nothing for an empty string',
            input: '',
            expect: [],
        },
        {
            it: 'returns nothing for undefined',
            input: undefined,
            expect: [],
        },
        {
            it: 'returns nothing for a header longer than the maximum',
            input: `jane@example.org, ${'a'.repeat(maxAddressListLength)}@example.org`,
            expect: [],
        },
    ]);
});

describe(`${parseEmailAddressList.name} never reports a name as an address`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'ignores an address-shaped display name separated from the angle address by a word',
            input: 'victim@facility.test Jane <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test', {
                    displayName: 'Jane',
                }),
            ],
        },
        {
            it: 'ignores an address-shaped display name separated by a quoted string',
            input: 'victim@facility.test "Jane" <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test', {
                    displayName: 'Jane',
                }),
            ],
        },
        {
            it: 'ignores an address-shaped display name separated by a bracketed tag',
            input: 'victim@facility.test [EXTERNAL] <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test'),
            ],
        },
        {
            it: 'ignores an address-shaped display name separated by a stray angle bracket',
            input: 'victim@facility.test> <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test'),
            ],
        },
        {
            it: 'ignores an address-shaped display name separated by a comment',
            input: 'victim@facility.test (see below) <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test'),
            ],
        },
        {
            it: 'ignores an address-shaped display name separated by several words',
            input: 'victim@facility.test Jane Q Doe [EXTERNAL] <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test'),
            ],
        },
        {
            it: 'ignores an address-shaped group name',
            input: 'victim@facility.test: attacker@evil.test;',
            expect: [
                mailbox('attacker@evil.test'),
            ],
        },
        {
            it: 'ignores an address-shaped group name holding a display name address',
            input: 'victim@facility.test: Attacker <attacker@evil.test>;',
            expect: [
                mailbox('attacker@evil.test', {
                    displayName: 'Attacker',
                }),
            ],
        },
        {
            it: 'still reports an address when the group that follows belongs to a later entry',
            input: 'jane@example.org, Intake: john@example.org;',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org', {
                    groupName: 'Intake',
                }),
            ],
        },
        {
            it: 'keeps both angle addresses when a bare address precedes them',
            input: 'victim@facility.test <first@evil.test> <second@evil.test>',
            expect: [
                mailbox('first@evil.test'),
                mailbox('second@evil.test'),
            ],
        },
        {
            it: 'refuses an address whose local part is only part of the phrase',
            input: 'Jane Doe @example.org',
            expect: [],
        },
        {
            it: 'refuses an address preceded by a quoted phrase with no angle brackets',
            input: '"<victim@facility.test>" attacker@evil.test',
            expect: [],
        },
        {
            it: 'refuses a directory name that ends in an address',
            input: 'CN=Jane Doe/OU=Nursing/O=Example@example.test',
            expect: [],
        },
        {
            it: 'refuses an address with a second at sign rather than choosing a domain',
            input: 'victim@facility.test@evil.test',
            expect: [],
        },
        {
            it: 'refuses a second at sign inside an angle address',
            input: '<victim@facility.test@evil.test>',
            expect: [],
        },
        {
            it: 'refuses an address split by a separated dot',
            input: '<jane . doe@example.org>',
            expect: [],
        },
        {
            it: 'refuses an address split by a comment inside the local part',
            input: '<jane(comment).doe@example.org>',
            expect: [],
        },
        {
            it: 'leaves an at sign in a quoted local part alone, so the domain is the last one',
            input: '"@facility.test@x"@evil.test',
            expect: [
                mailbox('"@facility.test@x"@evil.test'),
            ],
        },
        {
            it: 'keeps an angle bracket inside a quoted display name inert',
            input: '"<victim@facility.test>" <attacker@evil.test>',
            expect: [
                mailbox('attacker@evil.test', {
                    displayName: '<victim@facility.test>',
                }),
            ],
        },
        {
            it: 'keeps an address inside a comment inert',
            input: 'jane@example.org (or attacker@evil.test)',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
    ]);
});

describe(`${parseEmailAddressList.name} recovers from unbalanced delimiters`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'keeps both addresses when a display name opens a quote it never closes',
            input: 'John "Doe <john@a.test>, jane@b.test',
            expect: [
                mailbox('john@a.test', {
                    displayName: 'John',
                }),
                mailbox('jane@b.test'),
            ],
        },
        {
            it: 'keeps both addresses when a display name opens a bracket it never closes',
            input: 'Smith [MD <john@a.test>, jane@b.test',
            expect: [
                mailbox('john@a.test', {
                    displayName: 'Smith',
                }),
                mailbox('jane@b.test'),
            ],
        },
        {
            it: 'keeps the address after an unterminated comment',
            input: '(unterminated, jane@b.test',
            expect: [
                mailbox('jane@b.test'),
            ],
        },
        {
            it: 'keeps the address after an unterminated domain literal',
            input: 'jane@[192.0.2.1, john@b.test',
            expect: [
                mailbox('john@b.test'),
            ],
        },
        {
            it: 'keeps the address after an emoticon that opens a comment',
            input: 'Sad Face :( <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    groupName: 'Sad Face',
                }),
            ],
        },
        {
            it: 'ignores a stray closing parenthesis',
            input: 'jane@example.org (a)) john@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'returns nothing for an unterminated quote ending in a backslash',
            input: '"a\\',
            expect: [],
        },
        {
            it: 'ignores a stray trailing backslash',
            input: 'jane@example.org \\',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'recovers the second address from a nested angle address',
            input: '<<jane@example.org>>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'does not let an unterminated angle address swallow the next angle address',
            input: '<jane@example.org John <john@example.org>',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
    ]);
});

const noBreakSpace = String.fromCodePoint(0xa0);
const softHyphen = String.fromCodePoint(0xad);
const c1Control = String.fromCodePoint(0x80);
const zeroWidthSpace = String.fromCodePoint(0x20_0b);
const ideographicSpace = String.fromCodePoint(0x30_00);
const byteOrderMark = String.fromCodePoint(0xfe_ff);
const nullCharacter = String.fromCodePoint(0);
const grinningFace = String.fromCodePoint(0x1_f6_00);

describe(`${parseEmailAddressList.name} treats invisible characters as separators`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'splits two addresses joined by a no-break space',
            input: `jane@example.org${noBreakSpace}john@example.org`,
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'splits two addresses joined by an ideographic space',
            input: `jane@example.org${ideographicSpace}john@example.org`,
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'ignores a leading byte order mark',
            input: `${byteOrderMark}jane@example.org`,
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'refuses a local part split by a zero width space',
            input: `jane${zeroWidthSpace}doe@example.org`,
            expect: [],
        },
        {
            it: 'refuses a local part split by a soft hyphen',
            input: `jane${softHyphen}doe@example.org`,
            expect: [],
        },
        {
            it: 'refuses a local part split by a C1 control character',
            input: `jane${c1Control}doe@example.org`,
            expect: [],
        },
        {
            it: 'refuses a local part split by a null character',
            input: `jane${nullCharacter}doe@example.org`,
            expect: [],
        },
        {
            it: 'reports only the label before a no-break space in a domain',
            input: `jane@example${noBreakSpace}.org`,
            expect: [
                mailbox('jane@example', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'keeps a surrogate pair in a local part',
            input: `Jane <jane${grinningFace}@example.org>`,
            expect: [
                mailbox(`jane${grinningFace}@example.org`, {
                    displayName: 'Jane',
                }),
            ],
        },
    ]);
});

describe(`${parseEmailAddressList.name} collapses whitespace in names`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'unfolds a quoted display name folded across lines',
            input: '"Doe,\r\n   John" <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Doe, John',
                }),
            ],
        },
        {
            it: 'trims and collapses padding inside a quoted display name',
            input: '"  Jane  Doe  " <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane Doe',
                }),
            ],
        },
        {
            it: 'unescapes a quoted pair whose escaped character is a carriage return',
            input: '"a\\\rb" <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'a b',
                }),
            ],
        },
        {
            it: 'reports no display name for two empty quoted strings',
            input: '"" "" <jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'reports no group name for two empty quoted strings',
            input: '"" "": jane@example.org;',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
    ]);
});

describe(`${parseEmailAddressList.name} parses what real mail software sends`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'parses an Outlook unquoted comma display name, keeping the address',
            input: 'Doe, John <john@example.org>',
            expect: [
                mailbox('john@example.org', {
                    displayName: 'John',
                }),
            ],
        },
        {
            it: 'parses an Outlook semicolon list of comma display names',
            input: 'Doe, John <john@example.org>; Roe, Jane <jane@example.org>',
            expect: [
                mailbox('john@example.org', {
                    displayName: 'John',
                }),
                mailbox('jane@example.org', {
                    displayName: 'Jane',
                }),
            ],
        },
        {
            it: 'keeps the single quotes of an Exchange display name',
            input: "'Jane Doe' <jane@example.org>",
            expect: [
                mailbox('jane@example.org', {
                    displayName: "'Jane Doe'",
                }),
            ],
        },
        {
            it: 'drops a parenthesized qualification from a display name',
            input: 'Jane Doe (Nursing) <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane Doe',
                }),
            ],
        },
        {
            it: 'keeps the display name after a leading bracketed tag',
            input: '[EXTERNAL] Jane Doe <jane@example.org>',
            expect: [
                mailbox('jane@example.org', {
                    displayName: 'Jane Doe',
                }),
            ],
        },
        {
            it: 'loses the display name before a trailing bracketed tag',
            input: 'Jane Doe [EXTERNAL] <jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses a Google Groups via display name',
            input: 'Jane Doe via Intake Team <intake@googlegroups.test>',
            expect: [
                mailbox('intake@googlegroups.test', {
                    displayName: 'Jane Doe via Intake Team',
                }),
            ],
        },
        {
            it: 'parses a quoted ticket subject holding a colon',
            input: '"Zendesk: Ticket #45" <support@example.test>',
            expect: [
                mailbox('support@example.test', {
                    displayName: 'Zendesk: Ticket #45',
                }),
            ],
        },
        {
            it: 'reports a group name for an unquoted phrase holding a colon',
            input: 'Re: your referral <intake@example.org>',
            expect: [
                mailbox('intake@example.org', {
                    displayName: 'your referral',
                    groupName: 'Re',
                }),
            ],
        },
        {
            it: 'parses a variable envelope return path',
            input: 'bounces+1-ab-jane=example.org@sendgrid.test',
            expect: [
                mailbox('bounces+1-ab-jane=example.org@sendgrid.test'),
            ],
        },
        {
            it: 'parses a bounce daemon address',
            input: 'MAILER-DAEMON@email-smtp.us-west-2.amazonaws.test',
            expect: [
                mailbox('MAILER-DAEMON@email-smtp.us-west-2.amazonaws.test'),
            ],
        },
        {
            it: 'parses a header folded with a bare line feed',
            input: 'jane@example.org,\n john@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'recovers addresses from a list with no separators at all',
            input: 'jane@example.org john@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('john@example.org'),
            ],
        },
        {
            it: 'returns nothing for an X.500 style directory name',
            input: '/O=EXAMPLE/OU=SITE/CN=RECIPIENTS/CN=JANE',
            expect: [],
        },
        {
            it: 'returns nothing for a header holding only whitespace',
            input: ' \r\n\t ',
            expect: [],
        },
        {
            it: 'returns nothing for a header holding only separators',
            input: ',;:<>@',
            expect: [],
        },
    ]);
});

describe(`${parseEmailAddressList.name} normalizes only what RFC 5321 accepts`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'drops the root label dot so a fully qualified domain still normalizes',
            input: 'jane@example.org.',
            expect: [
                mailbox('jane@example.org.', {
                    normalized: 'jane@example.org',
                }),
            ],
        },
        {
            it: 'normalizes a local part at the length limit',
            input: `${'a'.repeat(64)}@example.org`,
            expect: [
                mailbox(`${'a'.repeat(64)}@example.org`),
            ],
        },
        {
            it: 'refuses to normalize a local part over the length limit',
            input: `${'a'.repeat(65)}@example.org`,
            expect: [
                mailbox(`${'a'.repeat(65)}@example.org`, {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'refuses to normalize an address over the length limit',
            input: `jane@${'a'.repeat(250)}.test`,
            expect: [
                mailbox(`jane@${'a'.repeat(250)}.test`, {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'reports an empty quoted local part',
            input: '""@example.org',
            expect: [
                mailbox('""@example.org'),
            ],
        },
        {
            it: 'reports a quoted local part of one space',
            input: '" "@example.org',
            expect: [
                mailbox('" "@example.org'),
            ],
        },
        {
            it: 'refuses to normalize an empty domain literal',
            input: 'jane@[]',
            expect: [
                mailbox('jane@[]', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'normalizes a compressed IPv6 domain literal',
            input: 'jane@[IPv6:::1]',
            expect: [
                mailbox('jane@[IPv6:::1]', {
                    normalized: 'jane@[ipv6:::1]',
                }),
            ],
        },
        {
            it: 'refuses to normalize an underscore in a domain',
            input: 'jane@my_host.example.org',
            expect: [
                mailbox('jane@my_host.example.org', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'refuses to normalize a doubled dot in a local part',
            input: 'a..b@example.org',
            expect: [
                mailbox('a..b@example.org', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'refuses to normalize a leading dot in a local part',
            input: '.jane@example.org',
            expect: [
                mailbox('.jane@example.org', {
                    normalized: undefined,
                }),
            ],
        },
        {
            it: 'reports the same address twice without deduplicating',
            input: 'jane@example.org, jane@example.org',
            expect: [
                mailbox('jane@example.org'),
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'accepts folding whitespace around the at sign',
            input: 'jane @ example.org',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses an obsolete source route through an address literal',
            input: '<@[192.0.2.1]:jane@example.org>',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses an empty group with a comment in it',
            input: 'undisclosed-recipients: (nobody) ;',
            expect: [],
        },
        {
            it: 'reports the innermost name of nested groups',
            input: 'Alpha: Beta: jane@example.org;;',
            expect: [
                mailbox('jane@example.org', {
                    groupName: 'Beta',
                }),
            ],
        },
        {
            it: 'ignores leading, doubled, and trailing commas',
            input: ',,jane@example.org,,',
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'parses a header at exactly the maximum length',
            input: `jane@example.org${' '.repeat(maxAddressListLength - 16)}`,
            expect: [
                mailbox('jane@example.org'),
            ],
        },
        {
            it: 'returns nothing for a header one character over the maximum length',
            input: `jane@example.org${' '.repeat(maxAddressListLength - 15)}`,
            expect: [],
        },
    ]);
});

/**
 * A `local-part` long enough to be expensive for the RFC 5321 parser, but short enough that the
 * parser's own length guard would not have caught it.
 */
const pathologicalAddress = `${'a.'.repeat(484)}b@example.test`;

describe(`${parseEmailAddressList.name} survives hostile input`, () => {
    itCases(parseEmailAddressList, [
        {
            it: 'returns nothing for a header of unclosed comments',
            input: '('.repeat(maxAddressListLength),
            expect: [],
        },
        {
            it: 'returns nothing for a header of quotes',
            input: '"'.repeat(maxAddressListLength),
            expect: [],
        },
        {
            it: 'returns nothing for a header of unclosed domain literals',
            input: '['.repeat(maxAddressListLength),
            expect: [],
        },
        {
            it: 'returns nothing for a header of commas',
            input: ','.repeat(maxAddressListLength),
            expect: [],
        },
        {
            it: 'returns nothing for a header of angle brackets',
            input: '<'.repeat(maxAddressListLength),
            expect: [],
        },
        {
            it: 'returns nothing for a header of obsolete route prefixes',
            input: '<@a,'.repeat(maxAddressListLength / 4),
            expect: [],
        },
        {
            it: 'refuses to normalize a header packed with pathological local parts',
            input: `${pathologicalAddress},${pathologicalAddress},${pathologicalAddress}`,
            expect: [
                mailbox(pathologicalAddress, {
                    normalized: undefined,
                }),
                mailbox(pathologicalAddress, {
                    normalized: undefined,
                }),
                mailbox(pathologicalAddress, {
                    normalized: undefined,
                }),
            ],
        },
    ]);
});

describe(parseHeaderEmailAddress.name, () => {
    itCases(parseHeaderEmailAddress, [
        {
            it: 'parses a single display name address',
            input: 'Jane Doe <jane@example.org>',
            expect: mailbox('jane@example.org', {
                displayName: 'Jane Doe',
            }),
        },
        {
            it: 'refuses a value holding more than one address',
            input: 'jane@example.org, john@example.org',
            expect: undefined,
        },
        {
            it: 'refuses a value holding no address',
            input: 'undisclosed recipients',
            expect: undefined,
        },
        {
            it: 'parses an Outlook comma display name as one address',
            input: 'Doe, John <john@example.org>',
            expect: mailbox('john@example.org', {
                displayName: 'John',
            }),
        },
        {
            it: 'parses the real sender of a spoofed display name',
            input: 'victim@facility.test Jane <attacker@evil.test>',
            expect: mailbox('attacker@evil.test', {
                displayName: 'Jane',
            }),
        },
        {
            it: 'refuses a value whose only address is malformed',
            input: 'victim@facility.test@evil.test',
            expect: undefined,
        },
        {
            it: 'refuses undefined',
            input: undefined,
            expect: undefined,
        },
    ]);
});
