import { useState, FC } from 'react';
import { validateProject } from '../services/geminiService';
import { Button } from '../components/Button';
import { Play, CheckCircle, AlertTriangle, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export const Validator: FC = () => {
  const [scenario] = useState("We have a CSV export of 1M rows of transaction data. I need a Python function that efficiently calculates the rolling average of transaction 'amount' over a window of 3. The data is currently a list of dictionaries. Optimize for memory.");
  const [code, setCode] = useState("def calculate_rolling_average(data):\n    # Write your solution here\n    pass");
  const [result, setResult] = useState<{ passed: boolean; feedback: string } | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    setValidating(true);
    setResult(null);
    try {
      const response = await validateProject(scenario, code);
      setResult(response);
    } catch (e) {
      console.error(e);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="h-auto lg:h-[calc(100vh-140px)] flex flex-col gap-6 pb-20 lg:pb-0">
      <header className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
           <h1 className="font-serif text-2xl font-bold text-contrast">Real-World Validator</h1>
           <p className="text-gray-500">The Boss Fight. Can you satisfy the Senior Dev?</p>
        </div>
        <div className="flex space-x-3 w-full sm:w-auto">
             <Button variant="outline" onClick={() => setCode("")} className="flex-1 sm:flex-none">Reset</Button>
             <Button onClick={handleSubmit} isLoading={validating} disabled={validating} className="flex-1 sm:flex-none">
                <Play className="h-4 w-4 mr-2" /> Submit Solution
             </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Left: Scenario & IDE */}
        <div className="flex flex-col space-y-4 h-[600px] lg:h-full">
            {/* Scenario Card */}
            <div className="bg-gray-900 text-gray-200 p-6 rounded-xl border border-gray-700 shadow-soft">
                <div className="flex items-center space-x-2 mb-2 text-yellow-500 text-xs font-mono uppercase tracking-widest">
                    <Terminal className="h-3 w-3" />
                    <span>Incoming Request from Engineering Manager</span>
                </div>
                <p className="font-mono text-sm leading-relaxed text-white">
                    "{scenario}"
                </p>
            </div>

            {/* Code Editor (Simple Textarea for Demo) */}
            <div className="flex-1 bg-surface rounded-xl border border-border shadow-soft flex flex-col overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-border text-xs font-mono text-gray-500">
                    solution.py
                </div>
                <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="flex-1 w-full p-4 font-mono text-sm bg-white focus:outline-none resize-none"
                    spellCheck={false}
                />
            </div>
        </div>

        {/* Right: Feedback Area */}
        <div className="flex flex-col h-[500px] lg:h-full bg-surface rounded-xl border border-border shadow-soft overflow-hidden">
             <div className="bg-gray-50 px-6 py-4 border-b border-border font-medium text-gray-700">
                 Code Review Report
             </div>
             
             <div className="flex-1 p-6 overflow-y-auto">
                 {!result && !validating && (
                     <div className="h-full flex flex-col items-center justify-center text-gray-400">
                         <div className="p-4 bg-gray-50 rounded-full mb-4">
                             <Terminal className="h-8 w-8 text-gray-300" />
                         </div>
                         <p>Waiting for submission...</p>
                     </div>
                 )}

                 {validating && (
                     <div className="h-full flex flex-col items-center justify-center space-y-4">
                         <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full"></div>
                         <p className="text-sm text-gray-500 animate-pulse">Running test cases & linting...</p>
                     </div>
                 )}

                 {result && (
                     <div className="animate-fade-in">
                         <div className={`p-4 rounded-lg mb-6 flex items-center ${result.passed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                             {result.passed ? <CheckCircle className="h-6 w-6 mr-3" /> : <AlertTriangle className="h-6 w-6 mr-3" />}
                             <div>
                                 <h4 className="font-bold">{result.passed ? 'Approved' : 'Changes Requested'}</h4>
                                 <p className="text-sm opacity-90">{result.passed ? 'Ready for production.' : 'Does not meet engineering standards.'}</p>
                             </div>
                         </div>
                         
                         <div className="prose prose-sm prose-slate max-w-none">
                             <h4 className="font-serif text-lg font-medium text-contrast">Detailed Feedback</h4>
                             <ReactMarkdown>{result.feedback}</ReactMarkdown>
                         </div>
                     </div>
                 )}
             </div>
        </div>
      </div>
    </div>
  );
};