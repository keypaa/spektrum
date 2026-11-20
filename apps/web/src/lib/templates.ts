// The two project templates.
//
// Sources: zenno/recon/extracted/blank-main.tex (spec §7.6) and
// zenno/recon/extracted/example-main.tex (the captured "What is Prism?"
// document from screenshot 18). The blank template is a verbatim copy. The
// example keeps the same structure but uses Spektrum branding.
//
// The example document quotes its sample prompts with LaTeX double backticks.
// A backtick cannot appear inside a template literal, so the string is joined
// from chunks with BT2 ("``") between them; the templates tests check the
// structure and the rebranded copy.
//
// No interpolation: these are plain strings with a trailing newline.

/** Two LaTeX backticks (``), used as an opening quote in the example text. */
const BT2 = String.fromCharCode(96, 96);

export const BLANK_MAIN_TEX = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}

% Core packages
\usepackage{amsmath,amssymb}
\usepackage{tikz-cd}
\usepackage{multicol}

% Paragraphs
\setlength{\parindent}{0pt}
\setlength{\parskip}{1\baselineskip}

\title{Untitled}
\author{Author Name}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}

\end{document}
`;

export const EXAMPLE_MAIN_TEX = [
  String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}

% Math and figures
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{tikz-cd}
\usepackage{multicol}

% Paragraphs
\setlength{\parindent}{0pt}
\setlength{\parskip}{1\baselineskip}

\begin{document}
\pagestyle{empty}

\section*{What is Spektrum?}

\textbf{Spektrum} is an AI-powered \LaTeX{} editor for writing scientific documents. It supports real-time collaboration with coauthors and includes AI-powered assistance that can help you draft and edit text, reason through ideas, and handle formatting.

\section*{Features}

\begin{multicols}{2}
Spektrum includes an AI assistant directly in the editor and can access your project, so you can ask it to do things like:

`,
  BT2,
  String.raw`Add the equation for the Laplace transform of $t\cos(at)$ to the introduction.''
\[
  \mathcal{L}\left\{ t \cos(a t) \right\} = \frac{ s^2 - a^2 }{ (s^2 + a^2)^2 }
\]

`,
  BT2,
  String.raw`Add a 4-by-4 table'' to the summary section.
\begin{center}
\begin{tabular}{|c|c|c|c|}
  \hline
  1 & 2 & 3 & 4 \\
  \hline
  5 & 6 & 7 & 8 \\
  \hline
  9 & 10 & 11 & 12 \\
  \hline
  13 & 14 & 15 & 16 \\
  \hline
\end{tabular}
\end{center}

`,
  BT2,
  String.raw`Proofread this section and highlight any errors or gaps in logic, and also make suggestions for how I can improve the clarity of the section.''

`,
  BT2,
  String.raw`Are there any corollaries or follow-on implications of Theorem 3.1 that I've missed? Are all the bounds tight, or can some be relaxed?''

`,
  BT2,
  String.raw`Write an abstract based on the rest of the paper''

`,
  BT2,
  String.raw`Add a bibliography to my paper, and suggest related work I may have missed.''

`,
  BT2,
  String.raw`Generate this hand-drawn diagram in \LaTeX{}.''
\begin{center}
  \begin{minipage}[t]{0.48\linewidth}
    \vspace{0pt}
    \centering
    \includegraphics[width=\linewidth]{diagram.jpg}
  \end{minipage}\hfill
  \begin{minipage}[t]{0.48\linewidth}
    \vspace{0pt}
    \centering
    \[
      \begin{tikzcd}[row sep=2em, column sep=2em]
        E
          \arrow[dr, "e"']
          \arrow[drr, "p_2"]
          \arrow[ddr, "p_1"']
        & & \\
        & A \times B \arrow[r, "\pi_2"'] \arrow[d, "\pi_1"] & B \arrow[d, "g"] \\
        & A \arrow[r, "f"'] & C
      \end{tikzcd}
    \]
  \end{minipage}
\end{center}

`,
  BT2,
  String.raw`Add any missing dependencies across my project.''

`,
  BT2,
  String.raw`Read my paper and generate a 200 word summary for a popular audience, in German.''
\end{multicols}

\section*{Collaboration}

Invite collaborators by clicking the `,
  BT2,
  String.raw`Share'' menu. As you edit, they will see your updates in real time. You can also leave comments by highlighting text and selecting "Leave a comment."

\end{document}
`,
].join("");
