import { useState, FC, FormEvent } from 'react';
import { Button } from '../components/Button';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { dbService } from '../services/dbService';
import { User } from '../types';
import Beams from '../components/Beams';
import { useTheme } from '../providers/ThemeProvider';

interface LoginProps {
  onLogin: (user: User) => void;
  onBack: () => void;
  onGoToSignup: () => void;
}

export const Login: FC<LoginProps> = ({ onLogin, onBack, onGoToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const lightBeamBg = '#ffffff';
  const lightDiffuse = '#ffffff';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    // Helper function to add timeout to any promise
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out. Please check your internet connection and try again.')), ms)
        ),
      ]);
    };

    try {
      // Add 15 second timeout to prevent infinite loading
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        15000
      );

      if (authError) throw authError;

      if (authData.user) {
        // Add 10 second timeout for profile fetch
        const userProfile = await withTimeout(
          dbService.getOrCreateUser(
            authData.user.email || '', 
            authData.user.user_metadata?.full_name || 'User',
            authData.user.id
          ),
          10000
        );

        if (userProfile) {
          onLogin(userProfile);
        } else {
          throw new Error("Could not retrieve user profile. Database may be unavailable.");
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.message?.includes("Invalid login credentials")) {
        setErrorMsg("Invalid credentials. If you just signed up, please check your email to confirm your account.");
      } else if (err.message?.includes("timed out")) {
        setErrorMsg("Connection timed out. Supabase may be paused or unreachable. Please try again.");
      } else if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setErrorMsg("Network error. Please check your internet connection.");
      } else {
        setErrorMsg(err.message || "Failed to login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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
        setErrorMsg(err.message || "Failed to initiate Google Login.");
      }
    }
  };

  return (
    <div
      className={`min-h-screen w-full relative flex items-center justify-center p-6 overflow-hidden font-sans ${
        isDark ? 'bg-[#0A0A0A] text-white' : 'bg-white text-gray-900'
      }`}
    >
      {/* Beams canvas for both themes */}
      {isDark && (
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
            backgroundColor="#000000"
            diffuseColor="#000000"
          />
        </div>
      )}
      
      {/* Ambient Background overlays */}
      {isDark ? (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob"></div>
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-2000"></div>
          <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-indigo-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-4000"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.2 }}></div>
        </div>
      ) : null}
      
      {/* Glass Card */}
      <div
        className={`w-full max-w-md backdrop-blur-xl shadow-2xl rounded-2xl p-8 sm:p-10 relative z-10 animate-fade-in-up border ${
          isDark
            ? 'bg-black/40 border-white/10'
            : 'bg-white/80 border-white/80 shadow-blue-500/10'
        }`}
      >
        
        <div className="text-center mb-8">
            <h1 className={`font-serif text-3xl font-bold tracking-tight mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Welcome Back</h1>
            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>Mastery awaits. Log in to continue.</p>
        </div>

        {errorMsg && (
          <div
            className={`mb-6 p-3 text-sm rounded-lg flex items-center text-left border ${
              isDark
                ? 'bg-red-900/20 border-red-800 text-red-200'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <AlertCircle className={`h-4 w-4 mr-2 flex-shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-gray-200' : 'text-gray-700'}`} htmlFor="email">Email address</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className={`h-4 w-4 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                    </div>
                    <input 
                        type="email" 
                        id="email"
                        required
                        className={`block w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none ${
                          isDark
                            ? 'border-neutral-700 bg-neutral-800 text-white placeholder-gray-500'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                        }`}
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
            </div>
            
            <div>
                <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-gray-200' : 'text-gray-700'}`} htmlFor="password">Password</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className={`h-4 w-4 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                    </div>
                    <input 
                        type="password" 
                        id="password"
                        required
                        className={`block w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none ${
                          isDark
                            ? 'border-neutral-700 bg-neutral-800 text-white placeholder-gray-500'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                        }`}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
            </div>

            <Button 
                type="submit" 
                isLoading={isLoading}
                className={`w-full h-11 border-none shadow-lg ${
                  isDark
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-400/30'
                }`}
            >
                Log In
            </Button>
        </form>

        <div className="mt-6">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className={`w-full border-t ${isDark ? 'border-neutral-700' : 'border-gray-200'}`}></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className={`px-2 bg-transparent ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Or continue with</span>
                </div>
            </div>

            <button 
                type="button"
                onClick={handleGoogleLogin}
                className={`mt-6 w-full flex items-center justify-center gap-3 px-4 py-2.5 border rounded-lg shadow-sm text-sm font-medium transition-all ${
                  isDark
                    ? 'border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
            >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Log in with Google
            </button>
        </div>

        <div className="mt-6 text-center">
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Don't have an account? <button onClick={onGoToSignup} className={`${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'} font-semibold hover:underline`}>Sign up</button>
            </p>
        </div>
      </div>
    </div>
  );
};