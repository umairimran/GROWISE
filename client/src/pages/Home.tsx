import { FC } from 'react';
import { ArrowRight, CheckCircle, Zap, Target, BookOpen, Star } from 'lucide-react';
import { Button } from '../components/Button';
import { User } from '../types';
import Cubes from '../components/Cubes';

interface HomeProps {
  onStart: () => void;
  onLoginClick?: () => void;
  user?: User | null;
  onDashboardClick?: () => void;
  onBlogClick?: () => void;
  onLogout?: () => void;
  onDemoClick?: () => void;
}

const testimonials = [
  { name: "Sarah Chen", role: "Senior Frontend Dev", quote: "I skipped 40 hours of basic React tutorials. Grow Wise took me straight to Concurrency and Suspense." },
  { name: "Marcus J.", role: "Backend Engineer", quote: "The validator is brutal. It flagged my O(n^2) sort immediately. Exactly the feedback I needed." },
  { name: "Elena R.", role: "Full Stack Dev", quote: "Finally, a course that respects my time. The adaptive assessment is scary accurate." },
  { name: "David Kim", role: "CTO @ Startup", quote: "We use this to screen candidates now. The knowledge graph is better than any resume." },
  { name: "James T.", role: "DevOps Engineer", quote: "The infrastructure modules generated were spot on. No fluff, just hard skills." },
  { name: "Priya P.", role: "Data Scientist", quote: "Loved how it adapted to my Python knowledge and focused purely on advanced pandas optimization." }
];

