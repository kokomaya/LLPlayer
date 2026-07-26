import { ParseError, type Result, err } from '@aurora/domain';
import type { SubtitleDocument } from './model.js';

export interface ParseInput {
  readonly content: string;
  /** Optional source filename, used for extension-based format detection. */
  readonly filename?: string;
}

/**
 * Port (interface) for a subtitle parser — the OCP seam. Adding a new format
 * means implementing this and registering it; the core never grows a
 * `switch (format)` branch (plan/04 · O).
 */
export interface ISubtitleParser {
  readonly id: string;
  readonly extensions: readonly string[];
  canParse(input: ParseInput): boolean;
  parse(input: ParseInput): Result<SubtitleDocument, ParseError>;
}

/** Lowercased file extension without the dot, or `undefined`. */
export const extensionOf = (filename: string | undefined): string | undefined => {
  if (!filename) {
    return undefined;
  }
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : undefined;
};

/**
 * Registry of parsers (plan/05 · subtitle). First registered parser whose
 * `canParse` returns true wins.
 */
export class ParserRegistry {
  readonly #parsers: ISubtitleParser[] = [];

  register(parser: ISubtitleParser): this {
    this.#parsers.push(parser);
    return this;
  }

  get parsers(): readonly ISubtitleParser[] {
    return this.#parsers;
  }

  find(input: ParseInput): ISubtitleParser | undefined {
    return this.#parsers.find((p) => p.canParse(input));
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const parser = this.find(input);
    if (!parser) {
      return err(
        new ParseError(
          `No registered parser can handle input${
            input.filename ? ` "${input.filename}"` : ''
          }`,
        ),
      );
    }
    return parser.parse(input);
  }
}
