"""把预览同源的开源 WOFF2 转为可嵌入 Office 的完整字体，保留后续编辑所需字形。

运行：uv run --with 'fonttools[woff]' python scripts/build-office-fonts.py
产物入库，用户安装和应用运行不需要 Python。
"""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1] / "src-tauri/fonts"
with ZipFile(root / "office-fonts.zip", "w", compression=ZIP_DEFLATED) as archive:
    for source in sorted(root.glob("*.woff2")):
        font = TTFont(source, recalcTimestamp=False)
        if font["OS/2"].fsType != 0:
            raise ValueError(f"{source.name} 不允许无约束嵌入")
        font.flavor = None
        buffer = BytesIO()
        font.save(buffer)
        entry = ZipInfo(source.stem + ".ttf", (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, buffer.getvalue())
        print(entry.filename, len(buffer.getvalue()))
