import { useState, useEffect, FC, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { Course, CourseModule, ChatMessage } from '../types';
import { getTutorResponse } from '../services/geminiService';
import { CheckCircle, PlayCircle, MessageSquare, Send } from 'lucide-react';
import { Button } from '../components/Button';
import { useTheme } from '../providers/ThemeProvider';

interface CourseProps {
    course: Course;
}

export const CourseView: FC<CourseProps> = ({ course }) => {
    const [activeModuleIndex, setActiveModuleIndex] = useState(0);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { role: 'model', text: "Hi! I'm your AI tutor for this module. Ask me anything about the content." }
    ]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const activeModule = course.modules[activeModuleIndex];

    // Reset chat when module changes
    useEffect(() => {
        setChatHistory([{ role: 'model', text: `Hi! I'm ready to help you with ${activeModule.title}.` }]);
    }, [activeModule.id]);

    const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        const userMsg: ChatMessage = { role: 'user', text: chatInput };
        setChatHistory(prev => [...prev, userMsg]);
        setChatInput("");
        setChatLoading(true);

        try {
            // Convert internal chat history to Gemini format
            const geminiHistory = chatHistory.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));
            // Add current user message to context for API
            geminiHistory.push({ role: 'user', parts: [{ text: userMsg.text }] });

            const responseText = await getTutorResponse(geminiHistory, userMsg.text);
            setChatHistory(prev => [...prev, { role: 'model', text: responseText || "I couldn't generate a response." }]);
        } catch (err) {
            setChatHistory(prev => [...prev, { role: 'model', text: "Error connecting to tutor." }]);
        } finally {
            setChatLoading(false);
        }
    };

    // Chat message markdown components
    const chatMarkdownComponents = {
        p: ({ node, ...props }: any) => <p className="mb-2 last:mb-0" {...props} />,
        strong: ({ node, ...props }: any) => <strong className="font-semibold" {...props} />,
        em: ({ node, ...props }: any) => <em className="italic" {...props} />,
        ul: ({ node, ...props }: any) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
        ol: ({ node, ...props }: any) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
        li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
        code: ({ node, inline, className, children, ...props }: any) => {
            return inline ? (
                <code className={`px-1 py-0.5 rounded text-xs font-mono ${isDark ? 'bg-gray-700 text-blue-300' : 'bg-gray-200 text-blue-600'
                    }`} {...props}>
                    {children}
                </code>
            ) : (
                <pre className={`p-2 rounded-lg overflow-x-auto my-2 text-xs ${isDark ? 'bg-gray-800 text-gray-100' : 'bg-gray-900 text-gray-100'
                    }`}>
                    <code {...props} className={className}>{children}</code>
                </pre>
            );
        },
        h1: ({ node, ...props }: any) => <h1 className="font-bold text-base mb-2" {...props} />,
        h2: ({ node, ...props }: any) => <h2 className="font-bold text-sm mb-2" {...props} />,
        h3: ({ node, ...props }: any) => <h3 className="font-semibold text-sm mb-1" {...props} />,
    };

    return (
        <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-140px)] gap-6 pb-20 lg:pb-0">
            {/* Module List & Content - 65% width */}
            <div className={`flex-1 flex flex-col rounded-2xl border shadow-soft overflow-hidden min-h-[500px] ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
                }`}>
                {/* Course Header */}
                <div className={`p-4 md:p-6 border-b flex justify-between items-center sticky top-0 z-10 ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'
                    }`}>
                    <div>
                        <h2 className={`font-serif text-lg md:text-xl font-bold truncate max-w-[200px] md:max-w-none ${isDark ? 'text-white' : 'text-gray-900'
                            }`}>{course.title}</h2>
                        <div className="flex items-center mt-1 space-x-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-800'
                                }`}>
                                Mod {activeModuleIndex + 1}
                            </span>
                            <span className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {activeModule.title}
                            </span>
                        </div>
                    </div>
                    <div className="flex space-x-2 shrink-0">
                        <button
                            disabled={activeModuleIndex === 0}
                            onClick={() => setActiveModuleIndex(p => p - 1)}
                            className={`p-2 rounded disabled:opacity-30 text-sm ${isDark ? 'hover:bg-neutral-700 text-gray-300' : 'hover:bg-gray-200 text-gray-700'
                                }`}>Prev</button>
                        <button
                            disabled={activeModuleIndex === course.modules.length - 1}
                            onClick={() => setActiveModuleIndex(p => p + 1)}
                            className={`p-2 rounded text-white disabled:opacity-30 text-sm ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-900 hover:bg-gray-800'
                                }`}>Next</button>
                    </div>
                </div>

                {/* Content Area */}
                <div className={`flex-1 overflow-y-auto p-4 md:p-8 prose max-w-none ${isDark ? 'prose-invert' : 'prose-slate'
                    }`}>
                    <ReactMarkdown
                        components={{
                            h1: ({ node, ...props }) => <h1 className={`font-serif text-2xl md:text-3xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'
                                }`} {...props} />,
                            h2: ({ node, ...props }) => <h2 className={`font-serif text-xl md:text-2xl font-semibold mt-8 mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'
                                }`} {...props} />,
                            p: ({ node, ...props }) => <p className={`leading-relaxed mb-4 text-base md:text-lg ${isDark ? 'text-gray-300' : 'text-gray-700'
                                }`} {...props} />,
                            code: ({ node, inline, className, children, ...props }: any) => {
                                return !inline ? (
                                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-6 text-sm">
                                        <code {...props} className={className}>{children}</code>
                                    </pre>
                                ) : (
                                    <code className={`px-1 py-0.5 rounded text-sm font-mono break-all ${isDark ? 'bg-neutral-700 text-red-400' : 'bg-gray-100 text-red-600'
                                        }`} {...props}>
                                        {children}
                                    </code>
                                )
                            }
                        }}
                    >
                        {activeModule.content}
                    </ReactMarkdown>
                </div>
            </div>

            {/* Interactive Tutor - 35% width - Stacked at bottom on mobile */}
            <div className={`w-full lg:w-96 flex flex-col rounded-2xl border shadow-soft overflow-hidden h-[500px] lg:h-full ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
                }`}>
                <div className={`p-4 border-b flex items-center space-x-2 ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                        }`}>
                        <MessageSquare className="h-4 w-4" />
                    </div>
                    <h3 className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>AI Module Tutor</h3>
                </div>

                <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${isDark ? 'bg-neutral-900/50' : 'bg-gray-50/50'
                    }`}>
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user'
                                    ? `rounded-br-none ${isDark ? 'bg-blue-600 text-white' : 'bg-gray-900 text-white'}`
                                    : `rounded-bl-none shadow-sm ${isDark
                                        ? 'bg-neutral-800 border border-neutral-700 text-gray-200'
                                        : 'bg-white border border-gray-200 text-gray-800'
                                    }`
                                }`}>
                                {msg.role === 'user' ? (
                                    msg.text
                                ) : (
                                    <ReactMarkdown components={chatMarkdownComponents}>
                                        {msg.text}
                                    </ReactMarkdown>
                                )}
                            </div>
                        </div>
                    ))}
                    {chatLoading && (
                        <div className="flex justify-start">
                            <div className={`px-4 py-3 rounded-2xl rounded-bl-none shadow-sm ${isDark ? 'bg-neutral-800 border border-neutral-700' : 'bg-white border border-gray-200'
                                }`}>
                                <div className="flex space-x-1">
                                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                    <div className={`w-2 h-2 rounded-full animate-bounce delay-75 ${isDark ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                    <div className={`w-2 h-2 rounded-full animate-bounce delay-150 ${isDark ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={`p-4 border-t ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}>
                    <form onSubmit={handleSendMessage} className="relative">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Ask about this topic..."
                            className={`w-full pr-10 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm ${isDark
                                    ? 'bg-neutral-700 border-neutral-600 text-white placeholder-gray-400 focus:bg-neutral-600'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 focus:bg-white'
                                }`}
                        />
                        <button
                            type="submit"
                            disabled={!chatInput.trim() || chatLoading}
                            className={`absolute right-2 top-2 p-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'text-blue-400 hover:bg-neutral-600' : 'text-blue-600 hover:bg-blue-50'
                                }`}>
                            <Send className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};