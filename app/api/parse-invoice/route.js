import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a TSOT invoice data extractor. Extract ALL line items from this invoice PDF.
Some invoices have MULTIPLE items — extract each separately.

For each item extract:
- name: Full product name from Item column (include weight/variant)
- qty: Quantity number
- price: Unit Rate (₹ value in Rate column, NOT Taxable Val or Total)
- invoice_no: Invoice No number
- invoice_date: Invoice Date
- customer_name: Full name from BILLED TO
- customer_city: City from Place of Supply (before comma)
- customer_state: State from Place of Supply (after comma)
- customer_pin: PIN code from billing address
- customer_phone: Tel number
- customer_email: Email
- payment_method: Payment field value
- total_amount: The final "Total" at bottom right of the invoice
- discount_amount: Total Discount value
- tax_amount: Total Tax Amount
- shipping_amount: Total Shipping value

Return ONLY a valid JSON array with no markdown or backticks. Each element represents one line item.`;

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf' && !file.name?.endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: SYSTEM_PROMPT,
            },
          ],
        },
      ],
    });

    const raw = message.content[0]?.text?.trim() || '[]';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, '\nRaw:', raw.slice(0, 500));
      return NextResponse.json(
        { error: 'Claude returned invalid JSON', raw: raw.slice(0, 500) },
        { status: 422 }
      );
    }

    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    return NextResponse.json({ data: parsed, count: parsed.length });
  } catch (err) {
    console.error('parse-invoice error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