export const Home: FC<HomeProps> = ({ onStart, user, onDashboardClick, onBlogClick, onDemoClick }) => {

  return (
    <div className="font-sans overflow-x-hidden pt-16">

      {/* --- HERO SECTION --- */}
      <section className="relative pt-20 pb-20 px-4 sm:px-6 lg:px-8 text-center max-w-7xl mx-auto min-h-[80vh] flex flex-col justify-center items-center overflow-hidden">

        {/* Animated Cubes Background */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-10" style={{ background: 'radial-gradient(circle at center, transparent 30%, rgb(var(--background)) 80%)' }}></div>

          <div className="opacity-80 scale-110 transform">
            <Cubes
              gridSize={8}
              maxAngle={25}
              radius={5}
              borderStyle="1px solid rgba(200, 200, 200, 0.4)"
              faceColor="rgba(255, 255, 255, 0.4)"
              rippleColor="#3B82F6"
              rippleSpeed={1.5}
              autoAnimate={true}
              rippleOnClick={true}
            />
          </div>
        </div>

        <div className="relative z-20 animate-fade-in-up">
          <div className="inline-flex items-center px-3 py-1 rounded-full border border-blue-200 bg-white/80 dark:bg-black/50 backdrop-blur-sm text-blue-700 dark:text-blue-400 text-xs font-medium mb-6 animate-fade-in-up delay-100 shadow-sm">
            <Zap className="w-3 h-3 mr-2" />
            AI-Powered Skill Validation v2.0
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl md:text-8xl font-medium text-contrast mb-8 leading-[1.1] tracking-tight animate-fade-in-up delay-200 drop-shadow-sm">
            The End of <br />
            <span className="text-gray-400">Cookie-Cutter Courses.</span>
          </h1>

          <p className="text-lg md:text-2xl text-gray-600 dark:text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-300 px-4">
            Stop relearning what you already know. Our AI assesses your actual skill level, then generates a custom curriculum just to fill the gaps.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-400 w-full sm:w-auto px-4">
            {user ? (
              <Button size="lg" onClick={onDashboardClick} className="w-full sm:w-auto shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-105 transition-all duration-300 text-lg h-14 px-8">
                Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            ) : (
              <Button size="lg" onClick={onStart} className="w-full sm:w-auto shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-105 transition-all duration-300 text-lg h-14 px-8">
                Take Free Assessment <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            )}

            <Button size="lg" variant="secondary" onClick={onDemoClick} className="w-full sm:w-auto h-14 px-8 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
              View Demo
            </Button>
          </div>
        </div>
      </section>

      {/* --- FEATURES SECTION --- */}
      <section className="py-16 md:py-24 px-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: Target,
              color: 'text-accent',
              bg: 'bg-blue-50 dark:bg-blue-900/20',
              title: 'Adaptive Assessment',
              desc: 'A 50-minute rigorous exam that adapts to your answers. We find exactly where your knowledge breaks down.'
            },
            {
              icon: BookOpen,
              color: 'text-purple-600 dark:text-purple-400',
              bg: 'bg-purple-50 dark:bg-purple-900/20',
              title: 'Precision Curriculum',
              desc: 'Gemini 1.5 Pro generates a unique syllabus. If you know Loops, we skip them. If you do not know Recursion, we teach it.'
            },
            {
              icon: Zap,
              color: 'text-green-600 dark:text-green-400',
              bg: 'bg-green-50 dark:bg-green-900/20',
              title: 'Real-World Validator',
              desc: 'Prove your skills in a simulated work scenario. The AI acts as your Senior Dev and grades your code quality.'
            }
          ].map((feature, i) => (
            <div key={i} className={`bg-surface p-8 rounded-3xl border border-border shadow-soft flex flex-col h-full hover:scale-[1.02] hover:shadow-lg transition-all duration-500 opacity-0 animate-fade-in-up`} style={{ animationDelay: `${(i + 1) * 200}ms` }}>
              <div className={`h-14 w-14 ${feature.bg} rounded-2xl flex items-center justify-center ${feature.color} mb-6`}>
                <feature.icon className="h-7 w-7" />
              </div>
              <h3 className="font-serif text-2xl font-medium mb-3 text-contrast">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 flex-1 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --- TESTIMONIALS SECTION --- */}
      <section id="testimonials" className="py-24 md:py-32 bg-surface border-t border-border overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 mb-16 opacity-0 animate-fade-in-up delay-200">
          <h2 className="font-serif text-3xl md:text-5xl font-medium text-center text-contrast">Loved by Builders</h2>
        </div>

        {/* Marquee Container */}
        <div className="relative w-full overflow-hidden opacity-0 animate-fade-in-up delay-300">
          <div className="flex w-max animate-scroll">
            {[...testimonials, ...testimonials, ...testimonials].map((t, i) => (
              <div key={i} className="w-[300px] md:w-[450px] bg-background p-8 md:p-10 rounded-3xl border border-border shadow-sm mx-4 md:mx-6 hover:border-accent/30 transition-colors flex-shrink-0">
                <div className="flex items-center space-x-1 mb-6 text-amber-400">
                  {[1, 2, 3, 4, 5].map(s => <Star key={s} className="h-4 w-4 fill-current" />)}
                </div>
                <p className="text-lg md:text-xl text-gray-800 dark:text-gray-200 font-medium mb-8 leading-relaxed font-serif whitespace-normal">"{t.quote}"</p>
                <div className="flex items-center">
                  <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-500 dark:text-gray-300 mr-4">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-contrast text-lg">{t.name}</div>
                    <div className="text-sm text-gray-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute top-0 left-0 h-full w-16 md:w-32 bg-gradient-to-r from-surface to-transparent pointer-events-none z-10"></div>
          <div className="absolute top-0 right-0 h-full w-16 md:w-32 bg-gradient-to-l from-surface to-transparent pointer-events-none z-10"></div>
        </div>
      </section>

      {/* --- PRICING SECTION --- */}
      <section id="pricing" className="py-24 md:py-32 px-4 max-w-7xl mx-auto">
        <h2 className="font-serif text-3xl md:text-5xl font-medium text-center mb-16 md:mb-20 text-contrast opacity-0 animate-fade-in-up">Simple, Flat Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">

          {/* Free Tier */}
          <div className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col hover:shadow-xl transition-all duration-300 opacity-0 animate-fade-in-up delay-200 group order-2 md:order-1">
            <div className="mb-6">
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">Starter</span>
            </div>
            <div className="text-5xl font-serif font-bold mb-3 text-slate-900 dark:text-white">$0</div>
            <p className="text-slate-600 dark:text-slate-400 mb-10 text-base">Forever free for basic assessments.</p>
            <ul className="space-y-5 mb-10 flex-1">
              <li className="flex items-start text-sm text-slate-600 dark:text-slate-400"><CheckCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3 shrink-0" /> 1 Assessment / Month</li>
              <li className="flex items-start text-sm text-slate-600 dark:text-slate-400"><CheckCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3 shrink-0" /> Basic Knowledge Graph</li>
              <li className="flex items-start text-sm text-slate-600 dark:text-slate-400"><CheckCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3 shrink-0" /> Public Profile</li>
            </ul>
            <Button variant="secondary" className="w-full h-12" onClick={user ? onDashboardClick : onStart}>
              {user ? "Go to Dashboard" : "Start Free"}
            </Button>
          </div>

          {/* Pro Tier */}
          <div className="bg-slate-900 p-8 md:p-10 rounded-3xl border-2 border-blue-600 shadow-2xl shadow-blue-900/20 flex flex-col relative transform md:-translate-y-6 opacity-0 animate-fade-in-up delay-300 z-10 order-1 md:order-2">
            <div className="absolute top-0 right-0 left-0 -mt-4 flex justify-center">
              <span className="bg-blue-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">Most Popular</span>
            </div>
            <div className="mb-6 mt-2">
              <span className="bg-blue-900/40 text-blue-300 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase">Pro</span>
            </div>
            <div className="text-5xl font-serif font-bold mb-3 text-white">$15<span className="text-xl text-gray-400 font-sans font-normal">/mo</span></div>
            <p className="text-gray-300 mb-10 text-base">For serious developers bridging gaps.</p>
            <ul className="space-y-5 mb-10 flex-1">
              <li className="flex items-start text-sm text-gray-300"><CheckCircle className="h-5 w-5 text-blue-500 mr-3 shrink-0" /> Unlimited Assessments</li>
              <li className="flex items-start text-sm text-gray-300"><CheckCircle className="h-5 w-5 text-blue-500 mr-3 shrink-0" /> <strong>AI Curriculum Generation</strong></li>
              <li className="flex items-start text-sm text-gray-300"><CheckCircle className="h-5 w-5 text-blue-500 mr-3 shrink-0" /> Real-World Validator Project</li>
              <li className="flex items-start text-sm text-gray-300"><CheckCircle className="h-5 w-5 text-blue-500 mr-3 shrink-0" /> AI Tutor Chat Access</li>
            </ul>
            <Button variant="primary" className="w-full h-12 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all" onClick={user ? onDashboardClick : onStart}>
              {user ? "Go to Dashboard" : "Get Started"}
            </Button>
          </div>

          {/* Enterprise Tier */}
          <div className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col hover:shadow-xl transition-all duration-300 opacity-0 animate-fade-in-up delay-400 order-3">
            <div className="mb-6">
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase">Team</span>
            </div>
            <div className="text-5xl font-serif font-bold mb-3 text-slate-900 dark:text-white">$99<span className="text-xl text-slate-500 dark:text-slate-400 font-sans font-normal">/seat</span></div>
            <p className="text-slate-600 dark:text-slate-400 mb-10 text-base">Scale your engineering team.</p>
            <ul className="space-y-5 mb-10 flex-1">
              <li className="flex items-start text-sm text-slate-600 dark:text-slate-400"><CheckCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3 shrink-0" /> Team Dashboards</li>
              <li className="flex items-start text-sm text-slate-600 dark:text-slate-400"><CheckCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3 shrink-0" /> Custom Skill Tracks</li>
              <li className="flex items-start text-sm text-slate-600 dark:text-slate-400"><CheckCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3 shrink-0" /> SSO & Admin Controls</li>
            </ul>
            <Button variant="secondary" className="w-full h-12">Contact Sales</Button>
          </div>
        </div>
      </section>

      {/* --- CTA SECTION --- */}
      <section className="py-24 md:py-32 px-4 text-center bg-gray-50 dark:bg-gray-900/50 border-t border-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-accent rounded-full filter blur-[100px] animate-pulse-slow"></div>
        </div>
        <div className="relative z-10 opacity-0 animate-fade-in-up">
          <h2 className="font-serif text-3xl md:text-6xl font-medium text-contrast mb-8 tracking-tight">Stop Relearning. Start Growing.</h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-12 max-w-xl mx-auto">
            Your time is your most valuable asset. Don't waste it on tutorials you don't need.
          </p>
          <Button size="lg" onClick={user ? onDashboardClick : onStart} className="shadow-2xl shadow-blue-500/30 transform hover:scale-110 transition-transform duration-300 h-16 px-10 text-lg w-full sm:w-auto">
            {user ? (
              <>Go to Dashboard <ArrowRight className="ml-2 h-6 w-6" /></>
            ) : (
              <>Start 50-min Assessment <ArrowRight className="ml-2 h-6 w-6" /></>
            )}
          </Button>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer id="contact" className="flex flex-col md:flex-row min-h-[500px]">
        {/* Left: Image (70%) */}
        <div className="md:w-[70%] relative bg-gray-900 overflow-hidden min-h-[300px] flex items-center justify-center group order-2 md:order-1">
          <div className="absolute inset-0 bg-gray-900 transition-transform duration-[20s] ease-linear group-hover:scale-110" style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, #2a2a2a 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            opacity: 0.5
          }}></div>
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>

          <div className="relative z-10 text-center">
            <h1 className="font-serif text-6xl md:text-[12rem] font-bold text-white opacity-[0.03] tracking-tighter select-none leading-none animate-pulse-slow">
              GROW
            </h1>
            <h1 className="font-serif text-6xl md:text-[12rem] font-bold text-white opacity-[0.03] tracking-tighter select-none leading-none -mt-4 md:-mt-10 animate-pulse-slow delay-700">
              WISE
            </h1>
          </div>

          <div className="absolute bottom-8 left-8 md:bottom-16 md:left-16 z-20">
            <div className="font-serif text-2xl md:text-4xl font-bold text-white mb-2 md:mb-3">Grow Wise</div>
            <p className="text-gray-400 max-w-md text-base md:text-xl">Mastery, minus the redundancy.</p>
          </div>
        </div>

        {/* Right: Links (30%) */}
        <div className="md:w-[30%] bg-[#1A1A1A] text-white p-10 md:p-16 flex flex-col justify-between border-l border-gray-800 order-1 md:order-2">
          <div className="grid grid-cols-2 gap-10">
            <div className="opacity-0 animate-fade-in-up delay-200">
              <h4 className="font-bold mb-6 md:mb-8 text-gray-500 text-xs uppercase tracking-[0.2em]">Platform</h4>
              <ul className="space-y-4 md:space-y-5 text-sm text-gray-300">
                <li><button className="hover:text-white transition-colors hover:underline decoration-accent underline-offset-4 text-left">Assessment Engine</button></li>
                <li><button className="hover:text-white transition-colors hover:underline decoration-accent underline-offset-4 text-left">Curriculum AI</button></li>
                <li><button className="hover:text-white transition-colors hover:underline decoration-accent underline-offset-4 text-left">Enterprise</button></li>
              </ul>
            </div>
            <div className="opacity-0 animate-fade-in-up delay-300">
              <h4 className="font-bold mb-6 md:mb-8 text-gray-500 text-xs uppercase tracking-[0.2em]">Company</h4>
              <ul className="space-y-4 md:space-y-5 text-sm text-gray-300">
                <li><button className="hover:text-white transition-colors hover:underline decoration-accent underline-offset-4 text-left">About</button></li>
                <li><button onClick={onBlogClick} className="hover:text-white transition-colors hover:underline decoration-accent underline-offset-4 text-left">Blog</button></li>
                <li><button className="hover:text-white transition-colors hover:underline decoration-accent underline-offset-4 text-left">Careers</button></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 md:mt-16 opacity-0 animate-fade-in-up delay-400">
            <h4 className="font-bold mb-6 text-gray-500 text-xs uppercase tracking-[0.2em]">Stay Updated</h4>
            <div className="flex gap-3">
              <input type="email" placeholder="email@example.com" className="bg-gray-800 border-none rounded-xl text-sm px-5 py-4 w-full focus:ring-1 focus:ring-accent text-white placeholder-gray-500 transition-all outline-none" />
              <button className="bg-accent text-white px-5 py-4 rounded-xl font-medium hover:bg-blue-600 transition-colors transform hover:scale-105 active:scale-95">→</button>
            </div>
            <div className="mt-10 text-xs text-gray-600">
              &copy; 2024 Grow Wise Inc. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};