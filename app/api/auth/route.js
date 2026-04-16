import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { password } = await request.json();

    if (!process.env.CRM_ACCESS_PASSWORD) {
      return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
    }

    if (password !== process.env.CRM_ACCESS_PASSWORD) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('crm_auth', 'valid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
