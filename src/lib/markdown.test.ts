import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('escapa HTML', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
  it('títulos, negrita y listas', () => {
    expect(renderMarkdown('# Tema 1\n**Clave**: el arco\n- uno\n- dos')).toBe(
      '<h2>Tema 1</h2>\n<p><strong>Clave</strong>: el arco</p>\n<ul><li>uno</li><li>dos</li></ul>',
    );
  });
  it('enlaces seguros solamente', () => {
    expect(renderMarkdown('[a](javascript:alert(1))')).toContain('[a](javascript:alert(1))');
    expect(renderMarkdown('[web](https://claude.ai)')).toContain('<a href="https://claude.ai" target="_blank"');
  });
  it('separador y tabla', () => {
    const html = renderMarkdown('---\n| Día | Sesión |\n|---|---|\n| Lunes | Rodaje |');
    expect(html).toContain('<hr>');
    expect(html).toContain('<td>Rodaje</td>');
  });
});
