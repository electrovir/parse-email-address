import {
    isValidEmailAddress,
    normalizeEmailAddress,
    parseEmailAddress,
    parseEmailAddressList,
    parseHeaderEmailAddress,
} from './index.js';

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
