import {
    type AddressListToken,
    AddressListTokenType,
    tokenizeAddressList,
} from './address-list-tokens.js';
import {normalizeEmailAddress, type ParsedEmailAddress} from './parse-email-address.js';

/** A single mailbox read out of an RFC 5322 address list header. */
export type ParsedHeaderEmailAddress = ParsedEmailAddress & {
    /**
     * The display name that preceded the address, with quoting and comments removed, or `undefined`
     * when the address had none.
     */
    displayName: string | undefined;
    /** The name of the RFC 5322 `group` the address appeared in, if it appeared in one. */
    groupName: string | undefined;
    /**
     * The address as {@link normalizeEmailAddress} produces it, for string comparisons. This is
     * `undefined` when the address is not a valid RFC 5321 mailbox, which a header may legitimately
     * contain: `root@localhost` is a well-formed RFC 5322 address but has no fully qualified
     * domain.
     *
     * Compare addresses through this property rather than through `full`, which preserves whatever
     * casing and quoting the sender used. Note that a `quoted-string` `local-part` may itself
     * contain an `@`, so read a receiving domain from the _last_ `@` rather than the first.
     */
    normalized: string | undefined;
};

/**
 * The longest header value that {@link parseEmailAddressList} will read. RFC 5322 sets no limit on
 * the length of a folded address list header, so this exists only to bound the work done on hostile
 * input; it is far above any legitimate header.
 */
export const maxAddressListLength = 65_536;

/** The RFC 5321 section 4.5.3.1.1 `local-part` limit. */
const maxLocalPartLength = 64;

/** The RFC 5321 section 4.5.3.1.3 `Path` limit, less the angle brackets it counts. */
const maxAddressLength = 254;

/**
 * Parse an [RFC 5322](https://datatracker.ietf.org/doc/html/rfc5322#section-3.4) address list
 * header value (`To`, `Cc`, `Bcc`, `From`, `Reply-To`, and friends) into its mailboxes.
 *
 * Unlike `parseEmailAddress`, which implements the strict RFC 5321 envelope grammar, this accepts
 * everything a message header may carry: display names, quoted strings, nested comments, folding
 * whitespace, groups, domain literals, obsolete source routes, and multiple addresses. Malformed
 * entries are dropped rather than throwing, so a single broken address never costs you the rest of
 * the header.
 *
 * A display name or a group name is never reported as an address. `billing@example.com Jane
 * <attacker@example.org>` reads as one address, `attacker@example.org`, because only the angle-addr
 * names a real recipient, and `billing@example.com: victim@example.org;` reads as one address in a
 * group. Code that decides where mail goes must rely on this rather than on searching the header
 * for text that looks like an address.
 *
 * @example
 *
 * ```ts
 * import {parseEmailAddressList} from 'parse-email-address';
 *
 * const result = parseEmailAddressList('Jane Doe <jane@example.org>, john@example.org');
 * // result is two entries, the first with `displayName: 'Jane Doe'`
 *
 * parseEmailAddressList('undisclosed-recipients:;'); // returns `[]`
 * ```
 *
 * @throws Nothing, this will never throw an error.
 */
export function parseEmailAddressList(headerValue: string | undefined): ParsedHeaderEmailAddress[] {
    if (!headerValue || headerValue.length > maxAddressListLength) {
        return [];
    }

    return parseAddressListTokens(tokenizeAddressList(headerValue));
}

/**
 * Parse a header value that should hold exactly one mailbox, such as `From` or `Sender`. Unlike
 * `parseEmailAddress` this accepts a display name, and unlike {@link parseEmailAddressList} it
 * refuses to guess when the value holds more than one address.
 *
 * @example
 *
 * ```ts
 * import {parseHeaderEmailAddress} from 'parse-email-address';
 *
 * parseHeaderEmailAddress('Jane Doe <jane@example.org>'); // returns the parsed mailbox
 * parseHeaderEmailAddress('jane@example.org, john@example.org'); // returns `undefined`
 * ```
 *
 * @returns `undefined` unless the given value holds exactly one address.
 * @throws Nothing, this will never throw an error.
 */
