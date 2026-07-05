"""Build a PO-shaped render request for pss-pdf-service testing."""
import base64
import io
import json

from PIL import Image

# Crop the logo's transparent padding (~19% top/bottom, 12% left) so its
# visible top aligns with adjacent text.
_img = Image.open(r"C:\Dev\PSS\purchase_order\app\static\img\PSS_Standard_RGB.png").convert("RGBA")
_img = _img.crop(_img.getbbox())
_buf = io.BytesIO()
_img.save(_buf, format="PNG", optimize=True)
logo = base64.b64encode(_buf.getvalue()).decode()

certs = json.load(open(r"C:\Dev\PSS\purchase_order\app\data\certs_table.json", encoding="utf-8"))
cert_rows = "".join(
    f"<tr><td>{c.get('product','')}</td><td>{c.get('standard','')}</td><td>{c.get('documentation','')}</td></tr>"
    for c in certs
)

items = "".join(
    f"<tr><td class='c'>{i+1}</td><td>Sample line item {i+1} — 10mm mild steel plate, cut to size</td>"
    f"<td class='c'>2.00</td><td class='c'>ea</td><td class='n'>£10.50</td><td class='n'>£21.00</td></tr>"
    for i in range(28)
)

css = """
* { box-sizing: border-box; }
body { font-family: 'Montserrat', Arial, sans-serif; font-size: 9pt; color: #1a1a1a; margin: 0; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm; }
.head img { height: 92px; display: block; }
h1 { font-size: 14pt; color: rgb(6,27,55); margin: 0 0 2mm; }
.meta { font-size: 9pt; text-align: right; }
.blocks { display: flex; gap: 8mm; margin-bottom: 5mm; }
.block { flex: 1; border: 0.3mm solid #ccc; border-radius: 1mm; padding: 3mm; }
.block h2 { font-size: 8pt; text-transform: uppercase; color: #666; margin: 0 0 1.5mm; }
table.items { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
table.items th { background: rgb(6,27,55); color: #fff; font-size: 8pt; padding: 1.5mm; text-align: left; }
table.items td { border-bottom: 0.2mm solid #ddd; padding: 1.5mm; vertical-align: top; }
td.c, th.c { text-align: center; } td.n, th.n { text-align: right; }
tr.tot td { border: none; font-weight: 600; text-align: right; padding: 1mm 1.5mm; }
/* Standards section: own final page (legacy parity), bottom-anchored.
   Printable height = 297mm - 12mm top - 18mm bottom margins. */
.certs-page { break-before: page; page-break-before: always; height: 265mm;
  display: flex; flex-direction: column; justify-content: flex-start; }
table.certs { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
table.certs th { border: 0.2mm solid rgba(6,27,55,.4); background: rgb(233,242,249); color: rgb(6,27,55); padding: 1mm; text-align: left; }
table.certs td { border: 0.2mm solid rgba(6,27,55,.25); padding: 1mm; }
.certs-title { font-size: 9pt; font-weight: 600; margin: 0 0 1.5mm; color: rgb(6,27,55); }
"""

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>
<div class="head">
  <div><img src="data:image/png;base64,{logo}" alt="PSS"></div>
  <div class="meta">
    <h1>Purchase Order</h1>
    <div><strong>PO Number:</strong> 007062-0005</div>
    <div><strong>Date:</strong> 04 Jul 2026</div>
    <div><strong>Revision:</strong> 1</div>
  </div>
</div>
<div class="blocks">
  <div class="block"><h2>Supplier</h2>
    C. Roberts Steel Services Ltd.<br>Unit 4, Example Estate<br>Sample Town<br>AB1 2CD
    <br><br><strong>Ref:</strong> CLAUDE-PDF-TEST<br><strong>Delivery Date:</strong> 18 Jul 2026<br><strong>Delivery Terms:</strong> DAP
  </div>
  <div class="block"><h2>Deliver To</h2>
    PSS Power System Services<br>Main Works<br>Sample Road<br>EF3 4GH
    <br><br><strong>Contact:</strong> J. Smith<br><strong>Phone:</strong> 01234 567890
  </div>
</div>
<table class="items">
  <thead><tr><th class="c">Line</th><th>Description</th><th class="c">Qty</th><th class="c">Unit</th><th class="n">Unit Price</th><th class="n">Total</th></tr></thead>
  <tbody>{items}
    <tr class="tot"><td colspan="5">Net Total</td><td class="n">£588.00</td></tr>
    <tr class="tot"><td colspan="5">VAT</td><td class="n">£117.60</td></tr>
    <tr class="tot"><td colspan="5"><strong>Grand Total</strong></td><td class="n"><strong>£705.60</strong></td></tr>
  </tbody>
</table>
<div class="certs-page">
  <div class="certs-title">Material Certification Requirements</div>
  <table class="certs">
    <thead><tr><th>Product</th><th>Standard</th><th>Documentation</th></tr></thead>
    <tbody>{cert_rows}</tbody>
  </table>
</div>
</body></html>"""

req = {
    "html": html,
    "footer": {"left": "PO 007062 • Rev 1"},
    "page": {"format": "A4", "orientation": "portrait"},
}
with open(r"C:\tmp\render-req.json", "w", encoding="utf-8") as f:
    json.dump(req, f)
print("bytes:", len(json.dumps(req)))
