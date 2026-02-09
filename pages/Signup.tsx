import { useState, FC, FormEvent } from 'react';
import { Button } from '../components/Button';
import { ArrowLeft, Mail, Lock, User as UserIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { dbService } from '../services/dbService';
import { User } from '../types';
import Beams from '../components/Beams';
import { useTheme } from '../providers/ThemeProvider';

interface SignupProps {
  onSignupSuccess: (user: User) => void;
  onBack: () => void;
  onGoToLogin: () => void;
}

export const Signup: FC<SignupProps> = ({ onSignupSuccess, onBack, onGoToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { theme } = useTheme();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      setErrorMsg("You must agree to the Terms and Conditions to continue.");
      return;
    }
    
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user && authData.session) {
        const userProfile = await dbService.getOrCreateUser(
          email, 
          fullName, 
          authData.user.id
        );

        if (userProfile) {
          onSignupSuccess(userProfile);
        } else {
          throw new Error("Account created, but profile setup failed.");
        }

      } else if (authData.user && !authData.session) {
        await dbService.getOrCreateUser(email, fullName, authData.user.id);

        setIsLoading(false);
        setSuccessMsg("Account created successfully! Please check your email to confirm your account before logging in.");
      }

    } catch (err: any) {
      setErrorMsg(err.message || "Failed to sign up");
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (!agreedToTerms) {
      setErrorMsg("You must agree to the Terms and Conditions to continue.");
      return;
    }
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
    } catch (err: any) {
      if (err.message?.includes('Unsupported provider') || err.message?.includes('provider is not enabled')) {
        setErrorMsg("Google Sign-In is not enabled in the Supabase Dashboard. Please enable it in Authentication > Providers.");
      } else {
        setErrorMsg(err.message || "Failed to initiate Google Sign-Up.");
      }
    }
  };

  if (successMsg) {
      return (
        <div className="min-h-screen relative flex items-center justify-center p-4 bg-[#0A0A0A] font-sans overflow-hidden">
            {theme === 'dark' && (
              <div className="absolute inset-0 z-0">
                <Beams
                  beamWidth={2}
                  beamHeight={15}
                  beamNumber={12}
                  lightColor="#ffffff"
                  speed={2}
                  noiseIntensity={1.75}
                  scale={0.2}
                  rotation={0}
                />
              </div>
            )}
            <div className="w-full max-w-md bg-neutral-900 border border-green-900/50 shadow-xl rounded-2xl p-10 text-center animate-fade-in-up">
                <div className="mx-auto w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mb-6 text-green-500">
                    <CheckCircle className="w-8 h-8" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-white mb-4">Check your inbox</h2>
                <p className="text-gray-400 mb-8 leading-relaxed">
                    We've sent a confirmation link to <strong>{email}</strong>.<br/>
                    Please verify your email to access your account.
                </p>
                <Button onClick={onGoToLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white border-none">
                    Proceed to Login
                </Button>
            </div>
        </div>
      )
  }

  return (
    <div className="min-h-screen w-full bg-[#0A0A0A] relative flex items-center justify-center p-4 overflow-hidden font-sans">
      {theme === 'dark' && (
        <div className="absolute inset-0 z-0">
          <Beams
            beamWidth={2}
            beamHeight={15}
            beamNumber={12}
            lightColor="#ffffff"
            speed={2}
            noiseIntensity={1.75}
            scale={0.2}
            rotation={0}
          />
        </div>
      )}
      
      {/* Animated Ambient Background - Adjusted for Dark Mode */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
         <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob"></div>
         <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-2000"></div>
         <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-indigo-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-4000"></div>
         
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
         {/* Grid Pattern */}
         <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.2 }}></div>
      </div>

      <div className="absolute top-6 left-6 z-20">
        <button 
          onClick={onBack}
          className="flex items-center text-gray-400 hover:text-white transition-colors group text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>
      </div>

      {/* Glass Card - Dark Theme */}
      <div className="w-full max-w-md bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl rounded-2xl p-8 sm:p-10 relative z-10 animate-fade-in-up">
        
        <div className="text-center mb-8">
            <h1 className="font-serif text-3xl font-bold text-white tracking-tight mb-2">Join Grow Wise</h1>
            <p className="text-gray-400">Start bridging your knowledge gaps today.</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 bg-red-900/20 border border-red-800 text-red-200 text-sm rounded-lg flex items-center text-left">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-200 mb-1.5" htmlFor="fullname">Full Name</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                        type="text" 
                        id="fullname"
                        required
                        className="block w-full pl-10 pr-3 py-2.5 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-neutral-800 text-white placeholder-gray-500 transition-all outline-none"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-200 mb-1.5" htmlFor="email">Email address</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                        type="email" 
                        id="email"
                        required
                        className="block w-full pl-10 pr-3 py-2.5 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-neutral-800 text-white placeholder-gray-500 transition-all outline-none"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-200 mb-1.5" htmlFor="password">Password</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                        type="password" 
                        id="password"
                        required
                        minLength={6}
                        className="block w-full pl-10 pr-3 py-2.5 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-neutral-800 text-white placeholder-gray-500 transition-all outline-none"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-start">
               <div className="flex items-center h-5">
                 <input
                   id="terms"
                   name="terms"
                   type="checkbox"
                   required
                   checked={agreedToTerms}
                   onChange={(e) => setAgreedToTerms(e.target.checked)}
                   className="h-4 w-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 cursor-pointer accent-blue-600"
                 />
               </div>
               <div className="ml-3 text-sm">
                 <label htmlFor="terms" className="font-medium text-gray-400">
                   I agree to the <a href="#" className="text-blue-400 underline hover:text-blue-300">Terms and Conditions</a> and <a href="#" className="text-blue-400 underline hover:text-blue-300">Privacy Policy</a>.
                 </label>
               </div>
            </div>

            <Button 
                type="submit" 
                isLoading={isLoading}
                disabled={!agreedToTerms}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 h-11 mt-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
            >
                Create Account
            </Button>
        </form>

        <div className="mt-6">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-transparent text-gray-500">Or continue with</span>
                </div>
            </div>

            <button 
                type="button"
                onClick={handleGoogleSignup}
                disabled={!agreedToTerms}
                className="mt-6 w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-neutral-700 rounded-lg shadow-sm bg-neutral-800 text-sm font-medium text-white hover:bg-neutral-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign up with Google
            </button>
        </div>

        <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
                Already have an account? <button onClick={onGoToLogin} className="text-blue-500 font-semibold hover:text-blue-400 hover:underline">Log in</button>
            </p>
        </div>
      </div>
    </div>
  );
};