/**
 * This is largely copied from
 * https://github.com/gene-hightower/smtp-address-parser/blob/75e0f93837cc302c122cfd3f9a6d9a49f9dd56a3/test/addresses.test.ts
 * which has the following license:
 *
 *     MIT License
 *
 *     Copyright (c) 2021 Gene Hightower
 *
 *     Permission is hereby granted, free of charge, to any person obtaining a copy
 *     of this software and associated documentation files (the "Software"), to deal
 *     in the Software without restriction, including without limitation the rights
 *     to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *     copies of the Software, and to permit persons to whom the Software is
 *     furnished to do so, subject to the following conditions:
 *
 *     The above copyright notice and this permission notice shall be included in all
 *     copies or substantial portions of the Software.
 *
 *     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *     IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *     FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *     AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *     LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *     OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *     SOFTWARE.
 */

import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {
    canonicalize,
    canonicalize_quoted_string,
    normalize,
    normalize_dot_string,
    parse,
} from './smtp-address-parser.js';

function check({
    address,
    dot,
    quote,
    name,
    addr,
}: {
    address: string;
    dot?: string | undefined;
    quote?: string | undefined;
    name?: string | undefined;
    addr?: string | undefined;
}) {
    const a = parse(address);
    assert.strictEquals(a.localPart.DotString, dot);
    assert.strictEquals(a.localPart.QuotedString, quote);
    assert.strictEquals(a.domainPart.DomainName, name);
    assert.strictEquals(a.domainPart.AddressLiteral, addr);
    if (dot) {
        assert.isUndefined(quote);
        assert.isDefined(dot);
    } else {
        assert.isDefined(quote);
        assert.isUndefined(dot);
    }
    if (name) {
        assert.isUndefined(addr);
        assert.isDefined(name);
    } else {
        assert.isDefined(addr);
        assert.isUndefined(name);
    }
}

// <https://en.wikipedia.org/wiki/Email_address#Examples>