export function parseHeaderEmailAddress(
    headerValue: string | undefined,
): ParsedHeaderEmailAddress | undefined {
    const addresses = parseEmailAddressList(headerValue);

    return addresses.length === 1 ? addresses[0] : undefined;
}

function parseAddressListTokens(
    tokens: ReadonlyArray<AddressListToken>,
): ParsedHeaderEmailAddress[] {
    const addresses: ParsedHeaderEmailAddress[] = [];
    let index = 0;
    let groupName: string | undefined = undefined;

    while (index < tokens.length) {
        const phraseStart = index;

        while (tokens[index]?.type === AddressListTokenType.Word) {
            index++;
        }

        const words = tokens.slice(phraseStart, index);
        const next = tokens[index];

        if (!next) {
            break;
        } else if (next.raw === '@') {
            const parsed = parseAddrSpec({
                tokens,
                words,
                atIndex: index,
                groupName,
            });

            /**
             * A display name or a group name may itself look like an address, as in
             * `billing@example.com Jane <attacker@example.org>`. Anything that precedes an
             * angle-addr or a group's `:` is a name rather than a mailbox, however many words sit
             * in between, so it must never be reported as a recipient.
             */
            const followedBy = tokens[findEntryTerminator(tokens, parsed.nextIndex)]?.raw;

            if (parsed.address && followedBy !== '<' && followedBy !== ':') {
                addresses.push(parsed.address);
            }

            index = parsed.nextIndex;
        } else if (next.raw === '<') {
            const parsed = parseAngleAddr({
                tokens,
                startIndex: index,
                displayName: joinPhrase(words),
                groupName,
            });

            if (parsed.address) {
                addresses.push(parsed.address);
            }

            index = parsed.nextIndex;
        } else if (next.raw === ':') {
            groupName = joinPhrase(words);
            index++;
        } else if (next.raw === ';') {
            /**
             * A group ends here. Mailers that separate a plain address list with semicolons instead
             * of commas land here too, which is why this only ends the group rather than the list.
             */
            groupName = undefined;
            index++;
        } else {
            /** A comma, a stray `>`, or a phrase with no address attached to it. */
            index++;
        }
    }

    return addresses;
}

/**
 * Reads an `addr-spec` whose `@` sits at `atIndex`. Every word before the `@` must belong to the
 * `local-part`, with nothing separating one from the next: `Jane Doe @example.org` names no
 * mailbox, so it must not be read as one called `Doe`. A second `@` after the domain is likewise
 * refused rather than resolved in the sender's favor, since `victim@bank.test@attacker.test` is a
 * mailbox at `attacker.test` in RFC 5321's reading and at `bank.test` in a first-`@`-wins reading.
 */
function parseAddrSpec({
    tokens,
    words,
    atIndex,
    groupName,
}: Readonly<{
    tokens: ReadonlyArray<AddressListToken>;
    words: ReadonlyArray<AddressListToken>;
    atIndex: number;
    groupName: string | undefined;
}>): {
    address: ParsedHeaderEmailAddress | undefined;
    nextIndex: number;
} {
    const domainToken = tokens[atIndex + 1];
    const domain =
        domainToken?.type === AddressListTokenType.Word ||
        domainToken?.type === AddressListTokenType.DomainLiteral
            ? domainToken.raw
            : undefined;
    const nextIndex = domain == undefined ? atIndex + 1 : atIndex + 2;

    if (
        domain == undefined ||
        !words.length ||
        !words.every((word, wordIndex) => wordIndex === 0 || !word.isSpaced) ||
        tokens[nextIndex]?.raw === '@'
    ) {
        return {
            address: undefined,
            nextIndex,
        };
    }

    const user = words.map((word) => word.raw).join('');
    const full = `${user}@${domain}`;

    return {
        address: {
            user,
            domain,
            full,
            displayName: undefined,
            groupName,
            normalized: normalizeAddressWithinLimits({
                user,
                domain,
            }),
        },
        nextIndex,
    };
}

