from __future__ import annotations

import base64
import csv
import io
import re
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from .errors import NonRetryableJobError

JOB_TYPES = ["boq.parse"]

HEADER_ALIASES = {
    "code": "code", "itemcode": "code", "boqcode": "code", "item": "code", "no": "code",
    "description": "description", "itemdescription": "description", "desc": "description",
    "unit": "unit", "uom": "unit",
    "estimatedqty": "estimatedQty", "estqty": "estimatedQty", "qtyest": "estimatedQty",
    "quantityestimated": "estimatedQty", "estimatedquantity": "estimatedQty", "qty": "estimatedQty", "quantity": "estimatedQty",
    "actualqty": "actualQty", "qtyactual": "actualQty", "measuredqty": "actualQty", "actualquantity": "actualQty",
    "unitrate": "unitRate", "rate": "unitRate", "unitprice": "unitRate", "price": "unitRate",
}
REQUIRED = ["code", "description", "unit", "estimatedQty", "actualQty", "unitRate"]
MAX_ROWS = 500


def _norm_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).strip().lower())


def _parse_number(value: Any) -> float:
    if value is None:
        return float("nan")
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).replace(",", "").strip()
    if s == "":
        return float("nan")
    try:
        return float(s)
    except Exception:
        return float("nan")


def _decode_content(payload: dict[str, Any]) -> tuple[bytes, str, str]:
    filename = str(payload.get("fileName") or payload.get("filename") or "upload").strip() or "upload"
    fmt = str(payload.get("format") or "").strip().lower()
    if not fmt:
        if filename.lower().endswith(".xlsx"):
            fmt = "xlsx"
        elif filename.lower().endswith(".csv"):
            fmt = "csv"
        elif filename.lower().endswith(".txt"):
            fmt = "txt"
        else:
            fmt = "csv"

    content = payload.get("contentBase64") or payload.get("base64") or payload.get("content")
    if isinstance(content, str) and content.startswith("data:"):
        # data:*;base64,....
        try:
            content = content.split(",", 1)[1]
        except Exception:
            pass
    if isinstance(content, str):
        try:
            raw = base64.b64decode(content, validate=False)
        except Exception as e:
            raise NonRetryableJobError("Invalid base64 content", code="invalid-payload", details={"reason": str(e)})
    elif isinstance(content, (bytes, bytearray)):
        raw = bytes(content)
    else:
        raise NonRetryableJobError("boq.parse requires payload.contentBase64 (base64 string)", code="invalid-payload")
    return raw, filename, fmt


def _parse_csv(raw: bytes) -> list[list[str]]:
    text = raw.decode("utf-8-sig", errors="replace")
    # Handle common delimiters; csv module handles quotes well.
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except Exception:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    return [[str(c or "").strip() for c in row] for row in reader]


def _xlsx_shared_strings(zf: ZipFile) -> list[str]:
    name = "xl/sharedStrings.xml"
    if name not in zf.namelist():
        return []
    with zf.open(name) as f:
        root = ET.fromstring(f.read())
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    out: list[str] = []
    for si in root.findall(".//m:si", ns):
        texts = []
        for t in si.findall(".//m:t", ns):
            texts.append(t.text or "")
        out.append("".join(texts))
    # Fallback without namespace if needed
    if not out:
        for si in root.iter():
            if si.tag.endswith("}si") or si.tag == "si":
                texts = [(t.text or "") for t in si.iter() if t.tag.endswith("}t") or t.tag == "t"]
                out.append("".join(texts))
    return out


def _col_index(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref.upper())
    if not m:
        return 0
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return max(0, n - 1)


def _parse_xlsx(raw: bytes) -> list[list[str]]:
    with ZipFile(io.BytesIO(raw)) as zf:
        shared = _xlsx_shared_strings(zf)
        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in zf.namelist():
            sheets = sorted([n for n in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)])
            if not sheets:
                raise NonRetryableJobError("No worksheet found in XLSX file", code="invalid-file")
            sheet_name = sheets[0]
        with zf.open(sheet_name) as f:
            root = ET.fromstring(f.read())
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: list[list[str]] = []
    row_nodes = root.findall(".//m:sheetData/m:row", ns)
    if not row_nodes:
        row_nodes = [el for el in root.iter() if el.tag.endswith("}row")]
    for row in row_nodes:
        cells: list[str] = []
        cell_nodes = row.findall("m:c", ns)
        if not cell_nodes:
            cell_nodes = [el for el in row if el.tag.endswith("}c")]
        for c in cell_nodes:
            ref = c.attrib.get("r", "")
            t = c.attrib.get("t", "")
            idx = _col_index(ref) if ref else len(cells)
            v_node = None
            for child in c:
                if child.tag.endswith("}v"):
                    v_node = child
                    break
            is_node = None
            for child in c:
                if child.tag.endswith("}is"):
                    is_node = child
                    break
            value = ""
            if t == "inlineStr" and is_node is not None:
                texts = [(tnd.text or "") for tnd in is_node.iter() if tnd.tag.endswith("}t")]
                value = "".join(texts)
            else:
                v = (v_node.text if v_node is not None and v_node.text is not None else "")
                if t == "s":
                    try:
                        value = shared[int(v)] if v != "" else ""
                    except Exception:
                        value = ""
                elif t == "b":
                    value = "TRUE" if v == "1" else "FALSE"
                else:
                    value = v
            while len(cells) <= idx:
                cells.append("")
            cells[idx] = str(value).strip()
        rows.append(cells)
    return rows


