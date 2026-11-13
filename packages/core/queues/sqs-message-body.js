// SQS accepts only #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
// [#x10000-#x10FFFF] and rejects the whole message otherwise
// (InvalidMessageContents). JSON.stringify already escapes control characters
// and lone surrogates, but leaves U+FFFE and U+FFFF raw. Those can only occur
// inside JSON strings, so a \uXXXX escape keeps the JSON valid and JSON.parse
// returns the original message exactly.
const SQS_DISALLOWED_CHARACTERS =
    /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

const toSqsMessageBody = (message) =>
    JSON.stringify(message).replace(
        SQS_DISALLOWED_CHARACTERS,
        (character) =>
            `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );

module.exports = { toSqsMessageBody };
