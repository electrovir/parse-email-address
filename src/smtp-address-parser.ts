/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * This is largely copied from
 * https://github.com/gene-hightower/smtp-address-parser/blob/75e0f93837cc302c122cfd3f9a6d9a49f9dd56a3/lib/index.ts
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
 *
 * It has been modified to have proper imports.
 */

import * as rawNearley from './nearley.js';

import {type RequireExactlyOne} from 'type-fest';
import myGrammar from './grammar.js';

const {Grammar, Parser} = rawNearley;

myGrammar.ParserStart = 'Mailbox';
const grammar = Grammar.fromCompiled(myGrammar);

export type ParseOutput = {
    domainPart: RequireExactlyOne<{
        AddressLiteral: string;
        DomainName: string;
    }>;
    localPart: RequireExactlyOne<{
        QuotedString: string;
        DotString: string;
    }>;
};

// <https://tools.ietf.org/html/rfc5321#section-4.1.2>

export function parse(address: string): ParseOutput {
    // An insane length, to protect the parsing code from huge input. SMTP line limit, minus command size.
    const insane_length = 1000 - 'MAIL FROM:<>\r\n'.length;

    if (address.length > insane_length) {
        throw new Error('address too long');
    }

    const parser = new Parser(grammar);
    parser.feed(address);

    if (parser.results!.length !== 1) {
        throw new Error('address parsing failed: ambiguous grammar');
    }

    // Domain checks

    const at_idx = address.lastIndexOf('@'); // must be found, since parse was successful
    const domain = address.slice(Math.max(0, at_idx + 1));
    if (domain[0] !== '[') {
        // Not an address literal
        if (domain.length > 253) {
            throw new Error('domain too long');
        }
        const labels = domain.split('.');
        if (labels.length < 2) {
            throw new Error('domain not fully qualified');
        } else if (labels[labels.length - 1]!.length < 2) {
            throw new Error('top level domain label too short');
        }

        labels.sort(function (a: string, b: string) {
            return b.length - a.length;
        });
        if (labels[0]!.length > 63) {
            throw new Error('domain label too long');
        }
    }
    return parser.results![0];
}

/** Strip +something, strip '.'s, and map to lower case. */
export function normalize_dot_string(dot_string: string) {
    const noTag = (function () {
        const plus_loc = dot_string.indexOf('+');
        if (plus_loc === -1) {
            return dot_string;
        }
        return dot_string.slice(0, Math.max(0, plus_loc));
    })();
    const noDot = noTag.replace(/\./g, '');
    return noDot.toLowerCase();
}

/** The G style address normalization. */
export function normalize(address: string) {
    const a = parse(address);
    const domain = a.domainPart.AddressLiteral ?? a.domainPart.DomainName.toLowerCase();
    const local = a.localPart.QuotedString ?? normalize_dot_string(a.localPart.DotString);
    return `${local}@${domain}`;
}

export function canonicalize_quoted_string(quoted_string: string) {
    const unquoted = quoted_string.slice(1).slice(0, Math.max(0, quoted_string.length - 2));
    const unescaped = unquoted.replace(/(?:\\(.))/g, '$1');
    const reEscaped = unescaped.replace(/(?:(["\\]))/g, String.raw`\$1`);
    return `"${reEscaped}"`; // re-quote
}

/** Apply a canonicalization consistent with standards to support comparison as a string. */
export function canonicalize(address: string) {
    const a = parse(address);
    const domain = a.domainPart.AddressLiteral ?? a.domainPart.DomainName.toLowerCase();
    const local = a.localPart.QuotedString
        ? canonicalize_quoted_string(a.localPart.QuotedString)
        : a.localPart.DotString;
    return `${local}@${domain}`;
}
