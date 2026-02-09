import { GoogleGenAI } from "@google/genai";
import { Question, Course } from "../types";

// NOTE: In a real production app, API calls should be proxied through a backend.
// For this demo, we use the key directly on the client.

// System Prompt for Single-Shot Exam Generation
const GENERATE_EXAM_SYSTEM_PROMPT = `
You are a ruthless but fair Senior Technical Interviewer.
Generate a comprehensive technical assessment on the provided topic.

CRITICAL RULES:
1. Generate EXACTLY 5 questions.
2. Follow this strict difficulty curve:
   - Q1: Basic (Syntax/Definitions)
   - Q2: Medium (Common Usage)
   - Q3: Medium (Practical/Debugging)
   - Q4: Advanced (Architecture/Deep Dive)
   - Q5: Niche (Edge cases, Memory management, or System Design)
3. Return ONLY raw JSON. No markdown formatting.
4. Difficulty must be one of: "Basic", "Medium", "Advanced", "Niche".

JSON Schema:
{
  "topic": "Topic Name",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "text": "Question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"], 
      "correctIndex": 0, 
      "difficulty": "Basic",
      "explanation": "Brief explanation of why the answer is correct."
    }
  ]
}
`;

export const generateFullAssessment = async (topic: string): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash"; 
  
  const prompt = `Generate a 5-question assessment for: ${topic}.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: GENERATE_EXAM_SYSTEM_PROMPT,
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    // Safety: Ensure we have exactly 5 questions
    let questions = data.questions || [];
    if (questions.length > 5) {
      questions = questions.slice(0, 5);
    }

    // Fallback if AI fails to generate enough (rare with this prompt)
    if (questions.length === 0) throw new Error("No questions generated");

    return questions as Question[];
  } catch (error) {
    console.error("Gemini Assessment Error:", error);
    // Fallback Data
    return [
        {
            id: "fallback_1",
            type: "multiple_choice",
            text: `What is a key characteristic of ${topic}? (Fallback)`,
            options: ["Speed", "Flexibility", "Complexity", "Latency"],
            correctIndex: 0,
            difficulty: "Basic",
            topic: topic,
            explanation: "Fallback question generated due to API error."
        },
        {
            id: "fallback_2",
            type: "multiple_choice",
            text: `How do you optimize ${topic}?`,
            options: ["Caching", "Ignoring it", "Rebooting", "Deleting logs"],
            correctIndex: 0,
            difficulty: "Medium",
            topic: topic,
            explanation: "Caching is a standard optimization strategy."
        },
        {
            id: "fallback_3",
            type: "multiple_choice",
            text: `Identify the anti-pattern in ${topic}.`,
            options: ["Global State", "Pure Functions", "Immutability", "Separation of Concerns"],
            correctIndex: 0,
            difficulty: "Medium",
            topic: topic,
            explanation: "Global state misuse is a common anti-pattern."
        },
        {
            id: "fallback_4",
            type: "multiple_choice",
            text: `Advanced memory handling in ${topic}.`,
            options: ["Garbage Collection", "Manual Malloc", "Stack Overflow", "Heap Dump"],
            correctIndex: 0,
            difficulty: "Advanced",
            topic: topic,
            explanation: "Garbage collection automates memory management."
        },
        {
            id: "fallback_5",
            type: "multiple_choice",
            text: `Mastery level concept for ${topic}.`,
            options: ["Kernel Integration", "Basic Loop", "Variable Types", "Hello World"],
            correctIndex: 0,
            difficulty: "Niche",
            topic: topic,
            explanation: "Kernel integration requires deep system knowledge."
        }
    ];
  }
};

export const evaluateFreeTextAnswer = async (question: string, userAnswer: string, topic: string): Promise<{ isCorrect: boolean; feedback: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash";
  
  const prompt = `You are a Senior Technical Interviewer.
  Topic: ${topic}
  Question: "${question}"
  Candidate Answer: "${userAnswer}"
  
  Evaluate the answer for accuracy, depth, and technical correctness.
  If the answer is mostly correct but misses minor details, mark it as correct but provide feedback.
  If the answer is wrong or significantly misleading, mark it as incorrect.
  
  Return JSON:
  {
    "isCorrect": boolean,
    "feedback": "Your succinct critique here..."
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { isCorrect: false, feedback: "Error evaluating answer." };
  }
};

export const generateCurriculum = async (topic: string, weaknesses: string[]): Promise<Course> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";

  const prompt = `You are an expert Curriculum Designer.
  Create a personalized learning path for a student learning ${topic}.
  They specifically struggled with: ${weaknesses.join(', ')}.
  
  Create 5 distinct modules. Each module should target a specific weakness or advanced concept related to it.
  
  Return strictly valid JSON:
  {
    "id": "course_uuid",
    "title": "Mastering ${topic}: Gap Bridging Course",
    "modules": [
      {
        "id": "mod_1",
        "title": "Module Title",
        "description": "Short description",
        "content": "Detailed educational content in Markdown format. Include code examples.",
        "type": "text",
        "isCompleted": false
      }
    ],
    "progress": 0
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}") as Course;
  } catch (error) {
    console.error("Gemini Curriculum Error:", error);
    return {
      id: "error-course",
      title: "Error Generating Course",
      modules: [],
      progress: 0
    };
  }
};

export const validateProject = async (scenarioPrompt: string, code: string): Promise<{ passed: boolean; feedback: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview"; 

  const prompt = `You are a demanding Engineering Manager.
  Scenario: ${scenarioPrompt}
  
  Review the following code submission:
  \`\`\`
  ${code}
  \`\`\`
  
  Critique based on:
  1. Correctness (Does it solve the problem?)
  2. Performance (Big O notation?)
  3. Clean Code principles.
  
  Return strictly valid JSON:
  {
    "passed": true, // or false
    "feedback": "Detailed markdown feedback..."
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    return { passed: false, feedback: "Error validating project. Please try again." };
  }
};

export const getTutorResponse = async (history: {role: string, parts: {text: string}[]}[], message: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = "gemini-2.5-flash";
    const chat = ai.chats.create({
        model,
        history,
        config: {
            systemInstruction: "You are a helpful coding tutor. Keep answers concise and helpful."
        }
    });
    
    const result = await chat.sendMessage({ message });
    return result.text;
}

export const generateBlogImage = async (title: string, description: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash-image";
  const prompt = `Create a high-quality, abstract, 3D isometric blog header image for a tech article titled "${title}". 
  Context: ${description}. 
  Style: Minimalist, modern, professional, using a soft, high-key color palette (whites, blues, soft purples). 
  Do not include text in the image. The image should look like a premium SaaS illustration.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: prompt }]
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating blog image:", error);
    return null;
  }
};