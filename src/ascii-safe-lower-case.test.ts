// cspell:words ÉXAMPLE éxample

import {describe, itCases} from '@augment-vir/test';
import {asciiSafeLowerCase} from './ascii-safe-lower-case.js';

const kelvinSign = String.fromCodePoint(0x21_2a);
const angstromSign = String.fromCodePoint(0x21_2b);
const dottedCapitalI = String.fromCodePoint(0x01_30);
const grinningFace = String.fromCodePoint(0x1_f6_00);

describe(asciiSafeLowerCase.name, () => {
    itCases(asciiSafeLowerCase, [
        {
            it: 'returns an empty string unchanged',
            input: '',
            expect: '',
        },
        {
            it: 'lowercases ASCII letters',
            input: 'Simple.Person@Example.ORG',
            expect: 'simple.person@example.org',
        },
        {
            it: 'leaves ASCII that has no case alone',
            input: '123-456_789',
            expect: '123-456_789',
        },
        {
            it: 'leaves a Kelvin sign alone instead of folding it to an ASCII k',
            input: kelvinSign,
            expect: kelvinSign,
        },
        {
            it: 'does not collide a Kelvin sign with the ASCII letter it would fold to',
            input: `ban${kelvinSign}`,
            expect: `ban${kelvinSign}`,
        },
        {
            /**
             * The result starts with an ASCII `i` but keeps a combining dot, so it cannot pass for
             * one.
             */
            it: 'lowercases a dotted capital I into an ASCII i followed by a combining mark',
            input: dottedCapitalI,
            expect: dottedCapitalI.toLowerCase(),
        },
        {
            it: 'lowercases a non-ASCII character that stays within its own script',
            input: 'ÉXAMPLE',
            expect: 'éxample',
        },
        {
            it: 'lowercases an Angstrom sign, which stays non-ASCII',
            input: angstromSign,
            expect: angstromSign.toLowerCase(),
        },
        {
            it: 'keeps a surrogate pair intact',
            input: `Wow${grinningFace}`,
            expect: `wow${grinningFace}`,
        },
    ]);
});
