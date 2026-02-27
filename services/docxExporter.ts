/**
 * DOCX Exporter Service
 * Chuyển đổi Markdown sang file .docx thực sự sử dụng thư viện docx
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  LevelFormat,
  ShadingType,
  PageNumber,
  Footer,
  Header,
} from 'docx';

interface ParsedElement {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'code';
  level?: number;
  content: string;
  items?: string[];
  isOrdered?: boolean;
  rows?: string[][];
}

/**
 * Chuyển đổi LaTeX commands sang Unicode symbols để hiển thị đúng trong Word
 */
function convertLatexToUnicode(latex: string): string {
  let result = latex;

  // 1. Xử lý \frac{a}{b} → a/b hoặc (a)/(b)
  result = result.replace(/\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '($1)/($2)');

  // 2. Xử lý \bar{X} → X̄ (combining overline)
  result = result.replace(/\\bar\{([^{}]+)\}/g, '$1\u0304');
  result = result.replace(/\\overline\{([^{}]+)\}/g, '$1\u0304');

  // 3. Xử lý \hat{X} → X̂
  result = result.replace(/\\hat\{([^{}]+)\}/g, '$1\u0302');

  // 4. Xử lý \tilde{X} → X̃
  result = result.replace(/\\tilde\{([^{}]+)\}/g, '$1\u0303');

  // 5. Xử lý \sqrt{x} → √x, \sqrt[n]{x} → ⁿ√x
  result = result.replace(/\\sqrt\[(\d+)\]\{([^{}]+)\}/g, (_, n, content) => {
    const superscripts: Record<string, string> = { '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', 'n': 'ⁿ' };
    return (superscripts[n] || n) + '√' + content;
  });
  result = result.replace(/\\sqrt\{([^{}]+)\}/g, '√$1');

  // 6. Xử lý superscript/subscript đơn giản
  result = result.replace(/\^(\{[^{}]+\}|\w)/g, (_, content) => {
    const clean = content.replace(/[{}]/g, '');
    const supMap: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      'n': 'ⁿ', 'i': 'ⁱ', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾'
    };
    let sup = '';
    for (const ch of clean) sup += supMap[ch] || ch;
    return sup;
  });

  result = result.replace(/_(\{[^{}]+\}|\w)/g, (_, content) => {
    const clean = content.replace(/[{}]/g, '');
    const subMap: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'o': 'ₒ', 'n': 'ₙ', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎'
    };
    let sub = '';
    for (const ch of clean) sub += subMap[ch] || ch;
    return sub;
  });

  // 7. Greek letters
  const greekMap: Record<string, string> = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε', '\\varepsilon': 'ε',
    '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
    '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'ϕ', '\\chi': 'χ',
    '\\psi': 'ψ', '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ', '\\Pi': 'Π',
    '\\Sigma': 'Σ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
  };
  for (const [cmd, sym] of Object.entries(greekMap)) {
    result = result.split(cmd).join(sym);
  }

  // 8. Math operators & symbols
  const symbolMap: Record<string, string> = {
    '\\implies': '⟹', '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
    '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
    '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈', '\\equiv': '≡',
    '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷', '\\cdot': '·',
    '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
    '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅',
    '\\forall': '∀', '\\exists': '∃', '\\neg': '¬', '\\land': '∧', '\\lor': '∨',
    '\\int': '∫', '\\iint': '∬', '\\iiint': '∭', '\\oint': '∮',
    '\\sum': '∑', '\\prod': '∏', '\\lim': 'lim',
    '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\log': 'log', '\\ln': 'ln', '\\exp': 'exp',
    '\\to': '→', '\\mapsto': '↦',
    '\\ldots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
    '\\angle': '∠', '\\triangle': '△', '\\perp': '⊥', '\\parallel': '∥',
    '\\propto': '∝', '\\sim': '∼', '\\simeq': '≃', '\\cong': '≅',
    '\\prime': '′', '\\star': '⋆', '\\circ': '∘',
    '\\quad': ' ', '\\qquad': '  ', '\\,': ' ', '\\;': ' ', '\\!': '',
    '\\left': '', '\\right': '', '\\text': '', '\\mathrm': '', '\\mathbf': '',
  };
  for (const [cmd, sym] of Object.entries(symbolMap)) {
    result = result.split(cmd).join(sym);
  }

  // 9. Clean up remaining braces and backslashes
  result = result.replace(/\{([^{}]*)\}/g, '$1'); // Remove simple braces
  result = result.replace(/\\([a-zA-Z]+)/g, '$1'); // Remove remaining unknown commands, keep text

  return result.trim();
}

