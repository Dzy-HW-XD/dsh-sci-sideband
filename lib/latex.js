function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/</g, '\\textless{}')
    .replace(/>/g, '\\textgreater{}');
}

function escapeLatex(value) {
  const source = String(value ?? '');
  const parts = source.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g);
  return parts
    .map((part) => (/^(\$|\\\(|\\\[)/.test(part) ? part : escapeText(part)))
    .join('');
}

function citationize(value) {
  return escapeLatex(value).replace(/\[(\d+(?:\s*[,，–—\-]\s*\d+)*)\]/g, (_, group) => {
    const numbers = String(group)
      .split(/[,，–—\-]/)
      .map((item) => Number(String(item).trim()))
      .filter((number) => Number.isInteger(number) && number > 0);
    return numbers.length ? `\\cite{${numbers.map((number) => `ref${number}`).join(',')}}` : `[${group}]`;
  });
}

function crossReferences(value) {
  let text = citationize(value);
  text = text.replace(/(?:图|Figure|Fig\.?)\s*(?:图|Figure|Fig\.?)\s*(\d+)/gi, (_, number) => `图~\\ref{fig:${number}}`);
  text = text.replace(/(?:表|Table)\s*(?:表|Table)\s*(\d+)/gi, (_, number) => `表~\\ref{tab:${number}}`);
  text = text.replace(/(?:图|Figure|Fig\.?)\s*(\d+)/gi, (_, number) => `图~\\ref{fig:${number}}`);
  text = text.replace(/(?:表|Table)\s*(\d+)/gi, (_, number) => `表~\\ref{tab:${number}}`);
  return text;
}

function stripLeadingLabel(value, kind) {
  const prefix = kind === 'table' ? '(?:表|Table|TABLE)' : '(?:图|Figure|FIGURE|Fig\\.?)';
  return String(value || '').replace(new RegExp(`^\\s*(?:${prefix}\\s*\\d+\\s*[:：.\\-]?\\s*)+`, 'i'), '');
}

function paragraph(value) {
  return crossReferences(value).replace(/\n{2,}/g, '\n\n');
}

function headingCommand(heading) {
  const text = String(heading || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)*)[.、\s]+(.+)$/);
  if (!match) return { command: 'section', title: text };
  const depth = match[1].split('.').length;
  return { command: depth >= 3 ? 'subsubsection' : depth === 2 ? 'subsection' : 'section', title: match[2] };
}

function branchLatex(branches, depth = 0) {
  if (!branches || !branches.length) return '';
  const rows = branches.map((branch) => {
    const title = escapeLatex(branch.title || '');
    const detail = branch.detail ? ` ${escapeLatex(branch.detail)}` : '';
    const children = branchLatex(branch.children, depth + 1);
    return `  \\item \\textbf{${title}}${detail}${children ? `\n  ${children}` : ''}`;
  });
  return `\\begin{itemize}\n${rows.join('\n')}\n\\end{itemize}`;
}

function branchInline(branches, depth = 0) {
  if (!branches || !branches.length) return [];
  const rows = [];
  for (const branch of branches) {
    rows.push(`${'\\quad'.repeat(depth + 1)}$\\bullet$ \\textbf{${escapeLatex(branch.title || '')}}${branch.detail ? `: ${escapeLatex(branch.detail)}` : ''}`);
    rows.push(...branchInline(branch.children, depth + 1));
  }
  return rows;
}

