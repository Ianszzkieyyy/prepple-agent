# Prepple AI: Project Context for GitHub Copilot

## 1. Overview and Purpose

Prepple AI is a web application designed to simplify and automate the HR interview process. [cite_start]It acts as an additional layer in the hiring process by using AI to conduct initial screening interviews[cite: 3, 4]. [cite_start]The platform generates a meeting link where a job seeker can join and be interviewed by Prepple's AI HR agent autonomously[cite: 5]. [cite_start]After the interview, Prepple prepares a summary report for HR managers, which includes performance metrics, tone analysis, and an evaluation of the candidate's performance[cite: 6]. [cite_start]This helps HR companies that handle hundreds or thousands of interviews efficiently filter and select potential candidates[cite: 7]. [cite_start]It also benefits job seekers by giving them an early opportunity to showcase their skills and character[cite: 8].

## 2. Objectives

- [cite_start]Streamline HR interviews using autonomous AI agents[cite: 46].
- [cite_start]Enable HR teams to generate and manage interview rooms[cite: 47].
- [cite_start]Provide structured, analytical candidate evaluations[cite: 48].
- [cite_start]Offer job seekers feedback and performance summaries[cite: 49].
- [cite_start]Support both general and technical interviews (with a code editor as a future feature)[cite: 50].

## 3. Core Features

### HR User Features

- [cite_start]**Generate Prepple Room**: Create a unique AI interview session and link[cite: 14, 53].
- **Input Job Posting and Interview Type**: Define the context for the interview. [cite_start]Two types are supported: general and technical[cite: 14, 15, 55].
- [cite_start]**AI Configuration**: Customize the AI's tone, language, or company-specific voice[cite: 16, 56].
- [cite_start]**Dashboard View**: Monitor candidate performance, view AI-generated reports, and sort candidates by score[cite: 17, 18, 19, 57].
- [cite_start]**Multiple Room Management**: Support for creating and managing several simultaneous interview sessions[cite: 20, 58].
- [cite_start]**Analytics**: View statistics, candidate trends, and performance averages[cite: 21, 59].

### Candidate Features

- [cite_start]**Join Prepple Room**: Participate in an AI-led interview via a shared link[cite: 23, 61].
- [cite_start]**AI Voice Interaction**: Interact with the AI agent using voice[cite: 24, 62].
- [cite_start]**Profile Management**: Candidates must sign in and can input their CV/Resume before an interview[cite: 12].
- [cite_start]**Performance Summary (Pro)**: View detailed feedback and insights after the interview[cite: 25, 63].
- [cite_start]**Practice Rooms (Pro)**: Conduct mock interviews to prepare[cite: 28, 64].
- [cite_start]**Interview History (Pro)**: Access past interviews and insights[cite: 27, 65].

## 4. Technology Stack

- [cite_start]**Full Stack Framework**: Next.js[cite: 32].
- [cite_start]**Backend & DB**: Supabase for Auth, Database (PostgreSQL), and Storage[cite: 33, 78].
- [cite_start]**Voice & AI Layer**: LiveKit for the voice agent layer and WebRTC, integrated with Gemini Live API for real-time conversation[cite: 34, 35, 79, 80].
- [cite_start]**Frontend Tools**: Tailwind CSS, ShadCN, and Zod for form validation[cite: 36].

## 5. Database Schema (Supabase/PostgreSQL)

### `users` table

| Column          | Type                    | Description       |
| :-------------- | :---------------------- | :---------------- |
| `id`            | UUID (PK)               | Supabase Auth UID |
| `role`          | ENUM('hr', 'candidate') | User role         |
| `name`          | TEXT                    | Full name         |
| `email`         | TEXT                    | User email        |
| `profile_image` | TEXT                    | Optional image    |
| `created_at`    | TIMESTAMP               | Auto timestamp    |

### `rooms` table

| Column           | Type                         | Description                       |
| :--------------- | :--------------------------- | :-------------------------------- |
| `id`             | UUID (PK)                    | Room identifier                   |
| `hr_id`          | UUID (FK → users.id)         | Room creator                      |
| `job_posting`    | TEXT                         | Job description                   |
| `interview_type` | ENUM('general', 'technical') | Type of interview                 |
| `ai_config`      | JSONB                        | Custom AI behavior or tone setup  |
| `room_code`      | TEXT                         | Generated meeting code            |
| `start_date`     | DATE                         | Interview availability start date |
| `end_date`       | DATE                         | Interview availability end date   |
| `created_at`     | TIMESTAMP                    | Date created                      |

### `candidates` table

| Column             | Type                                     | Description                |
| :----------------- | :--------------------------------------- | :------------------------- |
| `id`               | UUID (PK)                                | Candidate ID               |
| `user_id`          | UUID (FK → users.id)                     | Supabase user              |
| `resume_url`       | TEXT                                     | Resume file                |
| `applied_room`     | UUID (FK → rooms.id)                     | Room joined                |
| `interview_score`  | NUMERIC                                  | Overall AI-evaluated score |
| `report_url`       | TEXT                                     | Link to summary report     |
| `candidate_status` | ENUM ('pending', 'accepted', 'rejected') | Candidate status           |
| `created_at`       | TIMESTAMP                                | Auto timestamp             |

### `ai_reports` table

| Column                | Type                      | Description              |
| :-------------------- | :------------------------ | :----------------------- |
| `id`                  | UUID (PK)                 | Report ID                |
| `candidate_id`        | UUID (FK → candidates.id) | Candidate                |
| `tone_analysis`       | JSONB                     | Emotional / tone metrics |
| `performance_summary` | TEXT                      | Narrative evaluation     |
| `recommendation`      | TEXT                      | HR decision suggestion   |
| `created_at`          | TIMESTAMP                 | Generated timestamp      |

## 6. Implementation Strategy

- [cite_start]**Phase 1: MVP**: Implement user authentication, the HR dashboard for room creation, Gemini Live API integration, and report generation/storage[cite: 99, 100, 101, 102, 103, 104].
- **Phase 2: Candidate Experience**: Build the candidate dashboard, resume uploads, and Pro plan features like mock interviews and feedback. [cite_start]Improve UI with Tailwind/ShadCN[cite: 105, 106, 107, 108].
- [cite_start]**Phase 3: Advanced Features**: Add a code editor for technical interviews, HR analytics, audio/video recording, and customizable AI personas[cite: 109, 111, 112, 113, 114].