/**
 * Parse inline formatting (bold, italic, LaTeX) và trả về array TextRun
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];

  // Regex để tìm LaTeX ($$...$$ block, $...$ inline), bold, italic, code
  const regex = /(\$\$)([^$]+?)\1|(\$)([^$]+?)\3|(\*\*|__)(.*?)\5|(\*|_)(.*?)\7|`([^`]+)`|([^*_$`]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // LaTeX block ($$...$$) → Giữ nguyên dạng LaTeX chuẩn
      runs.push(new TextRun({ text: '$$' + match[2].trim() + '$$', font: 'Cambria Math', italics: true, size: 26 }));
    } else if (match[4]) {
      // LaTeX inline ($...$) → Giữ nguyên dạng LaTeX chuẩn
      runs.push(new TextRun({ text: '$' + match[4].trim() + '$', font: 'Cambria Math', italics: true, size: 26 }));
    } else if (match[6]) {
      // Bold text
      runs.push(new TextRun({ text: match[6], bold: true }));
    } else if (match[8]) {
      // Italic text
      runs.push(new TextRun({ text: match[8], italics: true }));
    } else if (match[9]) {
      // Code inline
      runs.push(new TextRun({ text: match[9], font: 'Consolas', shading: { fill: 'E8E8E8' } }));
    } else if (match[10]) {
      // Normal text
      runs.push(new TextRun({ text: match[10] }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text: text }));
  }

  return runs;
}

/**
 * Parse Markdown thành các elements
 */
function parseMarkdown(markdown: string): ParsedElement[] {
  const lines = markdown.split('\n');
  const elements: ParsedElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      elements.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2]
      });
      i++;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push({ type: 'list', content: '', items, isOrdered: true });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      elements.push({ type: 'list', content: '', items, isOrdered: false });
      continue;
    }

    // Table
    if (line.includes('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i].split('|')
          .map(cell => cell.trim())
          .filter(cell => cell && !cell.match(/^[-:]+$/));
        if (row.length > 0) {
          rows.push(row);
        }
        i++;
      }
      if (rows.length > 0) {
        elements.push({ type: 'table', content: '', rows });
      }
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      let codeContent = '';
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeContent += lines[i] + '\n';
        i++;
      }
      i++; // Skip closing ```
      elements.push({ type: 'code', content: codeContent.trim() });
      continue;
    }

    // Regular paragraph
    elements.push({ type: 'paragraph', content: line });
    i++;
  }

  return elements;
}

/**
 * Chuyển đổi parsed elements thành docx children
 */
