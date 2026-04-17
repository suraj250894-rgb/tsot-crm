import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { pdfBase64 } = await request.json();
    if (!pdfBase64) {
      return NextResponse.json({ error: 'No pdfBase64 provided' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: `This is a shipping label for a tea company. Extract the following fields:

1. invoice_no — The reference/order number, often shown as "#XXXX" or after "Invoice No:" / "Order No:" (return just the number, e.g. "3602")
2. courier_barcode — The main tracking barcode number, usually 10–13 characters like "7D128574694" or "7X114290004". It is typically printed under the largest barcode on the label.
3. tracking_number — Same as courier_barcode if only one barcode number is present.
4. courier_name — CRITICAL: Identify the ACTUAL COURIER COMPANY BRAND, not the service tier or product name.

COURIER BRAND IDENTIFICATION RULES:
- Look for the logo or brand name printed prominently on the label (top, corner, or header area). Examples: "DTDC", "BlueDart", "Delhivery", "Ekart", "Shadowfax", "Ecom Express", "XpressBees"
- IGNORE service-tier codes and product names — these are services WITHIN a courier, NOT courier names:
  * "SF", "AR", "B2C Smart Express", "B2C Priority", "Surface", "Air", "Priority", "Express" are all DTDC service tiers → return "DTDC"
  * "Blue Dart Priority", "Blue Dart Surface" → return "BlueDart"
  * "Delhivery Express" → return "Delhivery"
- DTDC labels in particular: the "DTDC" logo appears at the top-right corner even when service codes like SF or B2C Smart Express dominate the label — always return "DTDC" if the DTDC logo/brand is visible anywhere
- If and ONLY if no courier brand or logo is visible anywhere on the label, return whatever text is most prominent

Return ONLY valid JSON, no markdown, no backticks:
{"invoice_no":"3602","courier_barcode":"7D128574694","tracking_number":"7D128574694","courier_name":"DTDC"}`,
            },
          ],
        },
      ],
    });

    const raw = message.content[0]?.text?.trim() || '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('parse-labels JSON error, raw:', raw.slice(0, 300));
      return NextResponse.json(
        { error: 'Claude returned invalid JSON', raw: raw.slice(0, 300) },
        { status: 422 },
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('parse-labels error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
