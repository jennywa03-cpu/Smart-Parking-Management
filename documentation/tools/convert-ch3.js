const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');

const inputPath =
  process.argv[2] ||
  path.resolve(__dirname, '..', 'Chapter_Three_Implementation.md');
const outputPath =
  process.argv[3] ||
  path.resolve(__dirname, '..', 'Chapter_Three_Implementation.docx');

const content = fs.readFileSync(inputPath, 'utf8');
const lines = content.split(/\r?\n/);

const children = [];
const addParagraph = (text) => {
  if (!text) return;
  children.push(new Paragraph(text));
};

lines.forEach((line) => {
  if (!line.trim()) {
    return;
  }
  if (line.startsWith('# ')) {
    children.push(
      new Paragraph({
        text: line.replace(/^# /, '').trim(),
        heading: HeadingLevel.HEADING_1,
      })
    );
    return;
  }
  if (line.startsWith('## ')) {
    children.push(
      new Paragraph({
        text: line.replace(/^## /, '').trim(),
        heading: HeadingLevel.HEADING_2,
      })
    );
    return;
  }
  if (line.startsWith('### ')) {
    children.push(
      new Paragraph({
        text: line.replace(/^### /, '').trim(),
        heading: HeadingLevel.HEADING_3,
      })
    );
    return;
  }
  if (line.startsWith('- ')) {
    children.push(
      new Paragraph({
        text: line.replace(/^- /, '').trim(),
        bullet: { level: 0 },
      })
    );
    return;
  }
  addParagraph(line.trim());
});

const doc = new Document({
  sections: [
    {
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  // eslint-disable-next-line no-console
  console.log(`Saved ${outputPath}`);
});