def _normalize_rows(raw_rows: list[list[str]]) -> tuple[list[str], list[dict[str, str]]]:
    cleaned = [r for r in raw_rows if any(str(c or "").strip() for c in r)]
    if not cleaned:
        return [], []
    headers = [str(h or "").strip() for h in cleaned[0]]
    records = []
    for row in cleaned[1:]:
        rec: dict[str, str] = {}
        for i, h in enumerate(headers):
            key = h or f"Column {i+1}"
            rec[key] = str(row[i] if i < len(row) else "").strip()
        records.append(rec)
    return headers, records


def _map_headers(headers: list[str]) -> list[str | None]:
    mapped: list[str | None] = []
    for h in headers:
        mapped.append(HEADER_ALIASES.get(_norm_header(h)))
    return mapped


def _build_preview(raw_rows: list[list[str]], *, filename: str, fmt: str, warnings: list[str] | None = None) -> dict[str, Any]:
    headers, records = _normalize_rows(raw_rows)
    mapped = _map_headers(headers)
    present = {m for m in mapped if m}
    missing = [k for k in REQUIRED if k not in present]
    if missing:
        raise NonRetryableJobError(
            f"Missing required columns: {', '.join(missing)}",
            code="invalid-columns",
            details={"missing": missing, "headers": headers},
        )

    rows = []
    valid = 0
    for idx, rec in enumerate(records[:MAX_ROWS]):
        raw: dict[str, str] = {}
        data: dict[str, Any] = {}
        errors: list[str] = []
        row_warnings: list[str] = []
        for i, h in enumerate(headers):
            key = h or f"Column {i+1}"
            val = rec.get(key, "")
            raw[key] = val
            target = mapped[i] if i < len(mapped) else None
            if not target:
                continue
            if target in ("estimatedQty", "actualQty", "unitRate"):
                n = _parse_number(val)
                if n != n:  # NaN
                    errors.append(f"{target} must be a number")
                elif n < 0:
                    errors.append(f"{target} cannot be negative")
                else:
                    data[target] = n
            else:
                text = str(val).strip()
                if not text and target in ("code", "description", "unit"):
                    errors.append(f"{target} is required")
                else:
                    data[target] = text

        # unit normalization soft check
        if isinstance(data.get("unit"), str) and data["unit"]:
            data["unit"] = data["unit"].strip()

        selected = len(errors) == 0
        if selected:
            valid += 1
        rows.append({
            "rowNumber": idx + 2,
            "raw": raw,
            "data": data if data else None,
            "errors": errors,
            "warnings": row_warnings,
            "selected": selected,
        })

    total = len(rows)
    return {
        "fileName": filename,
        "format": fmt,
        "headers": headers,
        "rows": rows,
        "totalRows": total,
        "validRows": valid,
        "invalidRows": total - valid,
        "warnings": warnings or [],
    }


async def handle(job: dict[str, Any], ctx: Any) -> dict[str, Any]:
    payload = job.get("payload") or {}
    raw, filename, fmt = _decode_content(payload)
    warnings: list[str] = []

    if fmt == "xlsx":
        raw_rows = _parse_xlsx(raw)
    elif fmt == "csv":
        raw_rows = _parse_csv(raw)
    elif fmt == "txt":
        # Best-effort: try CSV sniffing on text
        raw_rows = _parse_csv(raw)
        warnings.append("TXT input parsed as delimited text; verify columns before accepting.")
    else:
        raise NonRetryableJobError(f"Unsupported BOQ format '{fmt}'. Supported: xlsx, csv, txt", code="unsupported-format")

    preview = _build_preview(raw_rows, filename=filename, fmt=fmt, warnings=warnings)
    return {"ok": True, "preview": preview}
