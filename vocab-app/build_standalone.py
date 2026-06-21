# -*- coding: utf-8 -*-
"""
Bundle the modular VocabFlow app into ONE self-contained HTML file that runs by
double-click (file://) with no server. Inlines all CSS, and concatenates all JS
modules into a single classic <script> (strips import/export).
"""
import re
import os

BASE = os.path.dirname(os.path.abspath(__file__))

CSS_FILES = ["base", "theme", "components", "review", "study", "import"]
# Dependency order: a module must come after everything it references.
JS_FILES = ["utils", "speech", "phonetics", "llm", "ocr", "database", "settings",
            "study", "review", "import", "app"]


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def strip_module_syntax(src):
    out = []
    for line in src.split("\n"):
        # Drop ES-module import statements (all single-line in this project)
        if re.match(r"\s*import\b.*from\s+['\"].*['\"];?\s*$", line):
            continue
        # Turn `export const/function/class/...` into a plain declaration
        line = re.sub(r"^(\s*)export\s+(const|function|class|let|var)\b",
                      r"\1\2", line)
        out.append(line)
    return "\n".join(out)


def build():
    html = read(os.path.join(BASE, "index.html"))

    # --- Inline CSS ---
    css_blocks = []
    for name in CSS_FILES:
        css_blocks.append("/* ===== css/%s.css ===== */\n%s"
                          % (name, read(os.path.join(BASE, "css", name + ".css"))))
    combined_css = "\n".join(css_blocks)

    # Remove the individual <link rel="stylesheet" href="css/*.css"> tags
    html = re.sub(r'\s*<link rel="stylesheet" href="css/[^"]+\.css">', "", html)
    # Insert one <style> before </head>
    html = html.replace("</head>",
                        "  <style>\n%s\n  </style>\n</head>" % combined_css)

    # --- Inline JS ---
    js_blocks = []
    for name in JS_FILES:
        code = strip_module_syntax(read(os.path.join(BASE, "js", name + ".js")))
        js_blocks.append("/* ===== js/%s.js ===== */\n%s" % (name, code))
    combined_js = "\n\n".join(js_blocks)

    # Replace the module script tag with one classic inline script.
    # Use a function replacement so backslashes in the JS aren't treated as
    # regex-template escapes.
    script_tag = "<script>\n%s\n</script>" % combined_js
    html = re.sub(r'<script type="module" src="js/app\.js"></script>',
                  lambda _m: script_tag, html)

    out_path = os.path.join(os.path.dirname(BASE), "灯塔单词.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote", out_path, "(%d KB)" % (len(html.encode("utf-8")) // 1024))


if __name__ == "__main__":
    build()
