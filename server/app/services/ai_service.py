"""
AI Service for assessment, profiling, and evaluation
This can integrate with OpenAI, Anthropic, or custom AI models
"""
import os
from typing import List, Dict, Tuple
import random
import json
from dotenv import load_dotenv

load_dotenv()

# Toggle between mock and real AI
USE_MOCK_AI = os.getenv("USE_MOCK_AI", "true").lower() == "true"


class AIService:
    """
    AI Service for handling all AI-related operations
    """
    
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    
    async def generate_assessment_questions(
        self,
        track_name: str,
        difficulty: str = "medium",
        count: int = 5
    ) -> List[Dict]:
        """
        Generate dynamic assessment questions based on track and difficulty
        """
        if USE_MOCK_AI:
            return self._mock_generate_questions(track_name, difficulty, count)
        
        # TODO: Implement real AI question generation
        # Example with OpenAI:
        # response = await openai.ChatCompletion.create(...)
        return self._mock_generate_questions(track_name, difficulty, count)
    
    def _mock_generate_questions(self, track_name: str, difficulty: str, count: int) -> List[Dict]:
        """Mock question generation for testing"""
        questions = []
        for i in range(count):
            questions.append({
                "question_text": f"Question {i+1} about {track_name} ({difficulty} level)",
                "question_type": random.choice(["mcq", "logic", "open"]),
                "difficulty": difficulty
            })
        return questions
    
    async def evaluate_answer(
        self,
        question_text: str,
        user_answer: str,
        question_type: str
    ) -> Dict:
        """
        Evaluate a user's answer with comprehensive analysis
        Returns: {
            'score': float (0-1),
            'explanation': str (contains all detailed feedback)
        }
        """
        if USE_MOCK_AI:
            return self._mock_evaluate_answer_detailed(question_text, user_answer, question_type)
        
        # TODO: Implement real AI evaluation with GPT-4/Claude
        # Example structure:
        # prompt = f"""
        # Evaluate this answer comprehensively:
        # Question: {question_text}
        # Answer: {user_answer}
        # 
        # Provide detailed feedback covering:
        # 1. Overall score (0-1)
        # 2. Correctness analysis
        # 3. Depth of understanding
        # 4. Practical application knowledge
        # 5. Improvement suggestions
        # """
        return self._mock_evaluate_answer_detailed(question_text, user_answer, question_type)
    
    def _mock_evaluate_answer_detailed(self, question_text: str, user_answer: str, question_type: str) -> Dict:
        """
        Mock comprehensive answer evaluation - ALL feedback in explanation field
        """
        # Generate realistic score based on answer length and keywords
        answer_length = len(user_answer.split())
        has_examples = any(word in user_answer.lower() for word in ['example', 'for instance', 'such as', 'like'])
        has_technical_terms = len([w for w in user_answer.split() if len(w) > 8]) > 2
        
        # Calculate score
        base_score = random.uniform(0.6, 0.95)
        if answer_length < 20:
            base_score -= 0.15
        if has_examples:
            base_score += 0.05
        if has_technical_terms:
            base_score += 0.05
        
        score = max(0.3, min(1.0, base_score))
        score = round(score, 2)
        
        # Generate detailed feedback based on score
        if score >= 0.85:
            correctness = "Excellent answer! Your response demonstrates a strong grasp of the concept. The explanation is accurate and well-structured."
            depth = "You've shown deep understanding by covering multiple aspects of the topic. The level of detail indicates solid theoretical knowledge."
            practical = "Your answer includes practical insights that show real-world application experience. The examples provided are relevant and well-explained."
            suggestions = "To reach expert level, consider exploring edge cases and discussing potential trade-offs or alternative approaches."
        elif score >= 0.70:
            correctness = "Good answer overall. Your core understanding is solid, though there are minor areas that could be more precise."
            depth = "You've covered the main concepts adequately. Adding more depth to certain areas would strengthen your response."
            practical = "You demonstrate practical awareness, but including specific examples or use cases would enhance your answer."
            suggestions = "Consider elaborating on the 'why' behind the concepts. Discuss scenarios where this knowledge is particularly important."
        elif score >= 0.55:
            correctness = "Partial understanding demonstrated. Some key concepts are correct, but there are gaps in the explanation."
            depth = "Your answer touches on surface-level understanding. Diving deeper into the mechanisms would improve your response."
            practical = "Limited practical application shown. Try to connect theoretical knowledge with real-world scenarios."
            suggestions = "Review the fundamental concepts more thoroughly. Practice explaining with concrete examples. Focus on understanding the underlying principles."
        else:
            correctness = "Basic understanding shown, but significant misconceptions present. The core concept needs clarification."
            depth = "The response lacks depth and misses key components of the topic. More study is recommended."
            practical = "Practical application understanding is limited. Real-world experience or examples would help solidify the concept."
            suggestions = "Start with fundamentals. Break down the concept into smaller parts. Use tutorials and hands-on practice to build understanding."
        
        # Generate comprehensive explanation with ALL feedback in one field
        explanation = f"""**Score: {int(score * 100)}/100**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **COMPREHENSIVE EVALUATION**

Your answer has been analyzed from multiple angles:

✅ **What You Did Well:**
• {"Comprehensive coverage of the topic with clear structure" if score >= 0.8 else "You addressed the core question"}
• {"Strong use of examples and technical terminology" if has_examples and has_technical_terms else "You attempted to explain the concept"}
• {"Logical flow and detailed explanation" if answer_length > 50 else "Concise and to-the-point response"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 **CORRECTNESS ANALYSIS**
{correctness}

📚 **DEPTH OF UNDERSTANDING**
{depth}

💼 **PRACTICAL APPLICATION**
{practical}

🚀 **HOW TO IMPROVE**
{suggestions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This evaluation considers:
✓ Technical accuracy
✓ Completeness of explanation  
✓ Practical application knowledge
✓ Communication clarity
✓ Depth of understanding""".strip()
        
        return {
            'score': score,
            'explanation': explanation
        }
    
    async def analyze_skill_profile(
        self,
        responses: List[Dict],
        overall_score: float
    ) -> Dict[str, str]:
        """
        Analyze user responses to create skill profile
        """
        if USE_MOCK_AI:
            return self._mock_skill_profile(overall_score)
        
        # TODO: Implement real AI skill profiling
        return self._mock_skill_profile(overall_score)
    
    def _mock_skill_profile(self, overall_score: float) -> Dict[str, str]:
        """Mock skill profile generation"""
        if overall_score >= 80:
            return {
                "strengths": "Strong problem-solving, quick learning, analytical thinking",
                "weaknesses": "Could improve on advanced optimization techniques",
                "thinking_pattern": "Systematic and methodical approach to problems"
            }
        elif overall_score >= 60:
            return {
                "strengths": "Good foundational knowledge, eager to learn",
                "weaknesses": "Needs more practice with complex scenarios",
                "thinking_pattern": "Practical approach with room for deeper analysis"
            }
        else:
            return {
                "strengths": "Basic understanding of concepts, willing to improve",
                "weaknesses": "Requires more practice and conceptual understanding",
                "thinking_pattern": "Still developing analytical framework"
            }
    
    async def generate_learning_path(
        self,
        skill_profile: Dict,
        detected_level: str,
        track_name: str
    ) -> List[Dict]:
        """
        Generate personalized learning path based on skill profile
        """
        if USE_MOCK_AI:
            return self._mock_learning_path(detected_level, track_name)
        
        # TODO: Implement real AI learning path generation
        return self._mock_learning_path(detected_level, track_name)
    
    def _mock_learning_path(self, detected_level: str, track_name: str) -> List[Dict]:
        """Mock learning path generation"""
        if detected_level == "beginner":
            return [
                {"stage_name": "Fundamentals", "stage_order": 1, "focus_area": f"Basic concepts of {track_name}"},
                {"stage_name": "Core Skills", "stage_order": 2, "focus_area": "Essential skills and techniques"},
                {"stage_name": "Practice Projects", "stage_order": 3, "focus_area": "Hands-on application"},
            ]
        elif detected_level == "intermediate":
            return [
                {"stage_name": "Advanced Concepts", "stage_order": 1, "focus_area": f"Deep dive into {track_name}"},
                {"stage_name": "Real-world Applications", "stage_order": 2, "focus_area": "Industry-standard practices"},
                {"stage_name": "Complex Projects", "stage_order": 3, "focus_area": "End-to-end implementation"},
            ]
        else:  # advanced
            return [
                {"stage_name": "Expert Techniques", "stage_order": 1, "focus_area": "Advanced patterns and architectures"},
                {"stage_name": "System Design", "stage_order": 2, "focus_area": "Scalable solutions"},
                {"stage_name": "Leadership", "stage_order": 3, "focus_area": "Technical leadership and mentoring"},
            ]
    
    async def get_mentor_response(
        self,
        user_message: str,
        stage_context: str,
        track_name: str,
        chat_history: List[Dict] = None
    ) -> str:
        """
        Generate AI mentor response based on user query and context
        """
        if USE_MOCK_AI:
            return self._mock_mentor_response(user_message, stage_context)
        
        # TODO: Implement RAG-based mentor with real AI
        return self._mock_mentor_response(user_message, stage_context)
    
    def _mock_mentor_response(self, user_message: str, stage_context: str) -> str:
        """Mock mentor response"""
        responses = [
            f"Great question about {stage_context}! Let me explain...",
            f"I understand you're asking about {user_message[:50]}. Here's my guidance...",
            f"That's an important topic in {stage_context}. Let's break it down...",
        ]
        return random.choice(responses) + f" [Context: {stage_context}]"
    
    async def generate_evaluation_intro(self, context: Dict) -> str:
        """
        Generate personalized AI interviewer introduction with full user context
        """
        if USE_MOCK_AI:
            return self._mock_evaluation_intro(context)
        
        # TODO: Implement with real AI
        return self._mock_evaluation_intro(context)
    
    def _mock_evaluation_intro(self, context: Dict) -> str:
        """Generate context-aware introduction"""
        track = context.get("track_name", "")
        level = context.get("detected_level", "")
        score = context.get("overall_score", 0)
        completion = context.get("completion_rate", 0)
        strengths = context.get("strengths", "")
        weaknesses = context.get("weaknesses", "")
        
        intro = f"""
👋 **Welcome to your AI-Powered Skill Evaluation Interview!**

I'm your AI interviewer, and I have full context about your learning journey:

📊 **Your Journey So Far:**
• **Track:** {track}
• **Initial Assessment:** {int(score)}% ({level.title()} level)
• **Learning Path Completion:** {completion}%
• **Strengths:** {strengths[:100]}...
• **Focus Areas:** {weaknesses[:100]}...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 **What This Interview Will Cover:**
This is a conversational evaluation where I'll:
1. Test your understanding of what you've learned
2. Assess practical application skills
3. Evaluate problem-solving ability
4. Determine your job-readiness level

💬 **Format:**
- We'll have a natural conversation (10-15 messages)
- I'll ask questions based on your learning areas
- Answer naturally - explain your thinking process
- I'm evaluating depth of understanding, not just correct answers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Let's begin! **First question:**

Based on your learning in {track}, can you walk me through a real-world project where you'd apply what you've learned? Describe the architecture and key decisions you'd make.
        """.strip()
        
        return intro
    
    async def evaluate_conversation(
        self,
        dialogues: List[Dict],
        path_info: Dict
    ) -> Dict:
        """
        Evaluate user's understanding through conversation analysis
        """
        if USE_MOCK_AI:
            return self._mock_conversation_evaluation(dialogues)
        
        # TODO: Implement real conversation-based evaluation
        return self._mock_conversation_evaluation(dialogues)
    
    def _mock_conversation_evaluation(self, dialogues: List[Dict]) -> Dict:
        """Mock conversation evaluation with context"""
        # Analyze conversation depth
        user_messages = [d for d in dialogues if d.get('speaker') == 'user']
        
        # Calculate scores based on conversation quality
        avg_message_length = sum([len(msg['text'].split()) for msg in user_messages]) / len(user_messages) if user_messages else 0
        has_technical_depth = avg_message_length > 50
        has_examples = any('example' in msg['text'].lower() or 'like' in msg['text'].lower() for msg in user_messages)
        
        reasoning_score = random.uniform(70, 95)
        problem_solving = random.uniform(65, 92)
        
        # Adjust based on conversation quality
        if has_technical_depth:
            reasoning_score += 5
            problem_solving += 3
        if has_examples:
            reasoning_score += 3
            problem_solving += 5
        
        reasoning_score = min(100, reasoning_score)
        problem_solving = min(100, problem_solving)
        
        if reasoning_score >= 85 and problem_solving >= 85:
            readiness = "senior_ready"
            feedback = f"""**Exceptional Performance! 🌟**

Your evaluation interview demonstrates senior-level understanding:

✅ **Strengths Demonstrated:**
• Deep technical knowledge with clear explanations
• Strong problem-solving methodology
• Real-world application insights
• Excellent communication of complex concepts

📊 **Detailed Scores:**
• **Reasoning & Understanding:** {int(reasoning_score)}/100
• **Problem Solving:** {int(problem_solving)}/100

🎯 **Job Readiness:** Senior-Ready
You're prepared for senior-level positions. You demonstrate:
- Strategic thinking
- System design capabilities
- Leadership potential
- Mentor-level knowledge

🚀 **Next Steps:**
• Focus on system architecture at scale
• Explore leadership and mentoring opportunities
• Consider contributing to open-source projects
• Prepare for senior-level technical interviews
            """
        elif reasoning_score >= 70 and problem_solving >= 70:
            readiness = "mid"
            feedback = f"""**Strong Performance! 💪**

Your evaluation shows mid-level competency:

✅ **Strengths Demonstrated:**
• Solid understanding of core concepts
• Good practical application skills
• Clear communication ability
• Problem-solving fundamentals in place

📊 **Detailed Scores:**
• **Reasoning & Understanding:** {int(reasoning_score)}/100
• **Problem Solving:** {int(problem_solving)}/100

🎯 **Job Readiness:** Mid-Level Ready
You're prepared for mid-level developer positions. You show:
- Strong technical foundation
- Ability to work independently
- Good problem-solving approach
- Practical implementation skills

🚀 **To Reach Senior Level:**
• Deepen system design knowledge
• Focus on scalability and optimization
• Gain experience with architectural decisions
• Develop mentoring/leadership skills
            """
        else:
            readiness = "junior"
            feedback = f"""**Good Foundation! 🌱**

Your evaluation shows junior-level readiness:

✅ **Strengths Demonstrated:**
• Basic understanding of key concepts
• Willingness to learn and improve
• Can explain fundamental ideas
• Growing problem-solving skills

📊 **Detailed Scores:**
• **Reasoning & Understanding:** {int(reasoning_score)}/100
• **Problem Solving:** {int(problem_solving)}/100

🎯 **Job Readiness:** Junior-Level Ready
You're ready for entry-level positions with support. Focus areas:
- Strengthen core fundamentals
- More hands-on practice needed
- Build real projects
- Develop problem-solving strategies

🚀 **Path to Mid-Level:**
• Complete more practical projects
• Focus on code quality and best practices
• Learn debugging and troubleshooting
• Practice technical communication
• Study design patterns and architecture
            """
        
        return {
            "reasoning_score": round(reasoning_score, 2),
            "problem_solving": round(problem_solving, 2),
            "final_feedback": feedback,
            "readiness_level": readiness
        }
    
    async def search_knowledge_base(
        self,
        query: str,
        track_id: int,
        top_k: int = 3
    ) -> List[Dict]:
        """
        RAG: Search knowledge base using embeddings
        """
        if USE_MOCK_AI:
            return self._mock_knowledge_search(query)
        
        # TODO: Implement real vector search with embeddings
        return self._mock_knowledge_search(query)
    
    def _mock_knowledge_search(self, query: str) -> List[Dict]:
        """Mock knowledge base search"""
        return [
            {"content": f"Relevant information about {query} - Article 1", "source": "Documentation"},
            {"content": f"Additional context for {query} - Article 2", "source": "Tutorial"},
        ]
    
    async def generate_stage_content(
        self,
        stage_name: str,
        focus_area: str,
        difficulty_level: str,
        track_name: str,
        content_count: int = 8
    ) -> List[Dict]:
        """
        Generate learning content items for a stage
        Returns list of content items with videos, docs, exercises, etc.
        """
        if USE_MOCK_AI:
            return self._mock_generate_stage_content(
                stage_name, focus_area, difficulty_level, track_name, content_count
            )
        
        # TODO: Implement real AI content generation
        # This would:
        # 1. Use AI to search web for relevant videos (YouTube, Udemy, etc.)
        # 2. Find documentation links (MDN, official docs, etc.)
        # 3. Generate practice exercises
        # 4. Find tutorials and articles
        return self._mock_generate_stage_content(
            stage_name, focus_area, difficulty_level, track_name, content_count
        )
    
    def _mock_generate_stage_content(
        self,
        stage_name: str,
        focus_area: str,
        difficulty_level: str,
        track_name: str,
        content_count: int = 8
    ) -> List[Dict]:
        """Mock content generation with realistic structure"""
        content_items = []
        
        # Video content (2-3 videos)
        video_count = min(3, content_count // 3)
        for i in range(video_count):
            content_items.append({
                "content_type": "video",
                "title": f"{stage_name} - Tutorial Video {i+1}",
                "description": f"Comprehensive video tutorial covering {focus_area}",
                "url": f"https://youtube.com/watch?v=mock_{stage_name.replace(' ', '_')}_{i+1}",
                "difficulty_level": difficulty_level,
                "estimated_duration": random.randint(15, 45),
                "source_platform": "YouTube",
                "tags": f"{track_name}, {stage_name}, {difficulty_level}"
            })
        
        # Documentation (2 docs)
        doc_count = min(2, content_count // 4)
        for i in range(doc_count):
            content_items.append({
                "content_type": "documentation",
                "title": f"Official {stage_name} Documentation",
                "description": f"Official documentation for {focus_area}",
                "url": f"https://docs.example.com/{stage_name.replace(' ', '-').lower()}",
                "difficulty_level": difficulty_level,
                "estimated_duration": random.randint(20, 40),
                "source_platform": "Official Docs",
                "tags": f"{track_name}, documentation, reference"
            })
        
        # Articles/Tutorials (2-3 articles)
        article_count = min(3, content_count // 3)
        for i in range(article_count):
            content_items.append({
                "content_type": "article" if i % 2 == 0 else "tutorial",
                "title": f"Understanding {stage_name}: Complete Guide",
                "description": f"In-depth article about {focus_area} with examples",
                "url": f"https://medium.com/@expert/{stage_name.replace(' ', '-').lower()}-guide",
                "difficulty_level": difficulty_level,
                "estimated_duration": random.randint(10, 25),
                "source_platform": "Medium" if i % 2 == 0 else "Dev.to",
                "tags": f"{track_name}, tutorial, guide"
            })
        
        # Practice exercises (1-2 exercises)
        exercise_count = min(2, max(1, content_count - len(content_items)))
        for i in range(exercise_count):
            content_items.append({
                "content_type": "exercise",
                "title": f"{stage_name} - Practice Exercise {i+1}",
                "description": f"Hands-on exercise to practice {focus_area}",
                "content_text": f"Exercise: Implement a solution that demonstrates {focus_area}. "
                               f"Requirements: 1) {focus_area} 2) Test your solution 3) Document your approach",
                "difficulty_level": difficulty_level,
                "estimated_duration": random.randint(30, 60),
                "source_platform": "GrowWise",
                "tags": f"{track_name}, exercise, practice"
            })
        
        return content_items


# Singleton instance
ai_service = AIService()

