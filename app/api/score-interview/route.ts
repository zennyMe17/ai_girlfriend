// src/app/api/score-interview/route.ts

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
// REMOVED: import Vapi from '@vapi-ai/node-sdk'; // This package does not exist

// IMPORTANT: Your API keys should be in your .env.local file
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// REMOVED: const vapi = new Vapi(process.env.VAPI_SECRET_KEY || ''); // Not needed

export async function POST(request: Request) {
  try {
    const { callId } = await request.json(); // Expecting callId from frontend

    if (!callId) {
      return NextResponse.json({ error: 'Call ID is required' }, { status: 400 });
    }

    // Ensure VAPI_SECRET_KEY is set
    const vapiSecretKey = process.env.VAPI_SECRET_KEY;
    if (!vapiSecretKey) {
      return NextResponse.json({ error: 'VAPI_SECRET_KEY is not set in environment variables.' }, { status: 500 });
    }

    // 1. Retrieve call details (including transcript) from Vapi API using direct fetch
    console.log(`Workspaceing call details for Call ID: ${callId} from Vapi API.`);
    const vapiResponse = await fetch(`https://api.vapi.ai/call/${callId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiSecretKey}`, // Authenticate with your Vapi SECRET Key
        'Content-Type': 'application/json',
      },
    });

    if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        console.error("Error fetching call details from Vapi:", errorData);
        throw new Error(`Failed to fetch call details from Vapi: ${errorData.message || vapiResponse.statusText}`);
    }

    const callDetails = await vapiResponse.json();
    console.log("Call details fetched from Vapi:", callDetails); // Log the full response for debugging

    // Extract transcript messages
    // Vapi's API typically returns a 'messages' array within the call details
    const rawMessages = callDetails.messages || [];
    const transcriptMessages = rawMessages
      .filter((msg: any) => msg.type === 'transcript' && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0)
      .map((msg: any) => `${msg.sender === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`);

    const fullTranscript = transcriptMessages.join('\n');

    if (!fullTranscript) {
      console.log("No valid transcript messages found in Vapi call details.");
      return NextResponse.json({ score: 'No valid transcript available from Vapi for scoring.' });
    }

    // 2. Define your scoring prompt
    const scoringPrompt = `
      You are an expert interviewer and evaluator. Your task is to score an interview transcript based on two main criteria:
      1.  **Accuracy:** How factual, correct, and well-supported the candidate's answers are.
      2.  **Confidentiality:** Whether the candidate avoided disclosing unnecessary sensitive personal or company information. If they discuss personal experience, ensure it is professional and relevant. If they mention past projects, ensure no proprietary or sensitive details are revealed.

      Provide a concise score from 1 to 10 (10 being excellent) for each criterion, along with a brief explanation for each score. Finally, provide an overall recommendation or qualitative feedback.

      ---
      Interview Transcript:
      ${fullTranscript}
      ---

      Please format your response clearly, like this:
      Accuracy Score (1-10): [Score]
      Accuracy Explanation: [Explanation]

      Confidentiality Score (1-10): [Score]
      Confidentiality Explanation: [Explanation]

      Overall Feedback: [Your overall assessment]
    `;

    // 3. Send transcript to OpenAI for scoring
    console.log("Sending transcript to OpenAI for scoring.");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful and fair interview evaluation AI." },
        { role: "user", content: scoringPrompt },
      ],
      temperature: 0.2,
    });

    const scoreResult = completion.choices[0].message?.content || "Could not generate score.";
    console.log("OpenAI scoring complete.");

    return NextResponse.json({ score: scoreResult });

  } catch (error: any) {
    console.error('Error in scoring API:', error);
    // Return a more descriptive error if Vapi API call fails
    if (error.message.includes('Failed to fetch call details from Vapi')) { // Catch custom Vapi fetch error
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error during scoring.' }, { status: 500 });
  }
}