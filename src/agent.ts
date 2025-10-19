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
import { GoogleGenAI } from '@google/genai';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth'

dotenv.config({ path: '.env.local' });

interface CandidateData {
  resume_url: string;
  users: {
    name: string;
  }
}

interface RoomData {
  room_title: string;
  job_posting: string;
  interview_type: string;
  ai_instruction: string;
  ideal_length: number;
}

interface TranscriptEntry {
  speaker: 'agent' | 'candidate';
  text: string;
  timestamp: number;
}

class Assistant extends voice.Agent {
  private transcript: TranscriptEntry[] = []
  private startTime: number = Date.now();

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

  trackMessage(speaker: 'agent' | 'candidate', text: string) {
    this.transcript.push({
      speaker,
      text,
      timestamp: Date.now() - this.startTime,
    });
  }

  getTranscript() {
    return this.transcript
  }

  getInterviewDuration() {
    return Math.floor((Date.now() - this.startTime) / 1000 / 60);
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

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

async function generateFinalReport(
  transcript: TranscriptEntry[],
  roomData: RoomData,
  candidateData: CandidateData,
  resumeText: string,
  duration: number,
) {
  try {
    const transcriptText = transcript
      .map((t) => `${t.speaker}: ${t.text}`)
      .join('\n');
    
    const prompt = `You are an expert HR analyst evaluating an interview for Prepple AI, a platform that automates initial HR screening interviews.
      JOB POSTING:
      ${roomData.job_posting}

      CANDIDATE NAME: ${candidateData.users.name}
      POSITION: ${roomData.room_title}
      INTERVIEW TYPE: ${roomData.interview_type}
      INTERVIEW DURATION: ${duration} minutes
      IDEAL DURATION: ${roomData.ideal_length} minutes

      CANDIDATE'S RESUME:
      ${resumeText || 'Resume not available'}

      INTERVIEW TRANSCRIPT:
      ${transcriptText}

      Generate a comprehensive JSON report with the following structure:
      {
        "tone_analysis": {
          "confidence_level": <0-100>,
          "communication_clarity": <0-100>,
          "enthusiasm": <0-100>,
          "professionalism": <0-100>
        },
        "performance_summary": "<2-3 paragraph narrative evaluation covering key strengths, areas of concern, and fit for the role>",
        "recommendation": "<one of: strongly_recommend, recommend, neutral, not_recommend>",
        "interview_score": <0-100>,
        "key_highlights": ["<highlight 1>", "<highlight 2>", "<highlight 3>"],
        "areas_for_improvement": ["<area 1>", "<area 2>", "<area 3>"]
      }

      Evaluation Criteria:
      - Relevance of candidate's responses to the job requirements
      - Technical competency (especially for technical interviews)
      - Communication skills and clarity
      - Cultural fit indicators
      - Professional demeanor and enthusiasm
      - Time management (interview duration vs. ideal length)
      - Alignment between resume experience and interview responses

      Respond ONLY with valid JSON.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            tone_analysis: {
              type: 'object',
              properties: {
                confidence_level: {
                  type: 'number',
                  description: 'Candidate confidence level from 0-100'
                },
                communication_clarity: {
                  type: 'number',
                  description: 'Communication clarity score from 0-100'
                },
                enthusiasm: {
                  type: 'number',
                  description: 'Enthusiasm level from 0-100'
                },
                professionalism: {
                  type: 'number',
                  description: 'Professionalism score from 0-100'
                }
              },
              required: ['confidence_level', 'communication_clarity', 'enthusiasm', 'professionalism']
            },
            performance_summary: {
              type: 'string',
              description: '2-3 paragraph narrative evaluation of candidate performance'
            },
            recommendation: {
              type: 'string',
              enum: ['strongly_recommend', 'recommend', 'neutral', 'not_recommend'],
              description: 'HR hiring recommendation'
            },
            interview_score: {
              type: 'number',
              description: 'Overall interview score from 0-100'
            },
            key_highlights: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Key positive highlights from the interview'
            },
            areas_for_improvement: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Areas where candidate can improve'
            }
          },
          required: [
            'tone_analysis',
            'performance_summary',
            'recommendation',
            'interview_score',
            'key_highlights',
            'areas_for_improvement'
          ],
        },
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        
      }
    })
    const reportText = await response.text ?? ''
    const reportData = JSON.parse(reportText)
    return reportData
  } catch (e) {
    console.error('❌ Error generating final report:', e)
    throw e
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

    // Generate final report on shutdown

    const generateReport = async () => {
      try {
        const transcript = assistant.getTranscript();
        const duration = assistant.getInterviewDuration();

        if (transcript.length === 0) {
          console.warn('No transcript data available for report generation.');
          return;
        }

        const reportData = await generateFinalReport(
          transcript,
          roomData!,
          candidateData!,
          resumeText,
          duration,
        );

        console.log('✅ Final report generated:', reportData);
        console.log(`Score: ${reportData.interview_score} \nRecommendation: ${reportData.recommendation}`);

      } catch (error) {
        console.error('Error generating final report:', error);
      }


    }

    ctx.addShutdownCallback(async () => {
      await generateReport()
      await logUsage()
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
