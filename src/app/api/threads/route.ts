import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type ThreadRow = {
  id: string;
  room_code: string;
  asked_by: string;
  question: string;
  created_at: string;
  answered_by: string | null;
  answer_text: string | null;
  answer_type: string | null;
  answer_attachment_name: string | null;
  answer_attachment_type: string | null;
  answer_attachment_data: string | null;
  answered_at: string | null;
};

function normalizeRoomCode(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function toThread(row: ThreadRow) {
  return {
    id: row.id,
    roomCode: row.room_code,
    askedBy: row.asked_by,
    question: row.question,
    createdAt: row.created_at,
    answeredBy: row.answered_by,
    answerText: row.answer_text,
    answerType: row.answer_type,
    attachmentName: row.answer_attachment_name,
    attachmentType: row.answer_attachment_type,
    attachmentData: row.answer_attachment_data,
    answeredAt: row.answered_at,
  };
}

export async function GET(request: NextRequest) {
  const roomCode = normalizeRoomCode(request.nextUrl.searchParams.get("room") ?? "");

  if (!roomCode) {
    return NextResponse.json({ error: "A room code is required." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("question_threads")
      .select("*")
      .eq("room_code", roomCode)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ threads: (data ?? []).map(toThread) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load threads. Check your Supabase settings.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: "question" | "answer";
      roomCode?: string;
      id?: string;
      askedBy?: string;
      question?: string;
      answeredBy?: string;
      answerText?: string;
      answerType?: string;
      attachmentName?: string | null;
      attachmentType?: string | null;
      attachmentData?: string | null;
    };

    const action = body.action;
    const roomCode = normalizeRoomCode(body.roomCode ?? "");

    if (!action || !roomCode) {
      return NextResponse.json(
        { error: "Room code and action are required." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    if (action === "question") {
      const askedBy = body.askedBy?.trim();
      const question = body.question?.trim();

      if (!askedBy || !question) {
        return NextResponse.json(
          { error: "Both a name and question are required." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("question_threads")
        .insert({
          room_code: roomCode,
          asked_by: askedBy,
          question,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({ thread: toThread(data as ThreadRow) }, { status: 201 });
    }

    if (action === "answer") {
      const id = body.id?.trim();
      const answeredBy = body.answeredBy?.trim();
      const answerText = body.answerText?.trim();
      const answerType = body.answerType?.trim() ?? "text";

      if (!id || !answeredBy || (!answerText && !body.attachmentData)) {
        return NextResponse.json(
          { error: "A responder name plus text or media is required." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("question_threads")
        .update({
          answered_by: answeredBy,
          answer_text: answerText ?? null,
          answer_type: answerType,
          answer_attachment_name: body.attachmentName ?? null,
          answer_attachment_type: body.attachmentType ?? null,
          answer_attachment_data: body.attachmentData ?? null,
          answered_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("room_code", roomCode)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({ thread: toThread(data as ThreadRow) });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save this entry. Check your Supabase settings.",
      },
      { status: 500 },
    );
  }
}