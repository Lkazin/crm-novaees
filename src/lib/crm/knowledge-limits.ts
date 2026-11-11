/** Shared by the editor and APIs; limits are characters, never visible lines. */
export const KNOWLEDGE_BODY_MAX_LENGTH = 20_000;
export const KNOWLEDGE_TITLE_MAX_LENGTH = 200;
// JSON/UTF-8 overhead must not reject valid accented text or emoji below the character limit.
export const KNOWLEDGE_REQUEST_MAX_BYTES = 128 * 1024;