function elementsToDocxChildren(elements: ParsedElement[], numberingConfig: any[]): any[] {
  const children: any[] = [];
  let listCounter = 0;

  for (const element of elements) {
    switch (element.type) {
      case 'heading':
        const headingLevel = element.level === 1 ? HeadingLevel.HEADING_1 :
          element.level === 2 ? HeadingLevel.HEADING_2 :
            element.level === 3 ? HeadingLevel.HEADING_3 :
              HeadingLevel.HEADING_4;
        children.push(new Paragraph({
          heading: headingLevel,
          children: parseInlineFormatting(element.content),
          spacing: { before: 240, after: 120 }
        }));
        break;

      case 'paragraph':
        children.push(new Paragraph({
          children: parseInlineFormatting(element.content),
          spacing: { after: 120 },
          alignment: AlignmentType.JUSTIFIED
        }));
        break;

      case 'list':
        const refName = element.isOrdered ? `numbered-${listCounter}` : `bullet-${listCounter}`;

        // Add numbering config
        numberingConfig.push({
          reference: refName,
          levels: [{
            level: 0,
            format: element.isOrdered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: element.isOrdered ? '%1.' : '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        });

        for (const item of element.items || []) {
          children.push(new Paragraph({
            numbering: { reference: refName, level: 0 },
            children: parseInlineFormatting(item),
            spacing: { after: 60 }
          }));
        }
        listCounter++;
        break;

      case 'table':
        if (element.rows && element.rows.length > 0) {
          // Tìm số cột lớn nhất trong bảng để đảm bảo tất cả hàng đều có đủ cột
          const maxColCount = Math.max(...element.rows.map(row => row.length));
          const colWidth = Math.floor(9360 / maxColCount);
          const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
          const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

          const tableRows = element.rows.map((row, rowIndex) => {
            // Đảm bảo mỗi hàng có đủ số cột
            const normalizedRow = [...row];
            while (normalizedRow.length < maxColCount) {
              normalizedRow.push(''); // Thêm cell rỗng nếu thiếu
            }

            return new TableRow({
              tableHeader: rowIndex === 0,
              children: normalizedRow.map(cell =>
                new TableCell({
                  borders: cellBorders,
                  width: { size: colWidth, type: WidthType.DXA },
                  shading: rowIndex === 0 ? { fill: 'D5E8F0', type: ShadingType.CLEAR } : undefined,
                  children: [new Paragraph({
                    children: parseInlineFormatting(cell),
                    alignment: AlignmentType.CENTER
                  })]
                })
              )
            });
          });

          children.push(new Table({
            columnWidths: Array(maxColCount).fill(colWidth),
            rows: tableRows
          }));
        }
        break;

      case 'code':
        const codeLines = element.content.split('\n');
        for (const codeLine of codeLines) {
          children.push(new Paragraph({
            children: [new TextRun({
              text: codeLine,
              font: 'Consolas',
              size: 20 // 10pt
            })],
            shading: { fill: 'F5F5F5' },
            spacing: { after: 0 }
          }));
        }
        // Add spacing after code block
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
    }
  }

  return children;
}

/**
 * Tạo phần đầu trang SKKN (CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM, Họ tên, Đơn vị...)
 */
function generateSKKNHeader(
  headerFields: Record<string, string>,
  userInfo: { topic?: string; school?: string; location?: string; subject?: string }
): Paragraph[] {
  const headerParagraphs: Paragraph[] = [];

  // CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
  headerParagraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
    children: [new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 26, font: 'Times New Roman' })]
  }));
  headerParagraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Độc lập - Tự do - Hạnh phúc', bold: true, size: 26, font: 'Times New Roman' })]
  }));

  // Dấu gạch ngang
  headerParagraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: '─────────────────────', size: 24, font: 'Times New Roman' })]
  }));

  // Tiêu đề ĐƠN ĐỀ NGHỊ XÉT, CÔNG NHẬN SÁNG KIẾN nếu mẫu có
  const hasHeader = Object.keys(headerFields).length > 0;
  if (hasHeader) {
    headerParagraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
      children: [new TextRun({ text: 'ĐƠN ĐỀ NGHỊ XÉT, CÔNG NHẬN SÁNG KIẾN', bold: true, size: 28, font: 'Times New Roman' })]
    }));

    // Render từng trường header
    const fieldMapping: Record<string, string> = {
      hoTen: userInfo.topic ? '' : '', // Để trống cho người dùng tự điền
      tenSangKien: userInfo.topic || '',
      donViApDung: userInfo.school || '',
      diaDiem: userInfo.location || '',
      linhVuc: userInfo.subject || '',
    };

    for (const [key, label] of Object.entries(headerFields)) {
      const value = fieldMapping[key] || '..........................................................';
      headerParagraphs.push(new Paragraph({
        spacing: { after: 80 },
        indent: { left: 720 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 26, font: 'Times New Roman' }),
          new TextRun({ text: value, size: 26, font: 'Times New Roman' }),
        ]
      }));
    }

    // Dấu cách trước nội dung chính
    headerParagraphs.push(new Paragraph({ spacing: { after: 400 } }));
  }

  return headerParagraphs;
}

/**
 * Xuất Markdown sang file .docx
 */
export async function exportMarkdownToDocx(
  markdown: string,
  filename: string,
  headerFields?: Record<string, string>,
  userInfo?: { topic?: string; school?: string; location?: string; subject?: string }
): Promise<void> {
  const elements = parseMarkdown(markdown);
  const numberingConfig: any[] = [];
  const children = elementsToDocxChildren(elements, numberingConfig);

  // Tạo header SKKN nếu có headerFields
  const headerParagraphs = (headerFields && Object.keys(headerFields).length > 0 && userInfo)
    ? generateSKKNHeader(headerFields, userInfo)
    : [];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 26 }, // 13pt chuẩn SKKN VN
          paragraph: {
            spacing: { line: 360 } // Line spacing 1.5
          }
        }
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, bold: true, font: 'Times New Roman', allCaps: true }, // 14pt bold UPPERCASE
          paragraph: { spacing: { before: 360, after: 120 } }
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Times New Roman' }, // 13pt bold
          paragraph: { spacing: { before: 240, after: 100 } }
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, italics: true, font: 'Times New Roman' }, // 13pt bold italic
          paragraph: { spacing: { before: 200, after: 80 } }
        }
      ]
    },
    numbering: {
      config: numberingConfig
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1134,   // 2cm (1134 twips)
            right: 1134, // 2cm
            bottom: 1134, // 2cm
            left: 1701   // 3cm (1701 twips) - chuẩn SKKN VN
          }
        }
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 22 })
              ]
            })
          ]
        })
      },
      children: [...headerParagraphs, ...children]
    }]
  });

  // Generate blob and download
  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
