import {canonicalize, parse} from './smtp-address-parser.js';

/**
 * Output from {@link parseEmailAddress}.
 *
 * Note that {@link parseEmailAddress} will return `undefined` instead of this if its input is not a
 * valid email address.
 */
export type ParsedEmailAddress = {
    /**
     * The "user" or "local" part of an email address. (Everything to the left of the unquoted `@`.)
     *
     * @example
     *
     * 'simple' from 'simple@example.org'
     */
    user: string;
    /**
     * The "domain" or "address" part of the email address. (Everything to the right of the unquoted
     * `@`.)
     *
     * @example
     *
     * 'example.org' from 'simple@example.org'
     */
    domain: string;
    /**
     * The entire original email address.
     *
     * @example
     *
     * 'simple@example.org' from 'simple@example.org'
     */
    full: string;
};

/**
 * Parse a single RFC 5321 email address into parts. This is the strict, envelope-level grammar: it
 * accepts nothing but a bare `user@domain`. To read an address out of an RFC 5322 message header
 * (which may carry display names, comments, groups, and multiple addresses), use
 * `parseEmailAddressList` or `parseHeaderEmailAddress` instead.
 *
 * This uses `parse` from [`smtp-address-parser`
 * v1.1.0](https://www.npmjs.com/package/smtp-address-parser/v/1.1.0).
 *
 * @example
 *
 * ```ts
 * import {parseEmailAddress} from 'parse-email-address';
 *
 * const result1 = parseEmailAddress('simple@example.org');
 * // result1 is `{user: 'simple', domain: 'example.org', full: 'simple@example.org'}`
 *
 * const result2 = parseEmailAddress('tld-too-short@foo.x');
 * // result2 is `undefined`
 *
 * const result3 = parseEmailAddress('Simple Person <simple@example.org>');
 * // result3 is `undefined`
 * ```
 *
 * @returns `undefined` if the given email address is invalid.
 * @throws Nothing, this will never throw an error.
 */
export function parseEmailAddress(
    emailAddress: string | undefined,
): ParsedEmailAddress | undefined {
    try {
        if (!emailAddress) {
            return undefined;
        }

        const parsed = parse(emailAddress);

        return {
            user: parsed.localPart.DotString ?? parsed.localPart.QuotedString,
            domain: parsed.domainPart.AddressLiteral ?? parsed.domainPart.DomainName,
            full: emailAddress,
        };
    } catch {
        return undefined;
    }
}

/**
 * Normalizes an email address for string comparisons. It is discouraged to use the output of this
 * for sending email as even the weird parts of a valid email address may be required for the user's
 * specific email server to properly handle emails.
 *
 * This uses `canonicalize` from [`smtp-address-parser`
 * v1.1.0](https://www.npmjs.com/package/smtp-address-parser/v/1.1.0) and converts the entire string
 * to lowercase.
 *
 * @example
 *
 * ```ts
 * import {normalizeEmailAddress} from 'parse-email-address';
 *
 * const result1 = normalizeEmailAddress('SIMPLE@EXAMPLE.ORG');
 * // result1 is `'simple@example.org'`
 *
 * const result2 = normalizeEmailAddress('tld-too-short@foo.x');
 * // result2 is `undefined`
 * ```
 *
 * @returns `undefined` if the given email address is invalid.
 * @throws Nothing, this will never throw an error.
 */
export function normalizeEmailAddress(emailAddress: string | undefined): string | undefined {
    try {
        if (!emailAddress) {
            return undefined;
        }

        return canonicalize(emailAddress).toLowerCase();
    } catch {
        return undefined;
    }
}

/**
 * Checks if the given email address is a valid RFC 5321 email address. As with
 * {@link parseEmailAddress}, this rejects everything but a bare `user@domain`, so header forms like
 * `Simple Person <simple@example.org>` are _not_ valid here.
 *
 * This uses `parse` from [`smtp-address-parser`
 * v1.1.0](https://www.npmjs.com/package/smtp-address-parser/v/1.1.0).
 *
 * @example
 *
 * ```ts
 * import {isValidEmailAddress} from 'parse-email-address';
 *
 * const result1 = isValidEmailAddress('simple@example.org');
 * // result1 is `true`
 *
 * const result2 = isValidEmailAddress('SIMPLE@EXAMPLE.ORG');
 * // result2 is `true`
 *
 * const result3 = isValidEmailAddress('tld-too-short@foo.x');
 * // result3 is `false`
 * ```
 *
 * @throws Nothing, this will never throw an error.
 */
export function isValidEmailAddress(emailAddress: string | undefined): boolean {
    try {
        if (!emailAddress) {
            return false;
        }

        parse(emailAddress);
        return true;
    } catch {
        return false;
    }
}
