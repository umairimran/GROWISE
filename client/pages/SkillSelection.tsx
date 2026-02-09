import { useState, FC, FormEvent } from 'react';
import { Button } from '../components/Button';
import { ArrowLeft, Code2, Database, Globe, Server, Cpu, Terminal, Sparkles } from 'lucide-react';

interface SkillSelectionProps {
  onSelect: (topic: string) => void;
  onBack: () => void;
  onSkip: () => void;
}

const skills = [
  { id: 'react', name: 'React & Ecosystem', icon: Code2 },
  { id: 'python', name: 'Python & Data', icon: Terminal },
  { id: 'node', name: 'Node.js Backend', icon: Server },
  { id: 'rust', name: 'Rust Systems', icon: Cpu },
  { id: 'sql', name: 'SQL & Database', icon: Database },
  { id: 'web3', name: 'Web3 & Solidity', icon: Globe },
];

export const SkillSelection: FC<SkillSelectionProps> = ({ onSelect, onBack, onSkip }) => {
  const [customTopic, setCustomTopic] = useState('');

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (customTopic.trim()) {
      onSelect(customTopic.trim());
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-sans pt-20">
      <div className="w-full max-w-4xl">
        <div className="flex justify-between items-center mb-8">
            <button 
                onClick={onBack}
                className="flex items-center text-gray-500 hover:text-contrast transition-colors group text-sm font-medium"
            >
                <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                Back to Home
            </button>
            <button 
                onClick={onSkip}
                className="text-sm font-medium text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors border border-transparent hover:border-gray-200 rounded-lg px-3 py-1.5"
            >
                Skip Onboarding →
            </button>
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold text-contrast mb-4 opacity-0 animate-fade-in-up delay-100">
            Select Your Arena
        </h1>
        <p className="text-xl text-gray-500 mb-12 max-w-2xl opacity-0 animate-fade-in-up delay-200">
            Choose a preset technology track or define your own niche. The AI will adapt the assessment to your choice.
        </p>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {skills.map((skill, index) => {
                const Icon = skill.icon;
                return (
                    <button
                        key={skill.id}
                        onClick={() => onSelect(skill.name)}
                        className="flex flex-col items-start p-6 bg-surface border border-border rounded-xl hover:border-accent hover:shadow-lg hover:shadow-accent/5 transition-all text-left group opacity-0 animate-fade-in-up"
                        style={{ animationDelay: `${(index + 3) * 100}ms` }}
                    >
                        <div className="h-12 w-12 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-blue-50 transition-colors duration-300">
                            <Icon className="h-6 w-6 text-gray-600 group-hover:text-accent transition-colors duration-300 transform group-hover:scale-110" />
                        </div>
                        <h3 className="font-display text-lg font-bold text-contrast group-hover:text-accent transition-colors duration-300">{skill.name}</h3>
                        <p className="text-sm text-gray-500 mt-2">Comprehensive assessment ranging from basics to architectural patterns.</p>
                    </button>
                )
            })}
        </div>

        {/* Custom Input */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-soft opacity-0 animate-fade-in-up delay-700 hover:shadow-md transition-shadow">
             <div className="flex items-start space-x-4">
                 <div className="h-12 w-12 rounded-full bg-contrast text-white flex items-center justify-center flex-shrink-0">
                     <Sparkles className="h-6 w-6" />
                 </div>
                 <div className="flex-1">
                     <h3 className="font-display text-xl font-bold text-contrast mb-2">Assessment on a custom topic?</h3>
                     <p className="text-gray-500 mb-6">Enter any technical subject (e.g., "Kubernetes Security", "Go Concurrency", "System Design").</p>
                     
                     <form onSubmit={handleCustomSubmit} className="flex gap-4">
                         <input 
                            type="text" 
                            value={customTopic}
                            onChange={(e) => setCustomTopic(e.target.value)}
                            placeholder="Type a topic..."
                            className="flex-1 bg-background border border-border rounded-lg px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all"
                         />
                         <Button type="submit" disabled={!customTopic.trim()}>
                            Start Assessment
                         </Button>
                     </form>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );
};