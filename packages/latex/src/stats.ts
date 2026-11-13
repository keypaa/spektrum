import type { ProjectStats } from "@spektrum/shared";

const num = (output: string, re: RegExp): number => {
  const m = re.exec(output);
  return m ? Number(m[1]) : 0;
};

/** Parse `texcount -total -merge -q` output and count figures across sources. */
export function parseTexcount(output: string, sources: string[]): ProjectStats {
  const wordsInText = num(output, /Words in text:\s*(\d+)/);
  const wordsInHeaders = num(output, /Words in headers:\s*(\d+)/);
  const wordsOutsideText = num(
    output,
    /Words outside text \(captions, etc\.\):\s*(\d+)/,
  );
  const headers = num(output, /Number of headers:\s*(\d+)/);
  const mathInline = num(output, /Number of math inlines:\s*(\d+)/);
  const mathDisplay = num(output, /Number of math displayed:\s*(\d+)/);

  const figures = sources.reduce(
    (count, source) =>
      count + (source.match(/\\begin\{figure\*?\}/g)?.length ?? 0),
    0,
  );

  return {
    words: wordsInText + wordsInHeaders + wordsOutsideText,
    wordsInText,
    wordsInHeaders,
    wordsOutsideText,
    headers,
    figures,
    mathInline,
    mathDisplay,
  };
}