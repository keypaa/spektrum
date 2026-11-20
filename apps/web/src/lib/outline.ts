// Section outline extracted from the active LaTeX document.
// The line numbers are 1-based so Monaco's revealLine accepts them directly.

export interface OutlineNode {
  id: string;
  title: string;
  line: number;
  level: number;
  children: OutlineNode[];
}

const SECTION_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

const SECTION_LINE =
  /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\[[^\]]*\])?\{([^}]*)\}/;

/** Build a nested section tree from LaTeX source text. */
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  text.split("\n").forEach((line, index) => {
    const match = SECTION_LINE.exec(line);
    if (!match) return;
    const level = SECTION_LEVELS[match[1]!] ?? 2;
    const node: OutlineNode = {
      id: `l${index + 1}`,
      title: match[2]!,
      line: index + 1,
      level,
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop();
    }
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  return roots;
}
