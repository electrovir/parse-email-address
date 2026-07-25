import {describe, itCases} from '@augment-vir/test';
import {
    isValidEmailAddress,
    normalizeEmailAddress,
    parseEmailAddress,
} from './parse-email-address.js';

const grinningFace = String.fromCodePoint(0x1_f6_00);
const deleteCharacter = String.fromCodePoint(0x7f);

/** The longest address the RFC 5321 parser accepts, based on the 1,000 octet SMTP line length. */
const longestValidAddress = `${'a'.repeat(974)}@example.org`;
const longestValidDomainLabel = `${'a'.repeat(63)}.test`;

const validEmailTestCases = [
    {
        it: 'handles simple@example.org',
        input: 'simple@example.org',
        expect: {
            user: 'simple',
            domain: 'example.org',
            full: 'simple@example.org',
        },
    },
    {
        it: 'handles very.common@example.org',
        input: 'very.common@example.org',
        expect: {
            user: 'very.common',
            domain: 'example.org',
            full: 'very.common@example.org',
        },
    },
    {
        it: 'handles disposable.style.email.with+symbol@example.org',
        input: 'disposable.style.email.with+symbol@example.org',
        expect: {
            user: 'disposable.style.email.with+symbol',
            domain: 'example.org',
            full: 'disposable.style.email.with+symbol@example.org',
        },
    },
    {
        it: 'handles one letter user',
        input: 'x@example.org',
        expect: {
            user: 'x',
            domain: 'example.org',
            full: 'x@example.org',
        },
    },
    {
        it: 'handles one letter user',
        input: 'x@example.org',
        expect: {
            user: 'x',
            domain: 'example.org',
            full: 'x@example.org',
        },
    },
    {
        it: 'handles space between quotes user',
        input: '" "@example.org',
        expect: {
            user: '" "',
            domain: 'example.org',
            full: '" "@example.org',
        },
    },
    {
        it: 'handles quoted double dot',
        input: '"john..doe"@example.org',
        expect: {
            user: '"john..doe"',
            domain: 'example.org',
            full: '"john..doe"@example.org',
        },
    },

    {
        it: 'handles quoted string with angle brackets',
        input: '"<john-doe>"@example.org',
        expect: {
            user: '"<john-doe>"',
            domain: 'example.org',
            full: '"<john-doe>"@example.org',
        },
    },
    {
        it: 'handles quoted string with backslash escape',
        input: String.raw`"\<john-doe\>"@example.org`,
        expect: {
            user: String.raw`"\<john-doe\>"`,
            domain: 'example.org',
            full: String.raw`"\<john-doe\>"@example.org`,
        },
    },
    {
        it: 'handles address in quoted local-part',
        input: '"john.doe@example.org"@example.org',
        expect: {
            user: '"john.doe@example.org"',
            domain: 'example.org',
            full: '"john.doe@example.org"@example.org',
        },
    },
    {
        it: 'handles escaped quoted @',
        input: String.raw`"john\@doe"@example.org`,
        expect: {
            user: String.raw`"john\@doe"`,
            domain: 'example.org',
            full: String.raw`"john\@doe"@example.org`,
        },
    },
    {
        it: 'handles escaped quoted quote',
        input: String.raw`"john\"doe"@example.org`,
        expect: {
            user: String.raw`"john\"doe"`,
            domain: 'example.org',
            full: String.raw`"john\"doe"@example.org`,
        },
    },
    {
        it: 'handles bangified host route used for uucp mailers',
        input: 'mailhost!username@example.org',
        expect: {
            user: 'mailhost!username',
            domain: 'example.org',
            full: 'mailhost!username@example.org',
        },
    },
    {
        it: 'handles % escaped mail route to user@example.org via example.org',
        input: 'user%example.org@example.org',
        expect: {
            user: 'user%example.org',
            domain: 'example.org',
            full: 'user%example.org@example.org',
        },
    },
    {
        it: 'handles local part ending with non-alphanumeric character from the list of allowed printable characters',
        input: 'user-@example.org',
        expect: {
            user: 'user-',
            domain: 'example.org',
            full: 'user-@example.org',
        },
    },
    {
        it: 'handles ip domain',
        input: 'simple@[127.0.0.1]',
        expect: {
            user: 'simple',
            domain: '[127.0.0.1]',
            full: 'simple@[127.0.0.1]',
        },
    },
    {
        it: 'handles IPv6 ip domain',
        input: 'simple@[IPv6:::1]',
        expect: {
            user: 'simple',
            domain: '[IPv6:::1]',
            full: 'simple@[IPv6:::1]',
        },
    },
    {
        it: 'handles lowercase ipv6',
        input: 'simple@[ipv6:::1]',
        expect: {
            user: 'simple',
            domain: '[ipv6:::1]',
            full: 'simple@[ipv6:::1]',
        },
    },
    {
        it: 'handles another IPv6 domain',
        input: 'simple@[IPv6:68:1c:a2:12:4a:e5]',
        expect: {
            user: 'simple',
            domain: '[IPv6:68:1c:a2:12:4a:e5]',
            full: 'simple@[IPv6:68:1c:a2:12:4a:e5]',
        },
    },
    {
        it: 'handles unicode UTF-8',
        input: '我買@屋企.香港',
        expect: {
            user: '我買',
            domain: '屋企.香港',
            full: '我買@屋企.香港',
        },
    },
    {
        it: 'handles #user@example.org',
        input: '#user@example.org',
        expect: {
            user: '#user',
            domain: 'example.org',
            full: '#user@example.org',
        },
    },
    {
        it: 'handles general address literal',
        input: 'simple@[tag:Can-Be-Anything]',
        expect: {
            user: 'simple',
            domain: '[tag:Can-Be-Anything]',
            full: 'simple@[tag:Can-Be-Anything]',
        },
    },
    {
        it: 'handles a two letter top level domain',
        input: 'simple@example.co',
        expect: {
            user: 'simple',
            domain: 'example.co',
            full: 'simple@example.co',
        },
    },
    {
        it: 'handles a surrogate pair in the user',
        input: `simple${grinningFace}@example.org`,
        expect: {
            user: `simple${grinningFace}`,
            domain: 'example.org',
            full: `simple${grinningFace}@example.org`,
        },
    },
    {
        it: 'handles an undecoded encoded word as a user',
        input: '=?utf-8?B?SmFuZQ==?=@example.org',
        expect: {
            user: '=?utf-8?B?SmFuZQ==?=',
            domain: 'example.org',
            full: '=?utf-8?B?SmFuZQ==?=@example.org',
        },
    },
    {
        it: 'handles the longest allowed address',
        input: longestValidAddress,
        expect: {
            user: 'a'.repeat(974),
            domain: 'example.org',
            full: longestValidAddress,
        },
    },
    {
        it: 'handles the longest allowed domain label',
        input: `simple@${longestValidDomainLabel}`,
        expect: {
            user: 'simple',
            domain: longestValidDomainLabel,
            full: `simple@${longestValidDomainLabel}`,
        },
    },
];

