"""核对生成的虚构测试简历；忽略引擎补充的段落身份，不忽略版式或内容差异。"""
import sys
import xml.etree.ElementTree as E
from pathlib import Path
from zipfile import ZipFile

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
IDENTITY_ATTRS = {f'{{http://schemas.microsoft.com/office/word/2010/wordml}}{key}' for key in ('paraId', 'textId')}

def semantic(data):
    root = E.fromstring(data)
    def node(el):
        attrs = {k: v for k, v in el.attrib.items() if k not in IDENTITY_ATTRS}
        text = (el.text or '') if el.tag == f'{{{W}}}t' else (el.text or '').strip()
        return el.tag, attrs, text, [node(child) for child in el]
    return node(root)

original = ZipFile(Path(__file__).parent / 'fixtures/original-document.docx')
for path in sys.argv[1:]:
    current = ZipFile(path)
    assert set(original.namelist()) <= set(current.namelist()), '原部件不能丢失'
    for name in original.namelist():
        if name == 'word/document.xml':
            continue
        a, b = original.read(name), current.read(name)
        # .rels 本身也是 XML；属性顺序不影响关系目标，仍逐节点检查所有属性和内容。
        if name.endswith(('.xml', '.rels')):
            assert semantic(a) == semantic(b), f'未编辑部件改变: {name}'
        else:
            assert a == b, f'未编辑部件字节改变: {name}'
    root = E.fromstring(current.read('word/document.xml'))
    old = E.fromstring(original.read('word/document.xml'))
    assert semantic(E.tostring(root.find('.//w:tbl', NS))) == semantic(E.tostring(old.find('.//w:tbl', NS)))
    assert semantic(E.tostring(root.find('.//w:sectPr', NS))) == semantic(E.tostring(old.find('.//w:sectPr', NS)))
    assert len(root.findall('.//w:br[@w:type="page"]', NS)) == 1
    para = next(p for p in root.findall('.//w:p', NS) if 'Editable date:' in ''.join(p.itertext()))
    assert ''.join(para.itertext()) == 'Editable date: 2026-10-02'
    spacing = para.find('w:pPr/w:spacing', NS)
    assert spacing.get(f'{{{W}}}line') == '360', '单改段前段后不能清除原 1.5 倍行距'
    if Path(path).name == 'formatted.docx':
        assert spacing.get(f'{{{W}}}before') == '120'
        assert spacing.get(f'{{{W}}}after') == '160'
        formatted = next(r for r in para.findall('w:r', NS) if ''.join(r.itertext()) == '2026-10-02')
        assert formatted.find('w:rPr/w:b', NS) is not None
        assert formatted.find('w:rPr/w:spacing', NS).get(f'{{{W}}}val') == '10'
    print('PASS OOXML 保真与格式回读', path)
