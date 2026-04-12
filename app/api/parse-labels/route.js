import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { imageBase64 } = await request.json();
    if (!imageBase64) {
      return NextResponse.json({ error: 'No imageBase64 provided' }, { status: 400 });
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
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `This is a shipping label for a tea company. Extract these fields:
1. invoice_no: The number after "Invoice No:" or "Order No:" (just the number, e.g. "3602")
2. courier_barcode: The 11-digit number displayed UNDER the large barcode at the TOP of the label. This is a number like "77752841386". It is NOT the tracking number.
3. tracking_number: The alphanumeric courier tracking ID near the BOTTOM of the label, like "510890JP0236365"
4. courier_name: The courier company name (e.g. "BLUEDART", "DELHIVERY", "DTDC")

IMPORTANT: The courier_barcode is the 11-digit number at the TOP of the label under the first/largest barcode. Do NOT confuse it with the order number barcode in the middle or the tracking number at the bottom.

Return ONLY valid JSON, no markdown, no backticks:
{"invoice_no":"3602","courier_barcode":"77752841386","tracking_number":"510890JP0236365","courier_name":"BLUEDART"}`,
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
