# parse-email-address

Parse, validate, and normalize email addresses.

Full docs: https://electrovir.github.io/parse-email-address

Pick the function that matches what you have:

-   One address, like something typed into a form: `parseEmailAddress`, `isValidEmailAddress`, `normalizeEmailAddress`. These accept only `user@domain`, so `Jane Doe <jane@example.org>` is not valid.
-   A `To`, `Cc`, or `From` header from an email: `parseEmailAddressList` (any number of addresses) or `parseHeaderEmailAddress` (exactly one). These accept names, comments, and everything else a header can hold.

This uses and is based on [`smtp-address-parser` v1.1.0](https://www.npmjs.com/package/smtp-address-parser/v/1.1.0), so it has the following features (from `smtp-address-parser`):

-   Domain names must be fully qualified (they must have at least two labels). The top-level domain must have at least two octets.
    -   good: `name@example.org`
    -   bad: `name@example`
    -   bad: `name@example.x`
-   Total length limit of an address is 986 octets (based on a 1,000 octet SMTP line length).
-   Domain names are limited to 255 octets, when encoded with a length byte before each label, and including the top-level zero length label. So, the effective limit with interstitial dots is 253 octets.
-   Labels within a domain name are limited to 63 octets (limits of the DNS protocol).

This package adds the following features:

-   Full ESM support (this package natively runs in all modern browsers).
-   Documentation.
-   More explicit types.
-   Simplified API.
-   No dependencies.
-   Email header parsing ([RFC-5322](https://datatracker.ietf.org/doc/html/rfc5322#section-3.4)), including names, comments, groups, line folding, and non-ASCII addresses.
    -   A name is never mistaken for an address. `billing@example.com <attacker@example.org>` has one recipient: `attacker@example.org`.
    -   Unclear addresses are skipped instead of guessed at.
    -   A bad address never breaks the rest of the header.
    -   Never throws, and safe to run on untrusted email.

## install

```sh
npm i parse-email-address
```

## usage

<!-- example-link: src/examples.example.ts -->

```TypeScript
import {
    isValidEmailAddress,
    normalizeEmailAddress,
    parseEmailAddress,
    parseEmailAddressList,
    parseHeaderEmailAddress,
} from 'parse-email-address';

/**
 * Parse email addresses into parts with `parseEmailAddress`. Returns `undefined` if the input is an
 * invalid email address.
 */

parseEmailAddress('simple@example.org'); // returns `{user: 'simple', domain: 'example.org', full: 'simple@example.org'}`
parseEmailAddress('tld-too-short@foo.x'); // returns `undefined`

/**
 * Normalize email addresses for string comparisons with `normalizeEmailAddress`. Returns
 * `undefined` if the input is an invalid email address.
 */

normalizeEmailAddress('SIMPLE@EXAMPLE.ORG'); // returns `'simple@example.org'`
normalizeEmailAddress('tld-too-short@foo.x'); // returns `undefined`

/** Check if an email address is valid with `isValidEmailAddress`. */

isValidEmailAddress('simple@example.org'); // returns `true`
isValidEmailAddress('SIMPLE@EXAMPLE.ORG'); // returns `true`
isValidEmailAddress('tld-too-short@foo.x'); // returns `false`

/**
 * All three of those implement RFC 5321, the strict envelope grammar, so they accept nothing but a
 * bare `user@domain`. To read a message header, use `parseEmailAddressList`, which implements RFC
 * 5322 and returns every mailbox in the header.
 */

parseEmailAddressList('Jane Doe <jane@example.org>, john@example.org');
// returns two mailboxes, the first with `displayName: 'Jane Doe'`
parseEmailAddressList('Intake: jane@example.org;');
// returns one mailbox with `groupName: 'Intake'`
parseEmailAddressList('undisclosed-recipients:;'); // returns `[]`

/**
 * A display name is never reported as an address, so a display name that looks like an address
 * cannot pass itself off as a recipient.
 */

parseEmailAddressList('billing@example.com <attacker@example.org>');
// returns only `attacker@example.org`

/** Use `parseHeaderEmailAddress` for a header that should hold exactly one address. */

parseHeaderEmailAddress('Jane Doe <jane@example.org>'); // returns one mailbox
parseHeaderEmailAddress('jane@example.org, john@example.org'); // returns `undefined`
```