const invalidEmailTestCases = [
    {
        it: 'rejects domain name with no TLD',
        input: 'admin@mailserver1',
        expect: undefined,
    },
    {
        it: 'rejects unescaped @ in user',
        input: 'foo@example.org+bob@attacker.com',
        expect: undefined,
    },
    {
        it: 'rejects empty string',
        input: '',
        expect: undefined,
    },
    {
        it: 'rejects badly escaped quote',
        input: String.raw`"john\\"doe"@example.org`,
        expect: undefined,
    },
    {
        it: 'rejects bad ip address [300.0.0.1]',
        input: 'user@[300.0.0.1]',
        expect: undefined,
    },
    {
        it: 'rejects bad ip address [127.0.0.0.1]',
        input: 'user@[127.0.0.0.1]',
        expect: undefined,
    },
    {
        it: 'rejects bad ip address [127.00.0.1]',
        input: 'user@[127.00.0.1]',
        expect: undefined,
    },
    {
        it: 'rejects bad ip address [127.0.1]',
        input: 'user@[127.0.1]',
        expect: undefined,
    },
    {
        it: 'rejects user@example.org#',
        input: 'user@example.org#',
        expect: undefined,
    },
    {
        it: 'rejects user@example.org.',
        input: 'user@example.org.',
        expect: undefined,
    },
    {
        it: 'rejects foo bar@example.org',
        input: 'foo bar@example.org',
        expect: undefined,
    },
    {
        it: 'rejects double dot john..doe@example.org',
        input: 'john..doe@example.org',
        expect: undefined,
    },
    {
        it: 'rejects brackets <john.doe@example.org>',
        input: '<john.doe@example.org>',
        expect: undefined,
    },
    {
        it: 'rejects too long domain',
        input: 'local-part@XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.xyz',
        expect: undefined,
    },
    {
        it: 'rejects too long domain label',
        input: `local-part@${'X'.repeat(70)}.xyz`,
        expect: undefined,
    },
    {
        it: 'rejects empty domain',
        input: 'local-part@',
        expect: undefined,
    },
    {
        it: 'rejects empty local part',
        input: '@example.org',
        expect: undefined,
    },
    {
        it: 'rejects insanely long address',
        input: `${'a'.repeat(2000)}@example.org`,
        expect: undefined,
    },
    {
        it: 'rejects too short tld',
        input: 'tld-too-short@foo.x',
        expect: undefined,
    },
    {
        it: 'rejects too long label',
        input: 'local-part@label_too_long_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.xyz',
        expect: undefined,
    },

    {
        it: 'rejects missing @',
        input: 'Abc.example.org',
        expect: undefined,
    },
    {
        it: 'rejects more than one @ outside quotation marks',
        input: 'A@b@c@example.org',
        expect: undefined,
    },
    {
        it: 'rejects invalid outside-of-quotes user special characters',
        input: 'a"b(c)d,e:f;g<h>i[jk]l@example.org',
        expect: undefined,
    },
    {
        it: 'rejects user quoted strings with non-quoted parts',
        input: 'just"not"right@example.org',
        expect: undefined,
    },
    {
        it: 'rejects escaped characters not in quotes',
        input: String.raw`this\ still\"not\allowed@example.org`,
        expect: undefined,
    },
    {
        it: 'rejects underscore in domain',
        input: 'i_like_underscore@but_its_not_allowed_in_this_part.example.org',
        expect: undefined,
    },
    {
        it: 'rejects undefined',
        input: undefined,
        expect: undefined,
    },
    {
        it: 'rejects surrounding whitespace',
        input: ' simple@example.org ',
        expect: undefined,
    },
    {
        it: 'rejects a trailing line break',
        input: 'simple@example.org\r\n',
        expect: undefined,
    },
    {
        it: 'rejects a header display name address',
        input: 'Simple Person <simple@example.org>',
        expect: undefined,
    },
    {
        it: 'rejects a list of two addresses',
        input: 'simple@example.org, other@example.org',
        expect: undefined,
    },
    {
        it: 'rejects a group of addresses',
        input: 'Group: simple@example.org;',
        expect: undefined,
    },
    {
        it: 'rejects a trailing comment',
        input: 'simple@example.org (Simple Person)',
        expect: undefined,
    },
    {
        it: 'rejects an unqualified host name',
        input: 'simple@localhost',
        expect: undefined,
    },
    {
        it: 'rejects a delete character in the user',
        input: `simple${deleteCharacter}@example.org`,
        expect: undefined,
    },
    {
        it: 'rejects an address one character over the length limit',
        input: `a${longestValidAddress}`,
        expect: undefined,
    },
    {
        it: 'rejects a domain label one character over the length limit',
        input: `simple@a${longestValidDomainLabel}`,
        expect: undefined,
    },
];

