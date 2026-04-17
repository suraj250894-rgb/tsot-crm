import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

    const bytes = await file.arrayBuffer();
    let binary = '';
    new Uint8Array(bytes).forEach((b) => { binary += String.fromCharCode(b); });
    const pdfBase64 = btoa(binary);

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: `Does this page contain "Invoice No:" as a new invoice header (i.e. is this the first/title page of an invoice, not a continuation page)?

Return ONLY valid JSON, no markdown, no backticks:
If yes: {"has_invoice_header":true,"invoice_no":"3602"}
If no:  {"has_invoice_header":false,"invoice_no":null}`,
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
      console.error('detect-invoice-header JSON parse error, raw:', raw.slice(0, 200));
      return NextResponse.json({ has_invoice_header: false, invoice_no: null });
    }

    return NextResponse.json({
      has_invoice_header: !!parsed.has_invoice_header,
      invoice_no: parsed.invoice_no || null,
    });
  } catch (err) {
    console.error('detect-invoice-header error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
