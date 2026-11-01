"""Запуск: python3 build_pitch.py && python3 bundle_offline.py [папка с node_modules: esbuild@0.24.0, three@0.160.0].
Делает tynys-3d.html полностью автономным: three.js и модули вшиваются в файл (esbuild), без CDN."""
import pathlib, re, subprocess, sys
HERE = pathlib.Path(__file__).resolve().parent
BUNDLE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "bundle"
src = (HERE / "tynys-pitch.html").read_text(encoding="utf-8")
m = re.search(r'<script type="module">([\s\S]*?)</script>', src)
code = m.group(1).replace("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/", "three/examples/jsm/")
(BUNDLE / "entry.mjs").write_text(code, encoding="utf-8")
subprocess.run([str(BUNDLE / "node_modules/.bin/esbuild"), "entry.mjs", "--bundle", "--format=esm", "--minify", "--legal-comments=none", "--outfile=out.js"], cwd=BUNDLE, check=True)
out = (BUNDLE / "out.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
html = src[:m.start()] + '<script type="module">' + out + "</script>" + src[m.end():]
html = re.sub(r'<script type="importmap">[\s\S]*?</script>\s*', "", html, count=1)
dst = HERE / "tynys-3d-artifact.html"
dst.write_text(html, encoding="utf-8")
print(dst.name, len(html) // 1024, "KB", "cdn left:", html.count("cdn.jsdelivr"))
local = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
         + html + "\n</body>\n</html>\n")
(HERE / "tynys-3d.html").write_text(local, encoding="utf-8")
print("tynys-3d.html", len(local) // 1024, "KB")