describe('good addresses pass', () => {
    it('simple@example.org', () => {
        check({
            address: 'simple@example.org',
            dot: 'simple',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('very.common@example.org', () => {
        check({
            address: 'very.common@example.org',
            dot: 'very.common',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('disposable.style.email.with+symbol@example.org', () => {
        check({
            address: 'disposable.style.email.with+symbol@example.org',
            dot: 'disposable.style.email.with+symbol',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('one-letter local-part', () => {
        check({
            address: 'x@example.org',
            dot: 'x',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('space between the quotes', () => {
        check({
            address: '" "@example.org',
            dot: undefined,
            quote: '" "',
            name: 'example.org',
            addr: undefined,
        });
    });
    it('quoted double dot', () => {
        check({
            address: '"john..doe"@example.org',
            dot: undefined,
            quote: '"john..doe"',
            name: 'example.org',
            addr: undefined,
        });
    });
    it('quoted string with angle brackets', () => {
        check({
            address: '"<john-doe>"@example.org',
            dot: undefined,
            quote: '"<john-doe>"',
            name: 'example.org',
            addr: undefined,
        });
    });
    it('quoted string with backslash escape', () => {
        check({
            address: String.raw`"\<john-doe\>"@example.org`,
            dot: undefined,
            quote: String.raw`"\<john-doe\>"`,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('address in quoted local-part "john.doe@example.org"@example.org', () => {
        check({
            address: '"john.doe@example.org"@example.org',
            dot: undefined,
            quote: '"john.doe@example.org"',
            name: 'example.org',
            addr: undefined,
        });
    });
    it('escaped quoted pair', () => {
        check({
            address: String.raw`"john\@doe"@example.org`,
            dot: undefined,
            quote: String.raw`"john\@doe"`,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('escaped quoted', () => {
        check({
            address: String.raw`"john\"doe"@example.org`,
            dot: undefined,
            quote: String.raw`"john\"doe"`,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('bangified host route used for uucp mailers', () => {
        check({
            address: 'mailhost!username@example.org',
            dot: 'mailhost!username',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('% escaped mail route to user@example.org via example.org', () => {
        check({
            address: 'user%example.org@example.org',
            dot: 'user%example.org',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('local part ending with non-alphanumeric character from the list of allowed printable characters', () => {
        check({
            address: 'user-@example.org',
            dot: 'user-',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('address literal to the right of the "@" sign', () => {
        check({
            address: 'simple@[127.0.0.1]',
            dot: 'simple',
            quote: undefined,
            name: undefined,
            addr: '[127.0.0.1]',
        });
    });
    it('IPv6 address literal to the right of the "@" sign', () => {
        check({
            address: 'simple@[IPv6:::1]',
            dot: 'simple',
            quote: undefined,
            name: undefined,
            addr: '[IPv6:::1]',
        });
    });
    it('Another IPv6 address literal', () => {
        check({
            address: 'simple@[IPv6:68:1c:a2:12:4a:e5]',
            dot: 'simple',
            quote: undefined,
            name: undefined,
            addr: '[IPv6:68:1c:a2:12:4a:e5]',
        });
    });
    it('Unicode UTF-8', () => {
        check({
            address: '我買@屋企.香港',
            dot: '我買',
            quote: undefined,
            name: '屋企.香港',
            addr: undefined,
        });
    });
    it('#user@example.org', () => {
        check({
            address: '#user@example.org',
            dot: '#user',
            quote: undefined,
            name: 'example.org',
            addr: undefined,
        });
    });
    it('General address literal', () => {
        check({
            address: 'simple@[tag:Can-Be-Anything]',
            dot: 'simple',
            quote: undefined,
            name: undefined,
            addr: '[tag:Can-Be-Anything]',
        });
    });
});

describe('bad addresses fail', () => {
    it('local domain name with no TLD', () => {
        assert.throws(() => {
            parse('admin@mailserver1'); // Now fails.
        });
    });
    it('"foo@example.org+bob@attacker.com" is not an address', () => {
        assert.throws(() => {
            parse('foo@example.org+bob@attacker.com');
        });
    });
    it(String.raw`badly escaped quoted "john\\"doe"@example.org`, () => {
        assert.throws(() => {
            parse(String.raw`"john\\"doe"@example.org`);
        });
    });
    it('bogus address literal [300.0.0.1]', () => {
        assert.throws(() => {
            parse('user@[300.0.0.1]');
        });
    });
    it('bogus address literal [127.0.0.0.1]', () => {
        assert.throws(() => {
            parse('user@[127.0.0.0.1]');
        });
    });
    it('bogus address literal [127.00.0.1]', () => {
        assert.throws(() => {
            parse('user@[127.00.0.1]');
        });
    });
    it('bogus address literal [127.0.1]', () => {
        assert.throws(() => {
            parse('user@[127.0.1]');
        });
    });
    it('user@example.org#', () => {
        assert.throws(() => {
            parse('user@example.org#');
        });
    });
    it('user@example.org.', () => {
        assert.throws(() => {
            parse('user@example.org.');
        });
    });
    it('foo bar@example.org', () => {
        assert.throws(() => {
            parse('foo bar@example.org');
        });
    });
    it('double dot john..doe@example.org', () => {
        assert.throws(() => {
            parse('john..doe@example.org');
        });
    });
    it('brackets <john.doe@example.org>', () => {
        assert.throws(() => {
            parse('<john.doe@example.org>');
        });
    });
    // From examples from <https://en.wikipedia.org/wiki/Email_address#Examples>
    // no @ character
    it('Abc.example.org', () => {
        assert.throws(() => {
            parse('Abc.example.org');
        });
    });
    // only one @ is allowed outside quotation marks
    it('A@b@c@example.org', () => {
        assert.throws(() => {
            parse('A@b@c@example.org');
        });
    });
    // none of the special characters in this local-part are allowed outside quotation marks
    it('a"b(c)d,e:f;g<h>i[jk]l@example.org', () => {
        assert.throws(() => {
            parse('a"b(c)d,e:f;g<h>i[jk]l@example.org');
        });
    });
    // quoted strings must be the only element making up the local-part
    it('just"not"right@example.org', () => {
        assert.throws(() => {
            parse('just"not"right@example.org');
        });
    });
    // even if escaped (preceded by a backslash), spaces, quotes, and backslashes must still be contained by quotes
    it(String.raw`this\ still\"not\allowed@example.org`, () => {
        assert.throws(() => {
            parse(String.raw`this\ still\"not\allowed@example.org`);
        });
    });
    // Underscore is not allowed in domain part
    it('i_like_underscore@but_its_not_allowed_in_this_part.example.org', () => {
        assert.throws(() => {
            parse('i_like_underscore@but_its_not_allowed_in_this_part.example.org');
        });
    });
    it('domain too long', () => {
        assert.throws(() => {
            parse(
                'local-part@XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.xyz',
            );
        });
    });
    it('tld too short', () => {
        assert.throws(() => {
            parse('tld-too-short@foo.x');
        });
    });
    it('label too long', () => {
        assert.throws(() => {
            parse(
                'local-part@label_too_long_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.xyz',
            );
        });
    });
});

describe('test normalize', () => {
    it('foo', () => {
        assert.strictEquals(normalize_dot_string('foo'), 'foo');
    });
    it('foo+bar', () => {
        assert.strictEquals(normalize_dot_string('foo+bar'), 'foo');
    });
    it('foo.bar', () => {
        assert.strictEquals(normalize_dot_string('foo.bar'), 'foobar');
    });
    it('Foo.Bar', () => {
        assert.strictEquals(normalize_dot_string('Foo.Bar'), 'foobar');
    });
    it('foo@example.org', () => {
        assert.strictEquals(normalize('foo@example.org'), 'foo@example.org');
    });
    it('foo+bar@example.org', () => {
        assert.strictEquals(normalize('foo+bar@example.org'), 'foo@example.org');
    });
    it('foo+@example.org', () => {
        assert.strictEquals(normalize('foo+@example.org'), 'foo@example.org');
    });
    it('foo.bar@example.org', () => {
        assert.strictEquals(normalize('foo.bar@example.org'), 'foobar@example.org');
    });
    it('foo.bar+baz@example.org', () => {
        assert.strictEquals(normalize('foo.bar+baz@example.org'), 'foobar@example.org');
    });
    it('Foo.Bar+Baz@Example.Org', () => {
        assert.strictEquals(normalize('Foo.Bar+Baz@Example.Org'), 'foobar@example.org');
    });
});

describe('test canonicalize', () => {
    const bs = '\\';
    it('"foo"', () => {
        assert.strictEquals(canonicalize_quoted_string('"foo"'), '"foo"');
    });
    it(`"foo${bs}+bar"`, () => {
        assert.strictEquals(canonicalize_quoted_string(`"foo${bs}+bar"`), '"foo+bar"');
    });
    it(`"foo${bs}.bar"`, () => {
        assert.strictEquals(canonicalize_quoted_string(`"foo${bs}.bar"`), '"foo.bar"');
    });
    it(String.raw`"foo${bs}\bar"`, () => {
        assert.strictEquals(
            canonicalize_quoted_string(String.raw`"foo${bs}\bar"`),
            String.raw`"foo\\bar"`,
        );
    });
    it(`"foo${bs}"bar"`, () => {
        assert.strictEquals(canonicalize_quoted_string(`"foo${bs}"bar"`), String.raw`"foo\"bar"`);
    });
    it('"foo"@example.org', () => {
        assert.strictEquals(canonicalize('"foo"@example.org'), '"foo"@example.org');
    });
    it(`"foo${bs}"bar"@Example.ORG`, () => {
        assert.strictEquals(
            canonicalize(`"foo${bs}"bar"@Example.ORG`),
            String.raw`"foo\"bar"@example.org`,
        );
    });
    it(`"foo ${bs}${bs} ${bs}"bar"@example.org`, () => {
        assert.strictEquals(
            canonicalize(`"foo ${bs}${bs} ${bs}"bar"@example.org`),
            String.raw`"foo \\ \"bar"@example.org`,
        );
    });
    it(`"f${bs}oo${bs}bar"@Example.ORG`, () => {
        assert.strictEquals(canonicalize(`"f${bs}oo${bs}bar"@Example.ORG`), '"foobar"@example.org');
    });
});
