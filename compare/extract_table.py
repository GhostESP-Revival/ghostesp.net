#!/usr/bin/env python3
"""Extract the compare.html comparison table rows to a TSV for subagent verification."""
import re
import sys

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "compare.html"
    with open(src, "r", encoding="utf-8") as fh:
        html = fh.read()

    # Pull just the tbody region of the comparison table
    m = re.search(r"<tbody>(.*?)</tbody>", html, re.S)
    if not m:
        raise SystemExit("no tbody found")
    body = m.group(1)

    row_matches = re.finditer(r"<tr[^>]*>(.*?)</tr>", body, re.S)
    current_cat = None
    idx = 0
    out = []
    for rm in row_matches:
        row = rm.group(1)
        full_tag = rm.group(0)
        is_cat = "category-row" in full_tag
        is_key = "key-row" in full_tag
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if not tds:
            continue
        if is_cat:
            # category label is in first td (colspan=5)
            label = re.sub(r"<[^>]+>", "", tds[0]).replace("&amp;", "&").strip()
            current_cat = label
            continue
        cells = []
        for td in tds:
            txt = re.sub(r"<[^>]+>", "", td)
            txt = txt.replace("&#10003;", "YES").replace("&#8212;", "NO").replace("&amp;", "&").replace("&nbsp;", " ")
            txt = re.sub(r"\s+", " ", txt).strip()
            cells.append(txt)
        # tds: Feature, GhostESP, Bruce, HaleHound, nyanBOX
        if len(cells) < 5:
            continue
        idx += 1
        out.append(f"{idx}\t{current_cat}\t{'key' if is_key else ''}\t{cells[0]}\t{cells[1]}\t{cells[2]}\t{cells[3]}\t{cells[4]}")

    print("\n".join(out))
    print(f"# TOTAL\t{idx}", file=sys.stderr)

if __name__ == "__main__":
    main()