function timelineTikz(timeline) {
  const rows = Array.isArray(timeline) ? timeline : [];
  if (!rows.length) return '';
  const positions = [];
  let cursor = 0;
  for (const item of rows) {
    const branchText = branchInline(item.branches).join(' ');
    const chars = String(item.event || '').length + branchText.length;
    const step = Math.max(2.5, Math.ceil(chars / 65) * 0.55 + 1.0);
    positions.push(cursor);
    cursor -= step;
  }
  const height = Math.abs(cursor) + 0.4;
  const lines = [
    '\\begin{tikzpicture}[x=1pt,y=1pt,font=\\small]',
    `  \\draw[line width=1.5pt,draw=black!45] (0,0) -- (0,-${height * 28});`,
  ];
  rows.forEach((item, index) => {
    const y = positions[index] * 28;
    const text = [
      `\\textbf{${escapeLatex(item.year || '')} ${escapeLatex(item.label || '')}}`,
      escapeLatex(item.event || ''),
      ...branchInline(item.branches),
    ].filter(Boolean).join('\\\\[2pt]');
    lines.push(`  \\fill[black!65] (0,${y}) circle (4pt);`);
    lines.push(`  \\node[right=10pt,text width=0.78\\linewidth,align=left,inner sep=2pt] at (0,${y}) {${text}};`);
  });
  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

function tableLatex(table) {
  const columns = (Array.isArray(table.columns) ? table.columns : []).slice(0, 10);
  if (!columns.length) return '';
  const rows = (Array.isArray(table.rows) ? table.rows : []).slice(0, 40);
  const spec = columns.map(() => '>{\\raggedright\\arraybackslash}X').join('');
  const number = String(table.label || '').match(/\d+/)?.[0] || '1';
  const title = stripLeadingLabel(table.title || '', 'table').replace(/^\s*表\s*\d+[:：.\s-]*/u, '');
  const label = citationize(`${table.label || 'Table'} ${title}`.trim());
  return [
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\small',
    `  \\caption{${label}}`,
    `  \\label{tab:${number}}`,
    `  \\begin{tabularx}{\\linewidth}{${spec}}`,
    '    \\hline',
    `    ${columns.map(citationize).join(' & ')} \\\\`,
    '    \\hline',
    ...rows.map((row) => `    ${columns.map((_, index) => citationize(row[index] || '—')).join(' & ')} \\\\`),
    '    \\hline',
    '  \\end{tabularx}',
    table.caption ? `  \\par\\smallskip\\noindent{\\footnotesize ${citationize(stripLeadingLabel(table.caption, 'table'))}}` : '',
    '\\end{table}',
  ].filter(Boolean).join('\n');
}

function figureLatex(figure) {
  const number = String(figure.label || '').match(/\d+/)?.[0] || '1';
  const title = stripLeadingLabel(figure.title || '', 'figure');
  const label = citationize(`${figure.label || 'Figure'} ${title}`.trim());
  const caption = citationize(stripLeadingLabel(figure.caption || '', 'figure'));
  const takeaway = citationize(stripLeadingLabel(figure.takeaway || figure.interpretation || '', 'figure'));
  const url = String(figure.imageUrl || '');
  const local = String(figure.localFile || '');
  const visual = local
    ? `  \\includegraphics[width=\\linewidth]{${local}}`
    : url
      ? `\\begin{center}\n  \\fbox{\\parbox{0.9\\linewidth}{\\centering \\textbf{Figure URL}\\\\[2pt]\\url{${url}}}}\n\\end{center}`
      : '';
  return [
    '\\begin{figure}[htbp]',
    '  \\centering',
    visual ? `  ${visual}` : '',
    `  \\caption{${label}${caption ? `: ${caption}` : ''}}`,
    `  \\label{fig:${number}}`,
    takeaway ? `  \\par\\smallskip\\noindent{\\footnotesize ${takeaway}}` : '',
    '\\end{figure}',
  ].filter(Boolean).join('\n');
}

export function renderLatexReport(report, task = {}) {
  const title = escapeLatex(report.title || task.title || 'Research Review');
  const abstract = paragraph(report.abstract || '');
  const keywords = escapeLatex((report.keywords || []).join('; '));
  const lines = [
    '% Research Future-style manuscript generated by DSH Sci Sideband.',
    '% Template reference: https://www.overleaf.com/latex/templates/research-future-template/dqwvghptfcmj',
    '% Template author/license: Science Partner Journal Program, CC BY 4.0.',
    '\\documentclass[11pt,letterpaper]{article}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[UTF8,fontset=fandol]{ctex}',
    '\\usepackage{newtxtext}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{graphicx,booktabs,array,tabularx,amsmath,amssymb,hyperref,xcolor,enumitem,caption,titlesec,tikz}',
    '\\hypersetup{colorlinks=true,linkcolor=black,citecolor=black,urlcolor=blue}',
    '\\captionsetup{font=small,labelfont=bf}',
    '\\setlist[itemize]{leftmargin=1.4em}',
    '\\titleformat{\\section}{\\large\\bfseries}{\\thesection}{0.6em}{}',
    '\\titleformat{\\subsection}{\\normalsize\\bfseries}{\\thesubsection}{0.5em}{}',
    `\\title{${title}}`,
    `\\author{${escapeLatex(task.title || 'DSH Sci Sideband')}}`,
    '\\date{}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\begin{abstract}',
    abstract || 'No abstract was generated.',
    '\\end{abstract}',
    '',
    `\\noindent\\textbf{Keywords:} ${keywords || 'not reported'}`,
    '',
  ];

  for (const [index, section] of (report.sections || []).entries()) {
    const { command, title: sectionTitle } = headingCommand(section.heading);
    lines.push(`\\${command}{${escapeLatex(sectionTitle)}}`, '');
    for (const text of section.paragraphs || []) lines.push(paragraph(text), '');
    for (const figure of (report.figures || []).filter((item) => item.sectionIndex === index + 1)) {
      lines.push(figureLatex(figure), '');
    }
    for (const table of (report.tables || []).filter((item) => item.sectionIndex === index + 1)) {
      lines.push(tableLatex(table), '');
    }
  }

  if (report.suggestions && report.suggestions.length) {
    lines.push('\\section*{Suggestions for Future Work}', '');
    for (const item of report.suggestions) {
      lines.push(
        `\\paragraph{${escapeLatex(item.title || 'Suggestion')}}`,
        paragraph([item.proposal, item.gap ? `Gap: ${item.gap}` : '', item.minimalExecution ? `Minimal execution: ${item.minimalExecution}` : ''].filter(Boolean).join(' ')),
        '',
      );
    }
  }

  if (report.references && report.references.length) {
    lines.push('\\begin{thebibliography}{99}');
    for (const [index, reference] of report.references.entries()) {
      const cleaned = String(reference.text || '').replace(/^\s*\[\d+\]\s*/u, '');
      lines.push(`\\bibitem{ref${index + 1}} ${escapeLatex(cleaned)}`);
    }
    lines.push('\\end{thebibliography}', '');
  }

  if (report.timeline && report.timeline.length) {
    lines.push('\\appendix', '\\section*{Appendix: Timeline of the Field}', '', timelineTikz(report.timeline), '');
  }

  lines.push('\\end{document}', '');
  return lines.join('\n');
}