describe(parseEmailAddress.name, () => {
    itCases(parseEmailAddress, [
        ...validEmailTestCases,
        ...invalidEmailTestCases,
    ]);
});

describe(isValidEmailAddress.name, () => {
    itCases(isValidEmailAddress, [
        ...validEmailTestCases.map((testCase) => {
            return {
                ...testCase,
                expect: true,
            };
        }),
        ...invalidEmailTestCases.map((testCase) => {
            return {
                ...testCase,
                expect: false,
            };
        }),
    ]);
});
describe(normalizeEmailAddress.name, () => {
    itCases(normalizeEmailAddress, [
        {
            it: 'handles simple@example.org',
            input: 'simple@example.org',
            expect: 'simple@example.org',
        },
        {
            it: 'converts all to lowercase',
            input: 'SIMPLE@EXAMPLE.ORG',
            expect: 'simple@example.org',
        },
        {
            it: 'handles very.common@example.org',
            input: 'very.common@example.org',
            expect: 'very.common@example.org',
        },
        {
            it: 'handles disposable.style.email.with+symbol@example.org',
            input: 'disposable.style.email.with+symbol@example.org',
            expect: 'disposable.style.email.with+symbol@example.org',
        },
        {
            it: 'handles one letter user',
            input: 'x@example.org',
            expect: 'x@example.org',
        },
        {
            it: 'handles one letter user',
            input: 'x@example.org',
            expect: 'x@example.org',
        },
        {
            it: 'handles space between quotes user',
            input: '" "@example.org',
            expect: '" "@example.org',
        },
        {
            it: 'handles quoted double dot',
            input: '"john..doe"@example.org',
            expect: '"john..doe"@example.org',
        },

        {
            it: 'handles quoted string with angle brackets',
            input: '"<john-doe>"@example.org',
            expect: '"<john-doe>"@example.org',
        },
        {
            it: 'handles quoted string with backslash escape',
            input: String.raw`"\<john-doe\>"@example.org`,
            expect: '"<john-doe>"@example.org',
        },
        {
            it: 'handles address in quoted local-part',
            input: '"john.doe@example.org"@example.org',
            expect: '"john.doe@example.org"@example.org',
        },
        {
            it: 'handles escaped quoted @',
            input: String.raw`"john\@doe"@example.org`,
            expect: '"john@doe"@example.org',
        },
        {
            it: 'handles escaped quoted quote',
            input: String.raw`"john\"doe"@example.org`,
            expect: String.raw`"john\"doe"@example.org`,
        },
        {
            it: 'handles bangified host route used for uucp mailers',
            input: 'mailhost!username@example.org',
            expect: 'mailhost!username@example.org',
        },
        {
            it: 'handles % escaped mail route to user@example.org via example.org',
            input: 'user%example.org@example.org',
            expect: 'user%example.org@example.org',
        },
        {
            it: 'handles local part ending with non-alphanumeric character from the list of allowed printable characters',
            input: 'user-@example.org',
            expect: 'user-@example.org',
        },
        {
            it: 'handles ip domain',
            input: 'simple@[127.0.0.1]',
            expect: 'simple@[127.0.0.1]',
        },
        {
            it: 'handles IPv6 ip domain',
            input: 'simple@[IPv6:::1]',
            expect: 'simple@[ipv6:::1]',
        },
        {
            it: 'handles another IPv6 domain',
            input: 'simple@[IPv6:68:1c:a2:12:4a:e5]',
            expect: 'simple@[ipv6:68:1c:a2:12:4a:e5]',
        },
        {
            it: 'handles unicode UTF-8',
            input: '我買@屋企.香港',
            expect: '我買@屋企.香港',
        },
        {
            it: 'handles #user@example.org',
            input: '#user@example.org',
            expect: '#user@example.org',
        },
        {
            it: 'handles general address literal',
            input: 'simple@[tag:Can-Be-Anything]',
            expect: 'simple@[tag:can-be-anything]',
        },
        {
            it: 'lowercases only the domain of an uppercase address',
            input: 'Simple.Person@Example.ORG',
            expect: 'simple.person@example.org',
        },
        {
            it: 'keeps the dots and plus tag that make an address distinct',
            input: 'simple.person+referrals@example.org',
            expect: 'simple.person+referrals@example.org',
        },
        {
            it: 'lowercases a quoted user, which its own host may consider distinct',
            input: '"Simple.Person"@Example.ORG',
            expect: '"simple.person"@example.org',
        },
        {
            it: 'lowercases an IPv6 tag',
            input: 'simple@[IPv6:::1]',
            expect: 'simple@[ipv6:::1]',
        },
        {
            it: 'keeps a two letter top level domain',
            input: 'simple@example.co',
            expect: 'simple@example.co',
        },
        {
            it: 'keeps a surrogate pair in the user',
            input: `simple${grinningFace}@example.org`,
            expect: `simple${grinningFace}@example.org`,
        },
        {
            it: 'handles the longest allowed address',
            input: longestValidAddress,
            expect: longestValidAddress,
        },

        ...invalidEmailTestCases,
    ]);
});
