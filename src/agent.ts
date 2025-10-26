import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  metrics,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as google from '@livekit/agents-plugin-google';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth'

dotenv.config({ path: '.env.local' });

interface CandidateData {
  id: string;
  resume_url: string;
  users: {
    name: string;
  }
}

interface RoomData {
  id: string;
  room_title: string;
  job_posting: string;
  interview_type: string;
  ai_instruction: string;
  ideal_length: number;
}



class Assistant extends voice.Agent {
  constructor(instructions?: string) {
    super({
      instructions: instructions ?? `You are a helpful voice AI assistant. The user is interacting with you via voice, even if you perceive the conversation as text.
      You eagerly assist users with their questions by providing information from your extensive knowledge.
      Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
      You are curious, friendly, and have a sense of humor.`,

      // To add tools, specify `tools` in the constructor.
      // Here's an example that adds a simple weather tool.
      // You also have to add `import { llm } from '@livekit/agents' and `import { z } from 'zod'` to the top of this file
      // tools: {
      //   getWeather: llm.tool({
      //     description: `Use this tool to look up current weather information in the given location.
      //
      //     If the location is not supported by the weather service, the tool will indicate this. You must tell the user the location's weather is unavailable.`,
      //     parameters: z.object({
      //       location: z
      //         .string()
      //         .describe('The location to look up weather information for (e.g. city name)'),
      //     }),
      //     execute: async ({ location }) => {
      //       console.log(`Looking up weather for ${location}`);
      //
      //       return 'sunny with a temperature of 70 degrees.';
      //     },
      //   }),
      // },


    });
  }

}

async function parseResume(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch resume from ${url}: ${response.statusText}`);
      return '';
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') ?? ''
    const pathname = new URL(url).pathname.toLowerCase()
    const isPdf = pathname.endsWith('.pdf') || contentType.includes('pdf');
    const isDocx =
      pathname.endsWith('.docx') ||
      contentType.includes('wordprocessingml.document') ||
      contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    if (isPdf) {
      const data = await new PDFParse({ data: buffer })
      const result = await data.getText();
      console.log('Parsed PDF text:', result.text);
      return result.text

    } else if (isDocx) {
      const { value } = await mammoth.extractRawText({ buffer });
      console.log('Parsed DOCX text:', value);
      return value

    } else {
      console.warn('Unsupported resume file type:', url);
      return ''
    }
  } catch (error) {
    console.error('Error parsing resume:', error);
    return ''
  }
}

async function sendInterviewTranscript(
  roomId: string,
  candidateId: string,
  parsedResume: string,
  sessionHistory: any,
  usageMetrics: any,
): Promise<void> {
  try {
    const apiUrl = process.env.NEXT_APP_API_URL || 'http://localhost:3000';

    const response = await fetch(`${apiUrl}/api/interview-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.AGENT_API_KEY || '',
      },
      body: JSON.stringify({
        roomId,
        candidateId,
        sessionHistory,
        parsedResume,
        usageMetrics,
        timestamp: new Date().toISOString(),
      })
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Failed to send interview history:', errorData);
      throw new Error(`API responded with status ${response.status}`);
    }

    const result = await response.json();
    console.log('Interview history sent successfully:', result);
  } catch (error) {
    console.error('Error sending interview transcript:', error);
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    // Set up a voice AI pipeline using OpenAI, Cartesia, AssemblyAI, and the LiveKit turn detector
    let instructions = `You are a helpful voice AI assistant. The user is interacting with you via voice. Your responses are concise and to the point.`;
    let roomData: RoomData;
    let candidateData: CandidateData;
    let resumeText: string = '';
    if (ctx.job.metadata) {
      try {
        const metadata = JSON.parse(ctx.job.metadata);
        roomData = metadata.room;
        candidateData = metadata.candidate;
        resumeText = await parseResume(candidateData.resume_url);

        instructions = `
          You are an expert HR assistant named Prepple conducting an initial screening interview.
          The candidate's name is ${candidateData.users.name}.
          The interview is for a ${roomData.room_title} role.
          The job posting is as follows: 

          JOB POSTING:
          ${roomData.job_posting}

          CANDIDATE'S RESUME:
          ${resumeText || 'No resume text available.'}

          Your goal is to assess the candidate's suitability for this role based on their resume and the job description.
          Ask questions related to their experience listed on the resume.
          Keep your responses professional, concise, and friendly. 
          Speak naturally as if in a voice conversation - avoid complex formatting, asterisks, or emojis.
          The ideal length of this interview is approximately ${roomData.ideal_length} minutes.
          Begin the interview by introducing yourself and asking the first question.
        `

        console.log('Job metadata processed for instructions.');
      } catch (e) {
        console.error('Error processing job metadata:', e);
      }
    }

    const session = new voice.AgentSession({
       llm: new google.beta.realtime.RealtimeModel({
          model: "gemini-2.0-flash-exp",
          voice: "Puck",
          temperature: 0.8,
          instructions: instructions,
       }),
    });

    const assistant = new Assistant(instructions);
    
    // To use a realtime model instead of a voice pipeline, use the following session setup instead.
    // (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    // 1. Install '@livekit/agents-plugin-openai'
    // 2. Set OPENAI_API_KEY in .env.local
    // 3. Add import `import * as openai from '@livekit/agents-plugin-openai'` to the top of this file
    // 4. Use the following session setup instead of the version above
    // const session = new voice.AgentSession({
    //   llm: new openai.realtime.RealtimeModel({ voice: 'marin' }),
    // });

    // Metrics collection, to measure pipeline performance
    // For more information, see https://docs.livekit.io/agents/build/metrics/
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });

    const logUsage = async () => {
      const summary = usageCollector.getSummary();
      console.log(`Usage: ${JSON.stringify(summary)}`);
    };


    ctx.addShutdownCallback(async () => {
      await sendInterviewTranscript(
        roomData.id,
        candidateData.id,
        resumeText,
        session.history.toJSON(),
        usageCollector.getSummary(),
      )
      await logUsage();
    });

    // Start the session, which initializes the voice pipeline and warms up the models
    await session.start({
      agent: assistant,
      room: ctx.room,
      inputOptions: {
        // LiveKit Cloud enhanced noise cancellation
        // - If self-hosting, omit this parameter
        // - For telephony applications, use `BackgroundVoiceCancellationTelephony` for best results
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    // Join the room and connect to the user
    await ctx.connect();

    
    const handle = session.generateReply({
      instructions: 'Greet the user and offer your assistance. Introduce yourself as Prepple, the AI interview assistant.',
    });
    await handle.waitForPlayout();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
