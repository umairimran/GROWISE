import { FC, useEffect, useState } from 'react';
import { AssessmentResult, User } from '../types';
import { Button } from '../components/Button';
import { dbService } from '../services/dbService';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { Check, AlertTriangle, TrendingUp, MoreHorizontal, ArrowRight, PlayCircle, Sparkles } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';

interface DashboardProps {
  user: User | null;
  result: AssessmentResult | null;
  onGenerateCourse: () => void;
  isGenerating: boolean;
  onStartAssessment: () => void;
}

// Mock Data for Activity Graph
const activityData = [
  { name: 'Day 1', xp: 400 },
  { name: 'Day 5', xp: 700 },
  { name: 'Day 10', xp: 500 },
  { name: 'Day 15', xp: 1200 },
  { name: 'Day 20', xp: 1800 },
  { name: 'Day 25', xp: 2400 },
  { name: 'Day 30', xp: 3100 },
];

export const Dashboard: FC<DashboardProps> = ({ user, result, onGenerateCourse, isGenerating, onStartAssessment }) => {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const { theme } = useTheme();
  
  // Determine dark mode state for Charts
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Smart Dashboard Logic
  useEffect(() => {
    const checkOnboardingStatus = async () => {
        if (!user) return;
        
        // If we already have a result passed from App state, we don't need to check DB.
        if (result) {
            setCheckingStatus(false);
            return;
        }

        try {
            // 1. Check Skip Flag (Client Side Preference)
            // If they skipped, they are allowed on the dashboard.
            const skipped = localStorage.getItem(`gw_skip_${user.id}`);
            if (skipped) {
                setCheckingStatus(false);
                return;
            }

            // 2. Check Database for Assessments (Server Side Check)
            // SELECT count(*) FROM assessments WHERE user_id = current_user
            const hasAssessment = await dbService.hasCompletedAssessment(user.id);
            if (hasAssessment) {
                setCheckingStatus(false);
            } else {
                // Scenario A: Count == 0 AND !SkipCookie -> Redirect
                onStartAssessment();
            }
        } catch (e) {
            console.error("Dashboard check failed", e);
            setCheckingStatus(false); // Fail safe: show dashboard
        }
    };

    checkOnboardingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (checkingStatus) {
      return (
          <div className="flex h-full items-center justify-center min-h-[50vh]">
              <div className="flex flex-col items-center">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
                  <p className="text-gray-500 text-sm">Synchronizing learning profile...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 h-auto lg:h-[calc(100vh-6rem)] pb-10">
      
      {/* Middle Column (Main Content) - Flexible Width */}
      <div className="flex-1 flex flex-col gap-6 lg:overflow-y-auto lg:pr-2 lg:pb-10 no-scrollbar">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end opacity-0 animate-fade-in-up delay-100 gap-2">
          <div>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
            <p className="text-sm lg:text-base text-slate-500 dark:text-gray-400 mt-1">{result ? "Overview of your learning momentum." : "Your personal skill hub."}</p>
          </div>
          <div className="text-xs lg:text-sm text-gray-400 font-mono">Updated 1m ago</div>
        </div>

        {/* Hero Widget: Active or Empty */}
        {result ? (
            <div className="bg-white dark:bg-[#111111] p-4 lg:p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft opacity-0 animate-fade-in-up delay-200 hover:shadow-md transition-all duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
                    <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Activity Volume</div>
                    <div className="flex items-baseline space-x-3">
                        <span className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">3,100 XP</span>
                        <span className="text-xs lg:text-sm font-medium text-green-600 dark:text-green-400 flex items-center bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full border border-green-100 dark:border-green-800 animate-pulse-slow">
                        <TrendingUp className="h-3 w-3 mr-1" /> +12%
                        </span>
                    </div>
                    </div>
                    <select className="bg-gray-50 dark:bg-zinc-800 border-none text-xs font-medium text-gray-600 dark:text-gray-300 rounded-lg py-1.5 px-3 focus:ring-0 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors w-full sm:w-auto">
                    <option>Last 30 Days</option>
                    <option>This Year</option>
                    </select>
                </div>
                
                <div className="h-[180px] lg:h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData}>
                        <defs>
                        <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        </defs>
                        <CartesianGrid 
                            strokeDasharray="3 3" 
                            vertical={false} 
                            stroke={isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0"} 
                        />
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af'}} 
                            dy={10} 
                            minTickGap={30} 
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af'}} 
                        />
                        <Tooltip 
                            contentStyle={{
                                borderRadius: '12px', 
                                border: isDark ? '1px solid #333' : 'none', 
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                backgroundColor: isDark ? '#1a1a1a' : '#fff',
                                color: isDark ? '#fff' : '#000'
                            }}
                            cursor={{stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '4 4'}}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="xp" 
                            stroke="#3B82F6" 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#colorXp)" 
                            animationDuration={1500} 
                        />
                    </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        ) : (
            // EMPTY STATE: Welcome Card
            <div className="bg-white dark:bg-[#111111] p-6 lg:p-10 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft flex flex-col items-center justify-center text-center py-12 lg:py-16 opacity-0 animate-fade-in-up delay-200">
                <div className="h-14 w-14 lg:h-16 lg:w-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                    <Sparkles className="h-7 w-7 lg:h-8 lg:w-8 text-accent" />
                </div>
                <h2 className="font-serif text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white mb-3">Welcome to Grow Wise</h2>
                <p className="text-sm lg:text-base text-slate-500 dark:text-gray-400 max-w-md mb-8 leading-relaxed">
                    You haven't taken your diagnostic test yet. Start an assessment to build your knowledge graph and personalized curriculum.
                </p>
                <Button onClick={onStartAssessment} size="lg" className="w-full sm:w-auto shadow-lg shadow-blue-500/20">
                    Start 50-min Assessment
                </Button>
            </div>
        )}

        {/* Skill Assessment Summary */}
        <div className="bg-white dark:bg-[#111111] p-4 lg:p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft flex-1 opacity-0 animate-fade-in-up delay-300">
           <div className="flex justify-between items-center mb-6">
             <h3 className="font-serif text-lg font-medium text-slate-900 dark:text-white">Active Skill Status</h3>
             <Button variant="ghost" size="sm" className="text-gray-400 hover:text-slate-900 dark:hover:text-white" disabled={!result}>Manage</Button>
           </div>
           
           {result ? (
               <div className="space-y-8">
                  {/* Current Assessment Result */}
                  <div className="group">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm shadow-sm group-hover:scale-110 transition-transform">
                          {result.topic.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white text-sm">{result.topic}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Assessment complete</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{result.score}%</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Mastery</div>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-accent rounded-full transition-all duration-1000 ease-out" style={{ width: '0%', animation: `growWidth 1s ease-out forwards 0.5s` }}>
                        <style>{`@keyframes growWidth { to { width: ${result.score}% } }`}</style>
                      </div>
                    </div>
                    
                    {/* Micro-insights */}
                    <div className="flex flex-wrap gap-2">
                       {result.weaknesses.slice(0, 2).map((w, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded border border-red-100 dark:border-red-900/30 flex items-center animate-fade-in" style={{ animationDelay: `${500 + (i * 100)}ms`}}>
                            <AlertTriangle className="h-3 w-3 mr-1" /> Needs Work: {w}
                          </span>
                       ))}
                       {result.strengths.slice(0, 2).map((s, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded border border-green-100 dark:border-green-900/30 flex items-center animate-fade-in" style={{ animationDelay: `${700 + (i * 100)}ms`}}>
                            <Check className="h-3 w-3 mr-1" /> Solid: {s}
                          </span>
                       ))}
                    </div>
                  </div>
               </div>
           ) : (
                // EMPTY STATE: Placeholders
                <div className="space-y-6 opacity-40 select-none grayscale dark:opacity-20">
                    {/* Fake Item 1 */}
                    <div className="group pointer-events-none">
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700"></div>
                                <div>
                                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1"></div>
                                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                </div>
                            </div>
                        </div>
                        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                    </div>
                    {/* Fake Item 2 */}
                    <div className="group pointer-events-none">
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700"></div>
                                <div>
                                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-1"></div>
                                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                </div>
                            </div>
                        </div>
                        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                    </div>
                    
                    <div className="flex justify-center mt-8">
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 dark:bg-zinc-800 dark:text-gray-400 px-3 py-1.5 rounded-full border border-gray-200 dark:border-zinc-700">
                            Complete assessment to view skills
                        </span>
                    </div>
                </div>
           )}
        </div>
      </div>

      {/* Right Column (Context/Actions) */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        
        {/* Recommended Next Steps */}
        {result ? (
            <div className="bg-[#1A1A1A] p-6 rounded-2xl text-white shadow-lg relative overflow-hidden group opacity-0 animate-fade-in-up delay-400 hover:shadow-2xl transition-all border border-gray-800">
                {/* Abstract ambient glow */}
                <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-blue-500 rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                
                <h3 className="font-serif text-lg font-medium mb-3 relative z-10">AI Insight</h3>
                <p className="text-sm text-gray-300 mb-6 leading-relaxed relative z-10 border-l-2 border-blue-500 pl-3">
                    Your logic in <strong>{result.topic}</strong> is sound, but you have a critical gap in <em>{result.weaknesses[0] || "Advanced Patterns"}</em>.
                </p>
                
                <Button 
                    onClick={onGenerateCourse}
                    isLoading={isGenerating}
                    variant="secondary"
                    className="w-full justify-between group relative z-10 bg-white text-slate-900 hover:bg-gray-100 border-none h-12"
                >
                    {isGenerating ? 'Architecting...' : 'Generate Fix'}
                    {!isGenerating && <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                </Button>
            </div>
        ) : (
            // EMPTY STATE: Insight
            <div className="bg-white dark:bg-[#111111] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft opacity-0 animate-fade-in-up delay-400">
                <h3 className="font-serif text-lg font-medium mb-3 text-gray-400 dark:text-gray-500">AI Insight</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 leading-relaxed">
                  No data available for analysis. Complete an assessment to receive personalized insights.
                </p>
                <Button variant="secondary" disabled className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-300 dark:text-gray-600 border-gray-100 dark:border-zinc-700 cursor-not-allowed">
                  Generate Fix
                </Button>
            </div>
        )}

        {/* Active Courses List */}
        {result ? (
            <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft flex-1 opacity-0 animate-fade-in-up delay-500">
            <h3 className="font-serif text-sm font-bold mb-4 text-gray-500 dark:text-gray-400 uppercase tracking-wide">Watchlist</h3>
            <div className="space-y-3">
                <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl hover:bg-white dark:hover:bg-zinc-800 hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-zinc-700 group">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">COURSE</span>
                    <MoreHorizontal className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-1 truncate">Advanced React Patterns</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Module 3 • 12m left</p>
                <div className="w-full bg-gray-200 dark:bg-zinc-700 h-1 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full w-2/3"></div>
                </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl hover:bg-white dark:hover:bg-zinc-800 hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-zinc-700 group">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">PROJECT</span>
                </div>
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-1 truncate">E-Commerce API Validator</h4>
                <div className="flex items-center text-xs font-medium text-amber-600 dark:text-amber-500 mt-2">
                    <PlayCircle className="h-3 w-3 mr-1" /> Resume Submission
                </div>
                </div>
            </div>
            </div>
        ) : (
            // EMPTY STATE: Watchlist
            <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft flex-1 opacity-0 animate-fade-in-up delay-500 flex flex-col items-center justify-center text-center min-h-[150px]">
                 <h3 className="font-serif text-sm font-bold mb-4 text-gray-400 dark:text-gray-500 uppercase tracking-wide">Watchlist</h3>
                 <p className="text-xs text-gray-400 dark:text-gray-500">Your generated courses will appear here.</p>
            </div>
        )}

        {/* Mini Radar Context */}
        {result && (
            <div className="bg-white dark:bg-[#111111] p-4 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft h-[200px] flex flex-col opacity-0 animate-fade-in-up delay-700">
                <h3 className="font-serif text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wide">Topology</h3>
                <div className="flex-1 w-full min-h-0 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={result.knowledgeGraph}>
                    <PolarGrid stroke={isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0"} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 9 }} />
                    <Radar
                        name="Skill Level"
                        dataKey="A"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fill="#3B82F6"
                        fillOpacity={0.2}
                        animationDuration={1500}
                    />
                    </RadarChart>
                </ResponsiveContainer>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};