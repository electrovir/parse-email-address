@preprocessor typescript

# This is copied from https://github.com/gene-hightower/smtp-address-parser/blob/75e0f93837cc302c122cfd3f9a6d9a49f9dd56a3/lib/grammar.ne
# and has the following license:
# MIT License
# 
# Copyright (c) 2021 Gene Hightower
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

@{%
const deepFlatten = (arr: any) =>
  [].concat(...arr.map((v: any) => (Array.isArray(v) ? deepFlatten(v) : v)));

function flat_string(d: any) {
  if (Array.isArray(d))
    return deepFlatten(d).join("");
  return d;
}
%}

# Some macros

times_3[X]     -> $X $X $X
times_5[X]     -> $X $X $X $X $X
times_7[X]     -> $X $X $X $X $X $X $X

# RFC 5321 writes the IPv6 compressed forms with *3 and *5, meaning "up to", not "exactly".
upTo_3[X]      -> null | $X | $X $X | $X $X $X
upTo_5[X]      -> null | $X | $X $X | $X $X $X | $X $X $X $X | $X $X $X $X $X

## <https://tools.ietf.org/html/rfc5321#section-4.1.2>

Reverse_path   -> Path | "<>"

Forward_path   -> ("<Postmaster@"i Domain ">") | "<Postmaster>"i | Path

Path           -> "<" ( A_d_l ":" ):? Mailbox ">"

A_d_l          -> At_domain ( "," At_domain ):*
                # Note that this form, the so-called "source
                # route", MUST BE accepted, SHOULD NOT be
                # generated, and SHOULD be ignored.

At_domain      -> "@" Domain

Domain         -> sub_domain ("." sub_domain):*

#A_label       -> Let_dig (Ldh_str):?

sub_domain     -> U_label

Let_dig        -> ALPHA_DIGIT {% id %}

Ldh_str        -> ALPHA_DIG_DASH:* Let_dig

U_Let_dig      -> ALPHA_DIGIT_U {% id %}

U_Ldh_str      -> ALPHA_DIG_DASH_U:* U_Let_dig

U_label        -> U_Let_dig (U_Ldh_str):?

address_literal  -> "[" ( IPv4_address_literal |
                          IPv6_address_literal |
                          General_address_literal ) "]"
                    # See Section 4.1.3

non_local_part -> Domain {%
                    function(d) {
                        return { DomainName: flat_string(d[0]) };
                    }
                  %}
                | address_literal {%
                    function(d) {
                        return { AddressLiteral: flat_string(d[0]) };
                    }
                  %}

Mailbox        -> Local_part "@" non_local_part {%
                    function(d) {
                        return { localPart: flat_string(d[0]), domainPart: flat_string(d[2]) };
                    }
                  %}

Local_part     -> Dot_string {%
                    function(d) {
                        return { DotString: flat_string(d[0]) };
                    }
                  %}
                | Quoted_string {%
                    function(d) {
                        return { QuotedString: flat_string(d[0]) };
                    }
                  %}
                # MAY be case-sensitive

Dot_string     -> Atom ("." Atom):*

# 1*atext

Atom           -> [0-9A-Za-z!#$%&'*+\-/=?^_`{|}~\u0080-\uFFFF/]:+

Quoted_string  -> DQUOTE QcontentSMTP:* DQUOTE

QcontentSMTP   -> qtextSMTP | quoted_pairSMTP

quoted_pairSMTP  -> "\\" [\x20-\x7e]
                    # i.e., backslash followed by any ASCII
                    # graphic (including itself) or SPace

qtextSMTP      -> [\x20-\x21\x23-\x5b\x5d-\x7e\u0080-\uFFFF] {% id %}
                # i.e., within a quoted string, any
                # ASCII graphic or space is permitted
                # without blackslash-quoting except
                # double-quote and the backslash itself.

## https://tools.ietf.org/html/rfc5321#section-4.1.3

IPv4_address_literal  -> Snum times_3["."  Snum]

IPv6_address_literal  -> "IPv6:"i IPv6_addr

General_address_literal  -> Standardized_tag ":" dcontent:+

Standardized_tag  -> Ldh_str
                   # Standardized_tag MUST be specified in a
                   # Standards_Track RFC and registered with IANA

dcontent       -> [\x21-\x5a\x5e-\x7e] {% id %}
                # Printable US_ASCII
                # excl. "[", "\", "]"

Snum           -> DIGIT |
                ( [1-9] DIGIT ) |
                ( "1" DIGIT DIGIT ) |
                ( "2" [0-4] DIGIT ) |
                ( "2" "5" [0-5] )
                # representing a decimal integer
                # value in the range 0 through 255

IPv6_addr      -> IPv6_full | IPv6_comp | IPv6v4_full | IPv6v4_comp

                # HEXDIG:? HEXDIG:? HEXDIG:? HEXDIG
IPv6_hex       -> HEXDIG |
                ( HEXDIG HEXDIG ) |
                ( HEXDIG HEXDIG HEXDIG ) |
                ( HEXDIG HEXDIG HEXDIG HEXDIG )

IPv6_full      -> IPv6_hex times_7[":" IPv6_hex]

IPv6_comp      -> (IPv6_hex upTo_5[":" IPv6_hex]):? "::"
                  (IPv6_hex upTo_5[":" IPv6_hex]):?
                # The "::" represents at least 2 16_bit groups of
                # zeros.  No more than 6 groups in addition to the
                # "::" may be present.

IPv6v4_full    -> IPv6_hex times_5[":" IPv6_hex] ":" IPv4_address_literal

IPv6v4_comp    -> (IPv6_hex upTo_3[":" IPv6_hex]):? "::"
                  (IPv6_hex upTo_3[":" IPv6_hex] ":"):?
                  IPv4_address_literal
                # The "::" represents at least 2 16_bit groups of
                # zeros.  No more than 4 groups in addition to the
                # "::" and IPv4_address_literal may be present.

DIGIT          -> [0-9] {% id %}

ALPHA_DIGIT_U  -> [0-9A-Za-z\u0080-\uFFFF] {% id %}

ALPHA_DIGIT    -> [0-9A-Za-z] {% id %}

ALPHA_DIG_DASH -> [-0-9A-Za-z] {% id %}

ALPHA_DIG_DASH_U -> [-0-9A-Za-z\u0080-\uFFFF] {% id %}

HEXDIG         -> [0-9A-Fa-f] {% id %}

DQUOTE         -> "\"" {% id %}