/**
 * RFC 5321 caps a `local-part` at 64 octets and a `Path` at 256, so anything longer has no valid
 * normalized form. Checking that here also keeps a hostile header away from the RFC 5321 parser,
 * whose cost grows faster than linearly in address length.
 *
 * The root label of a fully qualified domain may be written as a trailing dot, which RFC 5321's
 * `Domain` has no room for, so it is dropped before normalizing rather than costing the address its
 * comparable form.
 */
function normalizeAddressWithinLimits({
    user,
    domain,
}: Readonly<{user: string; domain: string}>): string | undefined {
    const full = `${user}@${domain.replace(/\.$/, '')}`;

    return user.length > maxLocalPartLength || full.length > maxAddressLength
        ? undefined
        : normalizeEmailAddress(full);
}

function parseAngleAddr({
    tokens,
    startIndex,
    displayName,
    groupName,
}: Readonly<{
    tokens: ReadonlyArray<AddressListToken>;
    startIndex: number;
    displayName: string | undefined;
    groupName: string | undefined;
}>): {
    address: ParsedHeaderEmailAddress | undefined;
    nextIndex: number;
} {
    const contentStart = skipObsoleteRoute(tokens, startIndex + 1);
    let index = contentStart;

    while (tokens[index]?.type === AddressListTokenType.Word) {
        index++;
    }

    const parsed =
        tokens[index]?.raw === '@'
            ? parseAddrSpec({
                  tokens,
                  words: tokens.slice(contentStart, index),
                  atIndex: index,
                  groupName,
              })
            : {
                  address: undefined,
                  nextIndex: index,
              };

    return {
        address: parsed.address && {
            ...parsed.address,
            displayName,
        },
        nextIndex: findAngleAddrEnd(tokens, parsed.nextIndex),
    };
}

/**
 * Skips the `obs-route` of an obsolete source route, as in `<@relay.example.org:jane@example.org>`.
 * RFC 5321 says such a route must be accepted and then ignored.
 *
 * @returns The index the route ended at, or the given index when there is no route.
 */
function skipObsoleteRoute(tokens: ReadonlyArray<AddressListToken>, startIndex: number): number {
    if (tokens[startIndex]?.raw !== '@') {
        return startIndex;
    }

    let index = startIndex;

    while (index < tokens.length) {
        const token = tokens[index];

        if (token?.raw === ':') {
            return index + 1;
        } else if (
            token?.type === AddressListTokenType.Special &&
            token.raw !== '@' &&
            token.raw !== ','
        ) {
            return startIndex;
        }

        index++;
    }

    return startIndex;
}

/**
 * Finds the end of an angle-addr. A missing `>` stops at the next list separator or angle-addr so
 * that an unterminated entry does not swallow the addresses after it.
 */
function findAngleAddrEnd(tokens: ReadonlyArray<AddressListToken>, startIndex: number): number {
    let index = startIndex;

    while (index < tokens.length) {
        const raw = tokens[index]?.raw;

        if (raw === '>') {
            return index + 1;
        } else if (raw === ',' || raw === ';' || raw === '<') {
            return index;
        }

        index++;
    }

    return index;
}

const entryTerminators = [
    ',',
    ';',
    '<',
    ':',
];

/**
 * @returns The index of the token that ends the entry starting at the given index, which is the end
 *   of the token list when nothing does.
 */
function findEntryTerminator(tokens: ReadonlyArray<AddressListToken>, startIndex: number): number {
    let index = startIndex;

    while (index < tokens.length && !entryTerminators.includes(tokens[index]?.raw ?? '')) {
        index++;
    }

    return index;
}

function joinPhrase(words: ReadonlyArray<AddressListToken>): string | undefined {
    return (
        words
            .map((word) => word.text)
            .join(' ')
            .trim() || undefined
    );
}
